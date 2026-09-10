/**
 * Der Metadatenblock des Userscripts.
 *
 * Er steht außerhalb von `src/`, weil er nur beim Bauen gebraucht wird: der
 * Bundler setzt ihn als Banner unverändert vor das Ergebnis. Ein Kommentar im
 * Quelltext würde beim Bündeln verschwinden.
 *
 * **Die Version kommt aus `package.json` und nirgendwo sonst her.**
 * Tampermonkey aktualisiert ein Skript nur, wenn `@version` größer geworden
 * ist — eine von Hand gepflegte zweite Stelle wäre genau die, die man vergisst.
 * Erhöht wird sie mit `npm version patch|minor|major`; das schreibt
 * `package.json` fort und setzt den Git-Tag gleich mit.
 */
import pkg from './package.json' with { type: 'json' }

export const VERSION: string = pkg.version

const RAW =
  'https://raw.githubusercontent.com/corestriker/warera-barkeeper/main/tampermonkey/dist/barkeeper.user.js'

export const BANNER = `// ==UserScript==
// @name         War Era - Barkeeper
// @namespace    https://barkeeper.c0re.ninja/
// @version      ${VERSION}
// @description  Shades the health and hunger bars by how far you may spend them down.
// @description:de  Färbt die Leisten für Leben und Hunger danach ein, wie weit du sie leerspielen darfst.
// @author       corestriker
// @homepageURL  https://github.com/corestriker/warera-barkeeper
// @supportURL   https://github.com/corestriker/warera-barkeeper/issues
// @downloadURL  ${RAW}
// @updateURL    ${RAW}
// @match        https://app.warera.io/*
// @icon         https://app.warera.io/favicon.ico
// @connect      api2.warera.io
// @run-at       document-idle
// @grant        none
// ==/UserScript==`
