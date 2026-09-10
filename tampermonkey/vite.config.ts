/**
 * Baut das Userscript zu einer einzigen Datei.
 *
 * Wichtig ist vor allem, was hier **nicht** passiert: die Rechenlogik wird
 * nicht abgeschrieben. `src/main.ts` importiert sie aus `../web_app/src/lib`,
 * der Bundler zieht sie mit hinein. Damit gibt es weiterhin genau zwei
 * Fassungen der Tick-Rechnung im Projekt — Go und TypeScript — und nicht drei.
 */
import { defineConfig } from 'vite'
import { BANNER } from './meta.ts'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Tampermonkey liest eine fertige Datei; kein Modulsystem, keine Chunks.
    lib: { entry: 'src/main.ts', formats: ['iife'], name: 'barkeeper', fileName: () => 'barkeeper.user.js' },
    // Lesbar halten: wer ein Userscript installiert, darf hineinsehen können.
    minify: false,
    target: 'es2022',
    rollupOptions: { output: { banner: BANNER, extend: true } },
  },
})
