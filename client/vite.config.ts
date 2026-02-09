import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    // Bind to all interfaces so both localhost and 127.0.0.1 work.
    host: '0.0.0.0',
  },
});

