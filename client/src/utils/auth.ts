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
let didClearLegacyStorage = false;

const isValid = (b: TokenBundle | null): b is TokenBundle => {
  if (!b) return false;
  return b.expiresAt - skewMs > nowMs();
};

const clearLegacyPersistedTokensOnce = () => {
  if (didClearLegacyStorage || typeof window === 'undefined') return;
  didClearLegacyStorage = true;

  try {
    window.localStorage.removeItem(LS.grantToken);
    window.localStorage.removeItem(LS.grantExpiresAt);
    window.localStorage.removeItem(LS.accessToken);
    window.localStorage.removeItem(LS.accessExpiresAt);
  } catch {
    // ignore
  }
};

let accessBundle: TokenBundle | null = null;
let inflightAccess: Promise<string | null> | null = null;

export const clearAccessToken = () => {
  accessBundle = null;
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

  clearLegacyPersistedTokensOnce();

  if (isValid(accessBundle)) return `Bearer ${accessBundle.token}`;

  if (inflightAccess) return inflightAccess.then((t) => (t ? `Bearer ${t}` : null));

  inflightAccess = (async () => {
    const apiBase = getApiBaseUrl();

    const mintAccessToken = async (opts?: {
      throwOnFailure?: boolean;
    }): Promise<string | null> => {
      const throwOnFailure = Boolean(opts?.throwOnFailure);
      let tokenResp: Response;
      try {
        tokenResp = await fetch(`${apiBase}/auth/token`, {
          method: 'POST',
          credentials: 'include',
        });
      } catch (e) {
        if (throwOnFailure) throw e instanceof Error ? e : new Error('auth_token_failed');
        return null;
      }

      if (tokenResp.status === 404 || tokenResp.status === 405) {
        if (throwOnFailure) throw new Error('auth_endpoints_missing');
        return null;
      }

      if (!tokenResp.ok) {
        clearAccessToken();
        let detail = '';
        try {
          const j = await tokenResp.json();
          detail = j?.detail ? String(j.detail) : '';
        } catch { }
        const err = new Error(detail ? `auth_token_${tokenResp.status}:${detail}` : `auth_token_${tokenResp.status}`);
        if (throwOnFailure) throw err;
        return null;
      }

      const tokenJson = await tokenResp.json();
      const accessToken = String(tokenJson?.access_token || '');
      const expiresIn = Number(tokenJson?.expires_in || 0);
      if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        if (throwOnFailure) throw new Error('invalid_access_response');
        return null;
      }

      accessBundle = { token: accessToken, expiresAt: nowMs() + expiresIn * 1000 };
      return accessBundle.token;
    };

    const silentAccess = await mintAccessToken({ throwOnFailure: false });
    if (silentAccess) return silentAccess;

    if (!allowInteractive) return null;

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
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnstile_token: turnstileToken }),
      });
    } catch (e) {
      if (enforce) throw e instanceof Error ? e : new Error('auth_session_failed');
      return null;
    }

    if (sessionResp.status === 404 || sessionResp.status === 405) {
      if (enforce) throw new Error('auth_endpoints_missing');
      return null;
    }

    if (!sessionResp.ok) {
      clearAccessToken();
      let detail = '';
      try {
        const j = await sessionResp.json();
        detail = j?.detail ? String(j.detail) : '';
      } catch { }
      const err = new Error(detail ? `auth_session_${sessionResp.status}:${detail}` : `auth_session_${sessionResp.status}`);
      if (enforce) throw err;
      return null;
    }

    return mintAccessToken({ throwOnFailure: enforce });
  })()
    .catch((e) => {
      // Ensure failures don't poison future calls.
      clearAccessToken();
      inflightAccess = null;
      throw e;
    })
    .finally(() => {
      inflightAccess = null;
    });

  const tok = await inflightAccess;
  return tok ? `Bearer ${tok}` : null;
};
