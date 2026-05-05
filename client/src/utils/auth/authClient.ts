import { getApiBaseUrl } from '../../config/env';
import type { TokenBundle } from './types';

const parseError = async (response: Response): Promise<{ code?: string; message?: string }> => {
  try {
    const json = await response.json();
    return {
      code: json?.error?.code ? String(json.error.code) : undefined,
      message: json?.error?.message ? String(json.error.message) : undefined,
    };
  } catch {
    return {};
  }
};

const buildHttpError = async (prefix: string, response: Response): Promise<Error> => {
  const apiError = await parseError(response);
  const suffix = apiError.code || response.status;
  return new Error(apiError.message ? `${prefix}_${suffix}:${apiError.message}` : `${prefix}_${suffix}`);
};

export const mintAccessToken = async (opts?: {
  throwOnFailure?: boolean;
}): Promise<TokenBundle | null> => {
  const throwOnFailure = Boolean(opts?.throwOnFailure);
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}/auth/token`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch (error) {
    if (throwOnFailure) {
      throw error instanceof Error ? error : new Error('auth_token_failed');
    }
    return null;
  }

  if (response.status === 404 || response.status === 405) {
    if (throwOnFailure) throw new Error('auth_endpoints_missing');
    return null;
  }

  if (!response.ok) {
    if (throwOnFailure) throw await buildHttpError('auth_token', response);
    return null;
  }

  const json = await response.json();
  const token = String(json?.access_token || '');
  const expiresIn = Number(json?.expires_in || 0);

  if (!token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    if (throwOnFailure) throw new Error('invalid_access_response');
    return null;
  }

  return {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
};

export const createSession = async (
  turnstileToken: string,
  opts?: {
    throwOnFailure?: boolean;
  },
): Promise<boolean> => {
  const throwOnFailure = Boolean(opts?.throwOnFailure);
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}/auth/session`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnstile_token: turnstileToken }),
    });
  } catch (error) {
    if (throwOnFailure) {
      throw error instanceof Error ? error : new Error('auth_session_failed');
    }
    return false;
  }

  if (response.status === 404 || response.status === 405) {
    if (throwOnFailure) throw new Error('auth_endpoints_missing');
    return false;
  }

  if (!response.ok) {
    if (throwOnFailure) throw await buildHttpError('auth_session', response);
    return false;
  }

  return true;
};
