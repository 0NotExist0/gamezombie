import { defineConfig } from 'vite';
import { setupMultiplayerServer } from './server/multiplayer.js';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000
  },
  preview: {
    host: '0.0.0.0',
    port: 3000
  },
  plugins: [
    {
      name: 'multiplayer-server',
      configureServer(server) {
        if (server.httpServer) {
          setupMultiplayerServer(server.httpServer);
        }
      },
      configurePreviewServer(server) {
        if (server.httpServer) {
          setupMultiplayerServer(server.httpServer);
        }
      }
    }
  ]
});
