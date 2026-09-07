import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Relativer base-Pfad, damit derselbe Build unter beiden Adressen läuft: unter
// https://corestriker.github.io/warera-barkeeper/ (Repo-Unterpfad) und unter
// einer eigenen Domain im Wurzelverzeichnis. Möglich ist das nur, weil die
// Anwendung eine einzige Seite ohne Routen ist — die Assets liegen immer
// neben der index.html.
//
// Für einen Sonderfall lässt sich der Pfad beim Bauen erzwingen:
// BASE_PATH=/unterordner/ npm run build
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react(), tailwindcss()],
  test: {
    // jsdom für die Komponententests; die Logik-Tests brauchen es nicht,
    // stören sich aber nicht daran.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
