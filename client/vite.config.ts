import { defineConfig, loadEnv } from 'vite';

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devHttps = (env.VITE_DEV_HTTPS || '').toLowerCase() === 'true';

  const plugins: any[] = [
    // Dev-only: Cloudflare Turnstile / PAT may try to POST to /cdn-cgi/challenge-platform/*
    // on the current origin. If you're not behind Cloudflare locally, that can create noisy errors.
    {
      name: 'dev-cdn-cgi-squelch',
      apply: 'serve',
      configureServer(server: any) {
        server.middlewares.use((req: any, res: any, next: any) => {
          const url = req?.url || '';
          if (url.startsWith('/cdn-cgi/challenge-platform/')) {
            res.statusCode = 204; // No Content
            res.end();
            return;
          }
          next();
        });
      },
    },
  ];

  // Optional HTTPS so any accidental https://localhost:5173/... requests don't hit SSL errors.
  // Requires installing @vitejs/plugin-basic-ssl.
  if (devHttps && mode === 'development') {
    try {
      const mod = await import('@vitejs/plugin-basic-ssl');
      plugins.push((mod as any).default());
    } catch {
      throw new Error(
        'VITE_DEV_HTTPS=true but @vitejs/plugin-basic-ssl is not installed.\n' +
          "With Vite 5, install a compatible version:\n" +
          '  npm i -D @vitejs/plugin-basic-ssl@1.1.0\n' +
          'Or disable HTTPS by setting VITE_DEV_HTTPS=false.'
      );
    }
  }

  return {
    plugins,
    server: {
      port: 5173,
      strictPort: true,
      // Bind to all interfaces so both localhost and 127.0.0.1 work.
      host: '0.0.0.0',
      ...(devHttps && mode === 'development' ? { https: true } : {}),
    },
  };
});
