import { getApiBaseUrl, getAuthEnv } from '../config/env';
import { getTurnstileToken } from './turnstile';

type TokenBundle = {
  token: string;
  // epoch ms
  expiresAt: number;
};

const LS = {
  grantToken: 'ai_portfolio.grant_token',
  grantExpiresAt: 'ai_portfolio.grant_expires_at',
  accessToken: 'ai_portfolio.access_token',
  accessExpiresAt: 'ai_portfolio.access_expires_at',
} as const;

const nowMs = () => Date.now();
const skewMs = 5000;

const readBundle = (tokenKey: string, expKey: string): TokenBundle | null => {
  try {
    const token = window.localStorage.getItem(tokenKey) || '';
    const expRaw = window.localStorage.getItem(expKey) || '';
    const expiresAt = Number(expRaw);
    if (!token || !Number.isFinite(expiresAt)) return null;
    return { token, expiresAt };
  } catch {
    return null;
  }
};

const writeBundle = (tokenKey: string, expKey: string, b: TokenBundle | null) => {
  try {
    if (!b) {
      window.localStorage.removeItem(tokenKey);
      window.localStorage.removeItem(expKey);
      return;
    }
    window.localStorage.setItem(tokenKey, b.token);
    window.localStorage.setItem(expKey, String(b.expiresAt));
  } catch {
    // ignore
  }
};

const isValid = (b: TokenBundle | null): b is TokenBundle => {
  if (!b) return false;
  return b.expiresAt - skewMs > nowMs();
};

const clearTokens = () => {
  if (typeof window === 'undefined') return;
  writeBundle(LS.grantToken, LS.grantExpiresAt, null);
  writeBundle(LS.accessToken, LS.accessExpiresAt, null);
};

let inflightAccess: Promise<string | null> | null = null;

export const clearAccessToken = () => {
  if (typeof window === 'undefined') return;
  writeBundle(LS.accessToken, LS.accessExpiresAt, null);
};

export const getAccessToken = async (opts?: {
  enforce?: boolean;
  allowInteractive?: boolean;
}): Promise<string | null> => {
  const header = await getAuthorizationHeader(opts);
  if (!header) return null;
  return header.startsWith('Bearer ') ? header.slice(7) : header;
};

export const getAuthorizationHeader = async (opts?: {
  // If true, throw when unable to obtain an access token.
  enforce?: boolean;
  // If false, do not run Turnstile (no interactive token minting). Cached-only mode.
  // Defaults to `enforce`.
  allowInteractive?: boolean;
}): Promise<string | null> => {
  const { disableAuth, requireAuth } = getAuthEnv();
  const enforce = Boolean(opts?.enforce ?? requireAuth);
  const allowInteractive = Boolean(opts?.allowInteractive ?? enforce);

  if (disableAuth) {
    if (enforce) throw new Error('auth_disabled');
    return null;
  }

  if (typeof window === 'undefined') {
    if (enforce) throw new Error('auth_unavailable');
    return null;
  }

  // Cached access token?
  const access = readBundle(LS.accessToken, LS.accessExpiresAt);
  if (isValid(access)) return `Bearer ${access.token}`;

  if (inflightAccess) return inflightAccess.then((t) => (t ? `Bearer ${t}` : null));

  inflightAccess = (async () => {
    const apiBase = getApiBaseUrl();

    // Try to mint an access token from a cached grant token first.
    let grant = readBundle(LS.grantToken, LS.grantExpiresAt);
    if (!isValid(grant)) {
      // In non-enforced mode, never trigger an interactive Turnstile flow.
      // This avoids noisy console errors during rollout/local dev when auth isn't required yet.
      if (!allowInteractive) return null;

      // Need a new grant token: create a session using Turnstile
      let turnstileToken: string;
      try {
        turnstileToken = await getTurnstileToken();
      } catch (e) {
        if (enforce) throw e instanceof Error ? e : new Error('turnstile_error');
        return null;
      }

      let sessionResp: Response;
      try {
        sessionResp = await fetch(`${apiBase}/auth/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ turnstile_token: turnstileToken }),
        });
      } catch (e) {
        if (enforce) throw e instanceof Error ? e : new Error('auth_session_failed');
        return null;
      }

      // Older backend versions (or pre-rollout) may not expose /auth/*.
      if (sessionResp.status === 404 || sessionResp.status === 405) {
        if (enforce) throw new Error('auth_endpoints_missing');
        return null;
      }

      if (!sessionResp.ok) {
        // If backend requires auth and turnstile is invalid, this should surface.
        clearTokens();
        let detail = '';
        try {
          const j = await sessionResp.json();
          detail = j?.detail ? String(j.detail) : '';
        } catch { }
        const err = new Error(detail ? `auth_session_${sessionResp.status}:${detail}` : `auth_session_${sessionResp.status}`);
        if (enforce) throw err;
        return null;
      }

      const sessionJson = await sessionResp.json();
      const grantToken = String(sessionJson?.grant_token || '');
      const expiresIn = Number(sessionJson?.expires_in || 0);
      if (!grantToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        if (enforce) throw new Error('invalid_grant_response');
        return null;
      }
      grant = { token: grantToken, expiresAt: nowMs() + expiresIn * 1000 };
      writeBundle(LS.grantToken, LS.grantExpiresAt, grant);
    }

    // Exchange grant token for access token
    let tokenResp: Response;
    try {
      tokenResp = await fetch(`${apiBase}/auth/token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${grant.token}`,
        },
      });
    } catch (e) {
      if (enforce) throw e instanceof Error ? e : new Error('auth_token_failed');
      return null;
    }

    if (tokenResp.status === 404 || tokenResp.status === 405) {
      if (enforce) throw new Error('auth_endpoints_missing');
      return null;
    }

    if (!tokenResp.ok) {
      clearTokens();
      let detail = '';
      try {
        const j = await tokenResp.json();
        detail = j?.detail ? String(j.detail) : '';
      } catch { }
      const err = new Error(detail ? `auth_token_${tokenResp.status}:${detail}` : `auth_token_${tokenResp.status}`);
      if (enforce) throw err;
      return null;
    }

    const tokenJson = await tokenResp.json();
    const accessToken = String(tokenJson?.access_token || '');
    const expiresIn = Number(tokenJson?.expires_in || 0);
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      if (enforce) throw new Error('invalid_access_response');
      return null;
    }
    const accessBundle: TokenBundle = { token: accessToken, expiresAt: nowMs() + expiresIn * 1000 };
    writeBundle(LS.accessToken, LS.accessExpiresAt, accessBundle);
    return accessBundle.token;
  })()
    .catch((e) => {
      // Ensure failures don't poison future calls.
      inflightAccess = null;
      throw e;
    })
    .finally(() => {
      inflightAccess = null;
    });

  const tok = await inflightAccess;
  return tok ? `Bearer ${tok}` : null;
};
