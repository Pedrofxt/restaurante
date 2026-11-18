import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O site é publicado em https://pedrofxt.github.io/restaurante/
export default defineConfig({
  base: process.env.VITE_BASE || '/restaurante/',
  plugins: [react()],
});
