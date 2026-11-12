import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Configuração do Vite com proxy para a API REST do Express (porta 3000)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
