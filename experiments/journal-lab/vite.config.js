import { defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite';
import { journalApi } from './server/api.js';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'TYPESAFE_'), ...process.env };
  const middleware = journalApi(env);
  return {
    plugins: [
      preact(),
      {
        name: 'local-journal-api',
        configureServer(server) {
          server.middlewares.use(middleware);
        },
        configurePreviewServer(server) {
          server.middlewares.use(middleware);
        },
      },
    ],
  };
});
