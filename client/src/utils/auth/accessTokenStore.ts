import type { TokenBundle } from './types';

const skewMs = 5000;
const nowMs = () => Date.now();

let accessBundle: TokenBundle | null = null;

export const getValidAccessToken = (): string | null => {
  if (!accessBundle) return null;
  return accessBundle.expiresAt - skewMs > nowMs() ? accessBundle.token : null;
};

export const setAccessToken = (bundle: TokenBundle) => {
  accessBundle = bundle;
};

export const clearAccessToken = () => {
  accessBundle = null;
};
