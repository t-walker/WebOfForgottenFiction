import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// `base` comes from BASE_PATH so the same source works on GitHub Pages
// (project sites serve from /<repo-name>/) and on Netlify/Vercel (/).
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/',
})
