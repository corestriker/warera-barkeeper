/**
 * Prüft, dass `dist/barkeeper.user.js` zum Quellstand passt.
 *
 * Die gebaute Datei liegt als einzige Build-Ausgabe im Repo, weil
 * `@updateURL` im Header auf sie zeigt. Damit kann sie veralten — jemand
 * ändert `src/`, committet, und die Roh-URL liefert weiter den alten Stand.
 * Dieselbe Sorge wie bei `spec/regen-cases.json` auf der Go-Seite, dieselbe
 * Antwort: das Gate merkt es.
 *
 * Geprüft wird gegen den Stand, den `vite build` gerade geschrieben hat —
 * `npm run check` baut vorher. Verglichen wird zusätzlich die Version im
 * Banner mit der aus `package.json`, damit eine vergessene Erhöhung auffällt.
 */
import { readFileSync } from 'node:fs'

const dist = readFileSync(new URL('../dist/barkeeper.user.js', import.meta.url), 'utf8')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const found = /^\/\/ @version\s+(\S+)$/m.exec(dist)?.[1]
if (found === undefined) {
  console.error('dist-check: im gebauten Skript steht kein @version')
  process.exit(1)
}
if (found !== pkg.version) {
  console.error(`dist-check: @version ist ${found}, package.json sagt ${pkg.version}`)
  console.error('  "npm run build" neu laufen lassen.')
  process.exit(1)
}
console.log(`dist-check: barkeeper.user.js ist Version ${found}`)
