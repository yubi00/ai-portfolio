import { getAuthEnv } from '../../config/env';
import { getTurnstileToken } from '../turnstile';
import {
  clearAccessToken as clearStoredAccessToken,
  getValidAccessToken,
  setAccessToken,
} from './accessTokenStore';
import { createSession, mintAccessToken } from './authClient';
import { clearLegacyPersistedTokensOnce } from './legacyStorage';

let inflightAccess: Promise<string | null> | null = null;

export const clearAccessToken = () => {
  clearStoredAccessToken();
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
  enforce?: boolean;
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

  const cachedToken = getValidAccessToken();
  if (cachedToken) return `Bearer ${cachedToken}`;

  if (inflightAccess) return inflightAccess.then((token) => (token ? `Bearer ${token}` : null));

  inflightAccess = (async () => {
    const silentBundle = await mintAccessToken({ throwOnFailure: false });
    if (silentBundle) {
      setAccessToken(silentBundle);
      return silentBundle.token;
    }

    if (!allowInteractive) return null;

    let turnstileToken: string;
    try {
      turnstileToken = await getTurnstileToken();
    } catch (error) {
      if (enforce) throw error instanceof Error ? error : new Error('turnstile_error');
      return null;
    }

    const sessionCreated = await createSession(turnstileToken, { throwOnFailure: enforce });
    if (!sessionCreated) return null;

    const refreshedBundle = await mintAccessToken({ throwOnFailure: enforce });
    if (!refreshedBundle) return null;

    setAccessToken(refreshedBundle);
    return refreshedBundle.token;
  })()
    .catch((error) => {
      clearStoredAccessToken();
      inflightAccess = null;
      throw error;
    })
    .finally(() => {
      inflightAccess = null;
    });

  const token = await inflightAccess;
  return token ? `Bearer ${token}` : null;
};
