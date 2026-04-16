const LEGACY_STORAGE_KEYS = {
  grantToken: 'ai_portfolio.grant_token',
  grantExpiresAt: 'ai_portfolio.grant_expires_at',
  accessToken: 'ai_portfolio.access_token',
  accessExpiresAt: 'ai_portfolio.access_expires_at',
} as const;

let didClearLegacyStorage = false;

export const clearLegacyPersistedTokensOnce = () => {
  if (didClearLegacyStorage || typeof window === 'undefined') return;
  didClearLegacyStorage = true;

  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEYS.grantToken);
    window.localStorage.removeItem(LEGACY_STORAGE_KEYS.grantExpiresAt);
    window.localStorage.removeItem(LEGACY_STORAGE_KEYS.accessToken);
    window.localStorage.removeItem(LEGACY_STORAGE_KEYS.accessExpiresAt);
  } catch {
    // ignore
  }
};
