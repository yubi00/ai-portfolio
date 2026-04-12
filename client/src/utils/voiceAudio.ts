// PCM16 audio utilities for the voice chat feature.
// Responsibilities: mic capture, PCM16 encoding at 24 kHz, base64 decoding, gapless playback queue.

export const VOICE_SAMPLE_RATE = 24_000;

// ---------------------------------------------------------------------------
// Encoding — Float32 PCM → Little-Endian Int16 → base64
// ---------------------------------------------------------------------------

export function encodePcm16ToBase64(samples: Float32Array): string {
    const buf = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < samples.length; i++) {
        const clamped = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, /* littleEndian */ true);
    }
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

// ---------------------------------------------------------------------------
// Decoding — base64 LE Int16 → Float32
// ---------------------------------------------------------------------------

export function decodePcm16Base64(b64: string): Float32Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const out = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) out[i] = int16[i] / 32768;
    return out;
}

// ---------------------------------------------------------------------------
// RMS energy — used for local barge-in detection
// ---------------------------------------------------------------------------

export function rmsEnergy(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / samples.length);
}

// ---------------------------------------------------------------------------
// Mic capture
// Calls onChunk with (base64PCM16, rmsEnergy) roughly every 85ms (2048 samples @ 24kHz).
// Returns a stop() function that tears down the graph and tracks.
// ---------------------------------------------------------------------------

export interface MicCapture {
    stop: () => void;
}

export async function startMicCapture(
    onChunk: (base64: string, energy: number) => void,
): Promise<MicCapture> {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            channelCount: 1,
            sampleRate: VOICE_SAMPLE_RATE,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        },
    });

    const ctx = new AudioContext({ sampleRate: VOICE_SAMPLE_RATE });
    // Resume in case browser starts it suspended (required on iOS when called within a gesture).
    if (ctx.state === 'suspended') await ctx.resume();

    const source = ctx.createMediaStreamSource(stream);

    // ScriptProcessorNode is deprecated, but it avoids shipping a separate AudioWorklet file.
    // A gain of 0 on the output prevents mic echo while satisfying the connected-to-destination
    // requirement that some browsers impose for onaudioprocess to fire.
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        onChunk(encodePcm16ToBase64(input), rmsEnergy(input));
    };

    const silent = ctx.createGain();
    silent.gain.value = 0;
    source.connect(processor);
    processor.connect(silent);
    silent.connect(ctx.destination);

    return {
        stop: () => {
            try { processor.disconnect(); } catch { }
            try { source.disconnect(); } catch { }
            try { silent.disconnect(); } catch { }
            stream.getTracks().forEach(t => t.stop());
            ctx.close().catch(() => { });
        },
    };
}

// ---------------------------------------------------------------------------
// Gapless audio playback queue
//
// Schedules PCM16 base64 chunks as WebAudio BufferSourceNodes with precise
// start times to eliminate gaps. Supports immediate stop for barge-in.
// ---------------------------------------------------------------------------

export class AudioPlaybackQueue {
    private ctx: AudioContext | null = null;
    private nextStart = 0;
    private active: AudioBufferSourceNode[] = [];
    private pendingCount = 0;
    private drainCallback: (() => void) | null = null;
    private draining = false;

    private ensureCtx(): AudioContext {
        if (!this.ctx || this.ctx.state === 'closed') {
            this.ctx = new AudioContext({ sampleRate: VOICE_SAMPLE_RATE });
        }
        return this.ctx;
    }

    // Call this synchronously within a user-gesture handler to satisfy iOS AudioContext unlock.
    async unlock(): Promise<void> {
        const ctx = this.ensureCtx();
        if (ctx.state === 'suspended') await ctx.resume();
    }

    enqueue(b64: string): void {
        const samples = decodePcm16Base64(b64);
        const ctx = this.ensureCtx();
        const buf = ctx.createBuffer(1, samples.length, VOICE_SAMPLE_RATE);
        buf.copyToChannel(samples, 0);

        const node = ctx.createBufferSource();
        node.buffer = buf;
        node.connect(ctx.destination);

        // Schedule back-to-back to prevent gaps.
        const now = ctx.currentTime;
        const startAt = Math.max(now + 0.01, this.nextStart);
        this.nextStart = startAt + buf.duration;
        this.pendingCount++;
        this.active.push(node);

        node.onended = () => {
            this.pendingCount = Math.max(0, this.pendingCount - 1);
            const idx = this.active.indexOf(node);
            if (idx !== -1) this.active.splice(idx, 1);
            if (this.draining && this.pendingCount === 0) {
                this.draining = false;
                const cb = this.drainCallback;
                this.drainCallback = null;
                cb?.();
            }
        };

        node.start(startAt);
    }

    // Registers a callback that fires once all currently queued audio has finished playing.
    // Per the PRD: response.done ≠ audio finished; the frontend must track drain separately.
    whenDrained(cb: () => void): void {
        if (this.pendingCount === 0) {
            cb();
            return;
        }
        this.draining = true;
        this.drainCallback = cb;
    }

    // Immediately cancels all queued audio (barge-in / response.cancelled).
    stopNow(): void {
        this.draining = false;
        this.drainCallback = null;
        const nodes = this.active.slice();
        this.active = [];
        this.pendingCount = 0;
        this.nextStart = 0;
        for (const n of nodes) {
            try { n.stop(); } catch { }
        }
    }

    get isPlaying(): boolean {
        return this.pendingCount > 0;
    }

    destroy(): void {
        this.stopNow();
        this.ctx?.close().catch(() => { });
        this.ctx = null;
    }
}
