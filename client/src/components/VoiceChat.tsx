import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, X } from 'lucide-react';
import { useVoiceChat, VoiceState, TranscriptTurn } from '../hooks/useVoiceChat';
import { useTheme } from '../context/ThemeContext';

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

interface VoiceChatProps {
    onClose: () => void;
}

// ---------------------------------------------------------------------------
// Copy / label maps
// ---------------------------------------------------------------------------

const STATE_LABEL: Record<VoiceState, string> = {
    idle: 'Ready',
    connecting: 'Connecting…',
    listening: 'Listening',
    thinking: 'Thinking…',
    speaking: 'Speaking',
    error: 'Error',
};

const STATUS_HINT: Record<VoiceState, string> = {
    idle: '',
    connecting: 'Opening voice session…',
    listening: 'Speak naturally — VAD active',
    thinking: 'Processing your question…',
    speaking: 'Yubi is speaking — just speak or click interrupt to take over',
    error: 'Connection error',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const VoiceChat: React.FC<VoiceChatProps> = ({ onClose }) => {
    const { isDark } = useTheme();
    const { state, transcript, errorMessage, connect, disconnect, interruptNow } = useVoiceChat();
    const transcriptRef = useRef<HTMLDivElement>(null);

    // Connect on mount; disconnect on unmount.
    useEffect(() => {
        connect();
        return () => {
            disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-scroll transcript to newest turn.
    useEffect(() => {
        const el = transcriptRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [transcript]);

    const handleClose = () => {
        disconnect();
        onClose();
    };

    const handleRetry = () => {
        disconnect();
        // Small delay to let disconnect settle before reconnecting.
        window.setTimeout(connect, 120);
    };

    // ---------------------------------------------------------------------------
    // Design tokens — match the existing terminal palette
    // ---------------------------------------------------------------------------

    const panelBg = isDark ? 'rgba(11, 11, 15, 0.97)' : 'rgba(252, 248, 240, 0.97)';
    const headerBg = isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)';
    const borderCol = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)';
    const accentCol = isDark ? '#93c5fd' : '#2563eb';
    const textCol = isDark ? '#b0b3b8' : '#374151';
    const dimCol = isDark ? '#525560' : '#9ca3af';
    const errorCol = isDark ? '#ef4444' : '#dc2626';
    const userBubBg = isDark ? 'rgba(147,197,253,0.07)' : 'rgba(37,99,235,0.06)';
    const userBubBor = isDark ? 'rgba(147,197,253,0.13)' : 'rgba(37,99,235,0.13)';
    const aiBubBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
    const aiBubBor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

    const isSpeaking = state === 'speaking';
    const isError = state === 'error';

    return (
        <div
            role="complementary"
            aria-label="Voice chat with Yubi"
            style={{
                position: 'fixed',
                // Sits just below the header.
                top: 42,
                right: 0,
                bottom: 0,
                // 380px on desktop, full-width on narrow screens.
                width: 'min(380px, 100vw)',
                zIndex: 16,
                display: 'flex',
                flexDirection: 'column',
                background: panelBg,
                borderLeft: `1px solid ${borderCol}`,
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                boxShadow: isDark ? '-6px 0 40px rgba(0,0,0,0.55)' : '-6px 0 40px rgba(0,0,0,0.10)',
            }}
        >
            {/* ------------------------------------------------------------------ */}
            {/* Panel header                                                        */}
            {/* ------------------------------------------------------------------ */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 14px',
                    borderBottom: `1px solid ${borderCol}`,
                    background: headerBg,
                    flexShrink: 0,
                }}
            >
                <StatusDot state={state} accentCol={accentCol} errorCol={errorCol} />

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: textCol,
                            letterSpacing: 0.15,
                            lineHeight: 1,
                        }}
                    >
                        Talk to Yubi
                    </div>
                    <div
                        style={{
                            fontSize: 10.5,
                            color: isError ? errorCol : dimCol,
                            marginTop: 2,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {isError && errorMessage ? errorMessage : STATE_LABEL[state]}
                    </div>
                </div>

                {isError && (
                    <IconButton
                        onClick={handleRetry}
                        isDark={isDark}
                        title="Retry connection"
                        label="Retry"
                    />
                )}

                {isSpeaking && (
                    <IconButton
                        onClick={interruptNow}
                        isDark={isDark}
                        title="Interrupt Yubi"
                    >
                        <MicOff size={13} />
                    </IconButton>
                )}

                <IconButton
                    onClick={handleClose}
                    isDark={isDark}
                    title="Close voice panel"
                >
                    <X size={14} />
                </IconButton>
            </div>

            {/* ------------------------------------------------------------------ */}
            {/* Transcript area                                                     */}
            {/* ------------------------------------------------------------------ */}
            <div
                ref={transcriptRef}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    // Smooth scroll so new turns glide into view.
                    scrollBehavior: 'smooth',
                }}
            >
                {/* Empty listening state — prompt the user */}
                {transcript.length === 0 && state === 'listening' && (
                    <EmptyListeningPrompt dimCol={dimCol} accentCol={accentCol} />
                )}

                {/* Connecting / thinking with no turns yet — show a loader */}
                {transcript.length === 0 && (state === 'connecting' || state === 'thinking') && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: 1,
                        }}
                    >
                        <DotsLoader color={accentCol} />
                    </div>
                )}

                {/* Conversation turns */}
                {transcript.map(turn => (
                    <TurnBubble
                        key={turn.id}
                        turn={turn}
                        isDark={isDark}
                        textCol={textCol}
                        dimCol={dimCol}
                        accentCol={accentCol}
                        userBubBg={userBubBg}
                        userBubBor={userBubBor}
                        aiBubBg={aiBubBg}
                        aiBubBor={aiBubBor}
                    />
                ))}
            </div>

            {/* ------------------------------------------------------------------ */}
            {/* Status bar                                                          */}
            {/* ------------------------------------------------------------------ */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 14px',
                    borderTop: `1px solid ${borderCol}`,
                    background: headerBg,
                    flexShrink: 0,
                }}
            >
                <ActivityIndicator state={state} accentCol={accentCol} errorCol={errorCol} />
                <span
                    style={{
                        fontSize: 11,
                        color: isError ? errorCol : dimCol,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {STATUS_HINT[state]}
                </span>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface IconButtonProps {
    onClick: () => void;
    isDark: boolean;
    title?: string;
    label?: string;
    children?: React.ReactNode;
}

const IconButton: React.FC<IconButtonProps> = ({ onClick, isDark, title, label, children }) => (
    <button
        onClick={onClick}
        title={title}
        style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: label ? '4px 9px' : '5px 7px',
            fontSize: 11,
            fontWeight: 500,
            border: isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.12)',
            borderRadius: 6,
            background: 'transparent',
            color: isDark ? '#94a3b8' : '#475569',
            cursor: 'pointer',
            flexShrink: 0,
        }}
    >
        {children}
        {label && <span>{label}</span>}
    </button>
);

// The coloured dot in the panel header.
interface StatusDotProps {
    state: VoiceState;
    accentCol: string;
    errorCol: string;
}

const StatusDot: React.FC<StatusDotProps> = ({ state, accentCol, errorCol }) => {
    const color =
        state === 'error' ? errorCol :
            state === 'idle' ? '#4b5563' :
                state === 'connecting' ? '#6b7280' :
                    state === 'listening' ? '#10b981' :
                        accentCol;

    const shouldPulse = state === 'listening' || state === 'speaking';

    return (
        <div
            style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
                animation: shouldPulse ? 'voice-pulse 1.8s ease-in-out infinite' : undefined,
            }}
        />
    );
};

// Animated bar-chart speaker indicator (shown in the status bar while speaking).
interface ActivityIndicatorProps {
    state: VoiceState;
    accentCol: string;
    errorCol: string;
}

const ActivityIndicator: React.FC<ActivityIndicatorProps> = ({ state, accentCol, errorCol }) => {
    if (state === 'error') {
        return (
            <div
                style={{ width: 8, height: 8, borderRadius: '50%', background: errorCol, flexShrink: 0 }}
            />
        );
    }
    if (state === 'listening') {
        return (
            <div
                style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#10b981',
                    flexShrink: 0,
                    animation: 'voice-pulse 1.8s ease-in-out infinite',
                }}
            />
        );
    }
    if (state === 'thinking' || state === 'connecting') {
        return <DotsLoader color={accentCol} size={5} />;
    }
    if (state === 'speaking') {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 2,
                    height: 14,
                    flexShrink: 0,
                }}
            >
                {[0, 1, 2, 3].map(i => (
                    <div
                        key={i}
                        style={{
                            width: 3,
                            borderRadius: 2,
                            background: accentCol,
                            animation: `voice-wave ${0.55 + i * 0.12}s ${i * 0.09}s ease-in-out infinite alternate`,
                        }}
                    />
                ))}
            </div>
        );
    }
    return (
        <div
            style={{ width: 8, height: 8, borderRadius: '50%', background: '#4b5563', flexShrink: 0 }}
        />
    );
};

// Three-dot loading animation.
interface DotsLoaderProps {
    color: string;
    size?: number;
}

const DotsLoader: React.FC<DotsLoaderProps> = ({ color, size = 6 }) => (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
        {[0, 1, 2].map(i => (
            <div
                key={i}
                style={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    background: color,
                    opacity: 0.45,
                    animation: `voice-bounce 1.2s ${i * 0.18}s ease-in-out infinite`,
                }}
            />
        ))}
    </div>
);

// Empty state shown in the transcript area while the session is live but quiet.
interface EmptyListeningPromptProps {
    dimCol: string;
    accentCol: string;
}

const EmptyListeningPrompt: React.FC<EmptyListeningPromptProps> = ({ dimCol, accentCol }) => (
    <div
        style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            gap: 12,
            opacity: 0.55,
            padding: '0 24px',
        }}
    >
        <Mic size={26} strokeWidth={1.3} color={accentCol} style={{ animation: 'voice-pulse 2s ease-in-out infinite' }} />
        <p
            style={{
                fontSize: 12,
                color: dimCol,
                textAlign: 'center',
                lineHeight: 1.6,
                margin: 0,
            }}
        >
            Ask about projects, skills,<br />or Yubi's experience
        </p>
    </div>
);

// A single conversation turn bubble.
interface TurnBubbleProps {
    turn: TranscriptTurn;
    isDark: boolean;
    textCol: string;
    dimCol: string;
    accentCol: string;
    userBubBg: string;
    userBubBor: string;
    aiBubBg: string;
    aiBubBor: string;
}

const TurnBubble: React.FC<TurnBubbleProps> = ({
    turn,
    textCol,
    dimCol,
    accentCol,
    userBubBg,
    userBubBor,
    aiBubBg,
    aiBubBor,
}) => {
    const isUser = turn.role === 'user';
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                alignItems: isUser ? 'flex-end' : 'flex-start',
            }}
        >
            <div
                style={{
                    fontSize: 10,
                    color: dimCol,
                    fontWeight: 600,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                }}
            >
                {isUser ? 'you' : 'yubi'}
            </div>

            <div
                style={{
                    maxWidth: '90%',
                    padding: '9px 13px',
                    borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: isUser ? userBubBg : aiBubBg,
                    border: `1px solid ${isUser ? userBubBor : aiBubBor}`,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: textCol,
                    wordBreak: 'break-word',
                }}
            >
                {turn.text || <span style={{ opacity: 0.35 }}>…</span>}

                {/* Streaming cursor — shown while the turn is still accumulating text */}
                {!turn.done && (
                    <span
                        style={{
                            display: 'inline-block',
                            width: 6,
                            height: 6,
                            marginLeft: 5,
                            borderRadius: '50%',
                            background: accentCol,
                            verticalAlign: 'middle',
                            animation: 'voice-pulse 0.9s ease-in-out infinite',
                        }}
                    />
                )}
            </div>
        </div>
    );
};
