import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  // Load env vars for this mode (reads .env, .env.production, etc.)
  const env = loadEnv(mode, process.cwd(), '');

  // Fail fast for production builds when VITE_API_BASE is not set
  if (mode === 'production' && !env.VITE_API_BASE) {
    throw new Error('VITE_API_BASE is required for production builds. Set VITE_API_BASE in frontend/.env or export it before building.');
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        // Proxy classify API to SAM Local (run `sam local start-api`)
        '/classify_transactions': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false,
        }
      }
    }
  };
});
