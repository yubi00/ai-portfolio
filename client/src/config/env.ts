type Boolish = string | boolean | number | undefined | null;

const parseBool = (v: Boolish): boolean => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};

export const getApiBaseUrl = (): string => {
  const fromEnv = (import.meta.env?.VITE_API_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  // Local dev default (Vite)
  if (typeof window !== 'undefined' && window.location?.port === '5173') {
    return 'http://127.0.0.1:9000';
  }

  // Deployed frontend (Vercel) typically proxies to /api
  return '/api';
};

// Voice feature flag — set VITE_VOICE_ENABLED=true to enable.
// Defaults to false so production stays safe until the voice service is deployed.
export const isVoiceEnabled = (): boolean =>
  parseBool(import.meta.env?.VITE_VOICE_ENABLED);

export const getVoiceWsUrl = (): string => {
  const fromEnv = (import.meta.env?.VITE_VOICE_WS_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv;

  if (typeof window !== 'undefined') {
    // Local Vite dev server — point to the default voice service port.
    if (window.location.port === '5173') return 'ws://127.0.0.1:3001/ws';
    // Deployed — derive from current origin (assumes voice service is proxied at /voice/ws).
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/voice/ws`;
  }

  return 'ws://127.0.0.1:3001/ws';
};

export const getAuthEnv = () => {
  const turnstileSiteKey =
    ((import.meta.env?.VITE_TURNSTILE_SITE_KEY as string | undefined) || '').trim();

  return {
    // If true, frontend must obtain an access token before calling /prompt*
    requireAuth: parseBool(import.meta.env?.VITE_REQUIRE_AUTH),

    // Hard kill-switch for emergency/debugging.
    // If true, frontend will not attempt any /auth/* calls.
    disableAuth: parseBool(import.meta.env?.VITE_DISABLE_AUTH),

    // Dev-only: forces sending a dummy Turnstile token instead of running Cloudflare Turnstile.
    // Use this together with backend `TURNSTILE_BYPASS=1`.
    turnstileDevBypass: parseBool(import.meta.env?.VITE_TURNSTILE_DEV_BYPASS),

    turnstileSiteKey,
    isDev: Boolean(import.meta.env?.DEV),
  };
};
