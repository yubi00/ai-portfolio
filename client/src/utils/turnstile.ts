import { getAuthEnv } from '../config/env';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        params: {
          sitekey: string;
          size?: 'normal' | 'compact' | 'flexible';
          execution?: 'render' | 'execute';
          appearance?: 'always' | 'execute' | 'interaction-only';
          callback?: (token: string) => void;
          'error-callback'?: (errorCode?: string) => void;
          'expired-callback'?: () => void;
          'before-interactive-callback'?: () => void;
          'after-interactive-callback'?: () => void;
          'unsupported-callback'?: () => void;
        }
      ) => string;
      execute: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

const loadTurnstileScript = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  if (window.turnstile) return;
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-cf-turnstile="1"]'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('turnstile_script_failed')), {
        once: true,
      });
      return;
    }

    const s = document.createElement('script');
    s.async = true;
    s.defer = true;
    s.dataset.cfTurnstile = '1';
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile_script_failed'));
    document.head.appendChild(s);
  });

  return scriptLoadPromise;
};

let widgetId: string | null = null;
let widgetContainer: HTMLElement | null = null;
let inflightToken: Promise<string> | null = null;
let resolveInflight: ((token: string) => void) | null = null;
let rejectInflight: ((err: Error) => void) | null = null;
let interactive = false;

const setContainerVisible = (visible: boolean) => {
  if (!widgetContainer) return;
  widgetContainer.style.display = visible ? 'block' : 'none';
};

const ensureWidget = async (): Promise<string> => {
  const { turnstileSiteKey } = getAuthEnv();
  if (!turnstileSiteKey) throw new Error('missing_turnstile_site_key');
  if (typeof window === 'undefined') throw new Error('turnstile_unavailable');

  await loadTurnstileScript();
  if (!window.turnstile) throw new Error('turnstile_unavailable');

  if (!widgetContainer) {
    widgetContainer = document.createElement('div');
    widgetContainer.id = 'cf-turnstile-container';
    // Keep it out of the way but on-screen so interactive challenges are usable.
    widgetContainer.style.position = 'fixed';
    widgetContainer.style.right = '16px';
    widgetContainer.style.bottom = '16px';
    widgetContainer.style.zIndex = '2147483647';
    widgetContainer.style.display = 'none';
    widgetContainer.style.width = '320px';
    widgetContainer.style.minHeight = '80px';
    document.body.appendChild(widgetContainer);
  }

  if (!widgetId) {
    widgetId = window.turnstile.render(widgetContainer, {
      sitekey: turnstileSiteKey,
      size: 'compact',
      execution: 'execute', // render now, run challenge only when we call execute()
      // Keep it quiet unless Cloudflare actually needs user interaction.
      appearance: 'interaction-only',
      'before-interactive-callback': () => {
        interactive = true;
        setContainerVisible(true);
      },
      'after-interactive-callback': () => {
        interactive = false;
        // keep visible until token resolves/rejects
      },
      'unsupported-callback': () => {
        const rej = rejectInflight;
        resolveInflight = null;
        rejectInflight = null;
        inflightToken = null;
        rej?.(new Error('turnstile_unsupported'));
      },
      callback: (token: string) => {
        // Resolve current request (if any)
        const r = resolveInflight;
        resolveInflight = null;
        rejectInflight = null;
        inflightToken = null;
        setContainerVisible(false);
        if (r) r(token);
      },
      'expired-callback': () => {
        const rej = rejectInflight;
        resolveInflight = null;
        rejectInflight = null;
        inflightToken = null;
        setContainerVisible(false);
        if (rej) rej(new Error('turnstile_expired'));
      },
      'error-callback': (code?: string) => {
        const rej = rejectInflight;
        resolveInflight = null;
        rejectInflight = null;
        inflightToken = null;
        setContainerVisible(false);
        rej?.(new Error(code ? `turnstile_error:${code}` : 'turnstile_error'));
      },
    });
  }

  return widgetId;
};

export const getTurnstileToken = async (timeoutMs: number = 30000): Promise<string> => {
  const { isDev, turnstileSiteKey, turnstileDevBypass } = getAuthEnv();

  // Dev ergonomics: allow backend TURNSTILE_BYPASS=1 by sending any token.
  if (isDev && turnstileDevBypass) return 'dummy';

  if (!turnstileSiteKey) {
    if (isDev) return 'dummy';
    throw new Error('missing_turnstile_site_key');
  }

  if (inflightToken) return inflightToken;

  const id = await ensureWidget();
  if (!widgetContainer || !window.turnstile) throw new Error('turnstile_unavailable');

  inflightToken = new Promise<string>((resolve, reject) => {
    resolveInflight = resolve;
    rejectInflight = reject;

    const timer = window.setTimeout(() => {
      // If still pending, reset and reject.
      if (!inflightToken) return;
      try {
        window.turnstile?.reset(id);
      } catch {}
      resolveInflight = null;
      rejectInflight = null;
      inflightToken = null;
      reject(new Error('turnstile_timeout'));
    }, timeoutMs);

    const cleanup = () => window.clearTimeout(timer);
    const resolveWrapped = (token: string) => {
      cleanup();
      resolve(token);
    };
    const rejectWrapped = (err: Error) => {
      cleanup();
      reject(err);
    };

    // Wrap to ensure timer is cleared even if callbacks resolve directly.
    resolveInflight = resolveWrapped;
    rejectInflight = rejectWrapped;

    try {
      // If a previous challenge is still running/errored, reset first.
      window.turnstile.reset(id);

      // Execute the rendered widget by id.
      window.turnstile.execute(id);
    } catch (e) {
      cleanup();
      resolveInflight = null;
      rejectInflight = null;
      inflightToken = null;
      setContainerVisible(false);
      reject(e instanceof Error ? e : new Error('turnstile_error'));
    }
  });

  // Optional dev fallback: if Cloudflare rejects locally (common key/domain mismatch),
  // allow bypass flow when explicitly enabled.
  if (isDev) {
    return inflightToken.catch((e) => {
      if (turnstileDevBypass) return 'dummy';
      throw e;
    });
  }

  return inflightToken;
};
