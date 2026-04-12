import { useCallback, useEffect, useRef, useState } from 'react';
import { startMicCapture, AudioPlaybackQueue, MicCapture } from '../utils/voiceAudio';
import { getVoiceWsUrl } from '../config/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoiceState =
    | 'idle'        // disconnected
    | 'connecting'  // WS opening + mic permission in progress
    | 'listening'   // session live, waiting for user to speak
    | 'thinking'    // speech ended, waiting for first AI response chunk
    | 'speaking'    // receiving and playing AI audio
    | 'error';      // unrecoverable error (shows message + retry)

export interface TranscriptTurn {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    done: boolean;
}

export interface UseVoiceChatResult {
    state: VoiceState;
    transcript: TranscriptTurn[];
    errorMessage: string | null;
    connect: () => void;
    disconnect: () => void;
    interruptNow: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// RMS amplitude above which we consider the mic active during AI playback.
const BARGE_IN_RMS_THRESHOLD = 0.025;
// Consecutive high-energy chunks required before triggering local barge-in.
const BARGE_IN_CHUNK_COUNT = 3;

let _turnCounter = 0;
const newTurnId = () => `t${++_turnCounter}-${Date.now()}`;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVoiceChat(): UseVoiceChatResult {
    const [state, setState] = useState<VoiceState>('idle');
    const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Refs for values accessed inside WS callbacks (avoids stale closures).
    const stateRef = useRef<VoiceState>('idle');
    const wsRef = useRef<WebSocket | null>(null);
    const micRef = useRef<MicCapture | null>(null);
    const playbackRef = useRef<AudioPlaybackQueue>(new AudioPlaybackQueue());
    const bargeInCountRef = useRef(0);

    const setVoiceState = useCallback((next: VoiceState) => {
        stateRef.current = next;
        setState(next);
    }, []);

    // ---------------------------------------------------------------------------
    // Transcript helpers
    // ---------------------------------------------------------------------------

    const appendTurnDelta = useCallback((id: string, role: 'user' | 'assistant', delta: string) => {
        setTranscript(prev => {
            const existing = prev.find(t => t.id === id);
            if (existing) {
                return prev.map(t => t.id === id ? { ...t, text: t.text + delta } : t);
            }
            return [...prev, { id, role, text: delta, done: false }];
        });
    }, []);

    const finalizeTurn = useCallback((id: string, finalText?: string) => {
        setTranscript(prev =>
            prev.map(t =>
                t.id === id
                    ? { ...t, text: finalText ?? t.text, done: true }
                    : t,
            ),
        );
    }, []);

    // ---------------------------------------------------------------------------
    // Send helpers
    // ---------------------------------------------------------------------------

    const sendToBackend = useCallback((payload: object) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(payload));
        }
    }, []);

    const sendCancel = useCallback(() => {
        sendToBackend({ type: 'response.cancel' });
        playbackRef.current.stopNow();
    }, [sendToBackend]);

    // ---------------------------------------------------------------------------
    // Public: interruptNow — manual barge-in from the UI
    // ---------------------------------------------------------------------------

    const interruptNow = useCallback(() => {
        sendCancel();
        if (stateRef.current === 'speaking' || stateRef.current === 'thinking') {
            setVoiceState('listening');
        }
    }, [sendCancel, setVoiceState]);

    // ---------------------------------------------------------------------------
    // Public: disconnect
    // ---------------------------------------------------------------------------

    const disconnect = useCallback(() => {
        micRef.current?.stop();
        micRef.current = null;
        playbackRef.current.stopNow();
        if (wsRef.current) {
            wsRef.current.onclose = null; // suppress the auto-error on explicit close
            wsRef.current.close();
            wsRef.current = null;
        }
        setVoiceState('idle');
        setErrorMessage(null);
        // Intentionally keep transcript visible after disconnect so user can read it.
    }, [setVoiceState]);

    // ---------------------------------------------------------------------------
    // Public: connect
    // ---------------------------------------------------------------------------

    const connect = useCallback(() => {
        if (stateRef.current !== 'idle' && stateRef.current !== 'error') return;

        setVoiceState('connecting');
        setErrorMessage(null);
        setTranscript([]);
        bargeInCountRef.current = 0;

        // Kick off AudioContext unlock synchronously inside the click/gesture handler.
        // This satisfies iOS Safari's requirement that resume() is invoked during a user gesture.
        const unlockPromise = playbackRef.current.unlock().catch(() => { });

        // Async setup — runs after the current event handler but keeps mic+WS startup sequential.
        (async () => {
            await unlockPromise;

            // Request mic permission (must happen after a user gesture; getUserMedia propagates it).
            let mic: MicCapture;
            try {
                mic = await startMicCapture((base64, energy) => {
                    // Stream audio to backend as soon as WS is open.
                    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
                    sendToBackend({ type: 'input_audio_buffer.append', audio: base64 });

                    // Local barge-in: detect sustained speech energy while the AI is playing.
                    if (stateRef.current === 'speaking') {
                        if (energy > BARGE_IN_RMS_THRESHOLD) {
                            bargeInCountRef.current++;
                            if (bargeInCountRef.current >= BARGE_IN_CHUNK_COUNT) {
                                bargeInCountRef.current = 0;
                                sendCancel();
                                setVoiceState('listening');
                            }
                        } else {
                            bargeInCountRef.current = 0;
                        }
                    } else {
                        bargeInCountRef.current = 0;
                    }
                });
            } catch {
                setVoiceState('error');
                setErrorMessage('Microphone access denied. Allow mic permissions and retry.');
                return;
            }

            micRef.current = mic;

            // Open WebSocket after mic is confirmed.
            const ws = new WebSocket(getVoiceWsUrl());
            wsRef.current = ws;

            // Per-connection turn ID state (captured in closure; reset on each connect call).
            let assistantTurnId: string | null = null;
            let userTurnId: string | null = null;

            ws.onmessage = (ev: MessageEvent) => {
                let msg: { type: string;[k: string]: unknown };
                try { msg = JSON.parse(ev.data as string); } catch { return; }

                switch (msg.type) {
                    // Session handshake — signal that the session is live and ready for audio.
                    case 'session.created':
                    case 'session.updated':
                        setVoiceState('listening');
                        break;

                    // Server VAD: user started speaking.
                    case 'input_audio_buffer.speech_started':
                        bargeInCountRef.current = 0;
                        // Authoritative server-side barge-in while AI is playing.
                        if (stateRef.current === 'speaking') {
                            sendCancel();
                            setVoiceState('listening');
                        }
                        break;

                    // Server VAD: user stopped speaking; AI is about to respond.
                    case 'input_audio_buffer.speech_stopped':
                        if (stateRef.current === 'listening') {
                            setVoiceState('thinking');
                        }
                        break;

                    // AI response is starting.
                    case 'response.created':
                        assistantTurnId = newTurnId();
                        setVoiceState('thinking');
                        break;

                    // AI audio chunk — queue for gapless playback.
                    case 'response.audio.delta': {
                        const chunk = msg.delta as string | undefined;
                        if (chunk) {
                            if (stateRef.current !== 'speaking') setVoiceState('speaking');
                            playbackRef.current.enqueue(chunk);
                        }
                        break;
                    }

                    // AI transcript chunk — stream into the assistant turn bubble.
                    case 'response.audio_transcript.delta': {
                        const delta = msg.delta as string | undefined;
                        if (delta && assistantTurnId) {
                            appendTurnDelta(assistantTurnId, 'assistant', delta);
                        }
                        break;
                    }

                    // AI transcript is complete. Audio may still be queued locally.
                    case 'response.audio_transcript.done':
                        if (assistantTurnId) finalizeTurn(assistantTurnId);
                        break;

                    // Backend finished sending. Wait for local audio drain before switching to listening.
                    // This is the PRD requirement: response.done ≠ audio finished.
                    case 'response.done':
                        playbackRef.current.whenDrained(() => {
                            if (stateRef.current === 'speaking') setVoiceState('listening');
                        });
                        break;

                    // Current turn was interrupted or cancelled — stop audio immediately.
                    case 'response.cancelled':
                        playbackRef.current.stopNow();
                        if (stateRef.current === 'speaking' || stateRef.current === 'thinking') {
                            setVoiceState('listening');
                        }
                        break;

                    // Live user transcript delta (while user is speaking).
                    case 'conversation.item.input_audio_transcription.delta': {
                        const delta = msg.delta as string | undefined;
                        if (delta) {
                            if (!userTurnId) userTurnId = newTurnId();
                            appendTurnDelta(userTurnId, 'user', delta);
                        }
                        break;
                    }

                    // Final user transcript — replace accumulated deltas with confirmed text.
                    case 'conversation.item.input_audio_transcription.completed': {
                        const text = msg.transcript as string | undefined;
                        if (userTurnId) {
                            finalizeTurn(userTurnId, text);
                        }
                        userTurnId = null;
                        break;
                    }

                    // Backend closed the session (timeout, cost guard, etc.).
                    case 'session.closed':
                        disconnect();
                        break;

                    // Error from backend or relay.
                    case 'relay.error':
                    case 'error': {
                        const msg_ = ((msg.message ?? msg.error ?? 'Voice session error') as string);
                        setVoiceState('error');
                        setErrorMessage(String(msg_));
                        break;
                    }
                }
            };

            ws.onerror = () => {
                setVoiceState('error');
                setErrorMessage('Connection failed. Check that the voice service is running.');
            };

            ws.onclose = (ev: CloseEvent) => {
                micRef.current?.stop();
                micRef.current = null;
                if (stateRef.current !== 'idle' && stateRef.current !== 'error') {
                    if (!ev.wasClean) {
                        setVoiceState('error');
                        setErrorMessage('Voice connection dropped unexpectedly.');
                    }
                }
            };
        })();
    }, [setVoiceState, sendToBackend, sendCancel, appendTurnDelta, finalizeTurn, disconnect]);

    // ---------------------------------------------------------------------------
    // Cleanup on unmount
    // ---------------------------------------------------------------------------

    useEffect(() => {
        return () => {
            micRef.current?.stop();
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
            }
            playbackRef.current.destroy();
        };
    }, []);

    return { state, transcript, errorMessage, connect, disconnect, interruptNow };
}
