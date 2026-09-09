# web_app

Die Webfassung von barkeeper: dieselbe Rechnung wie die Terminal-App, als
statische Single-Page-App für GitHub Pages. Was das Werkzeug tut, steht in der
[README im Repo-Root](../README.md) — hier stehen nur die Entwickler-Notizen.

## Bauen und testen

Node 22 oder neuer (`.nvmrc` sagt 24, `nvm use` genügt):

> **`.npmrc` im Projekt ist Absicht.** Sie schreibt
> `registry=https://registry.npmjs.org/` fest. Ohne sie gilt die Registry aus
> `~/.npmrc`; ist dort eine interne Registry eingetragen, landen deren Adressen
> in `package-lock.json`, und der GitHub-Runner scheitert beim Installieren mit
> `npm error code E401 · Unable to authenticate` — er hat dafür keine
> Zugangsdaten. Eine Projektdatei sticht die Benutzerdatei, deshalb liegt sie
> hier. Nach einem Registry-Wechsel gehört die Lockfile komplett neu erzeugt
> (`rm -rf node_modules package-lock.json && npm install`) — ein einfaches
> `npm install` übernimmt sonst alte `resolved`-Adressen aus dem vorhandenen
> `node_modules`.

```sh
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173/warera-barkeeper/
npm run test       # Vitest einmal durchlaufen
npm run test:watch # Vitest im Wachmodus
npm run typecheck  # tsc --noEmit
npm run build      # Produktions-Build nach dist/
npm run check      # Typcheck + Tests + Build — das ist das Pflicht-Gate
```

`npm run check` ist das Gegenstück zu `make check` der Terminal-App und läuft in
CI vor jedem Deploy.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `src/lib/regen.ts` | Die Rechenlogik: Ticks zählen, Budget und Zielwert bestimmen, Auffüll-Zeitpunkt. Übersetzung von `internal/regen/regen.go`, ohne Abhängigkeiten. |
| `src/lib/hint.ts` | Der Tick-Hinweis und `targetAfterTick`, aus `internal/regen/hint.go`. |
| `src/lib/schedule.ts` | Uhrzeit lesen, nächstes Auftreten, Fallback-Anchor — aus `internal/regen/schedule.go`. |
| `src/lib/zone.ts` | Was in Go `*time.Location` erledigt: Wanduhrzeit lesen, Zeitpunkt aus Wanduhrzeit bauen, kalendarisch Tage schalten. Nur `Intl`, keine Bibliothek. |
| `src/lib/state.ts` | Setzt Zeitparameter und Leisten-Werte zusammen, aus `internal/ui/state.go`. |
| `src/lib/settings.ts` | Einstellungen samt `normalize` und `localStorage`, aus `internal/config`. |
| `src/lib/warera.ts` | Client für die drei öffentlichen tRPC-Endpunkte. Aufrufe sind **GET** mit JSON im `input`-Query-Parameter. |
| `src/lib/i18n/` | Übersetzungen: `index.ts` ist die Mechanik, jede Sprache eine Datei mit einem Katalog (`de.ts`, `en.ts`). Neue Sprache = neue Datei plus ein Eintrag in `REGISTRY`. |
| `src/components/` | Die Ansichten. `Header` zeigt den Rahmen der Rechnung, `BarCard` Leiste und Legende, `HintCard` den Tick-Hinweis samt Knopf, `SettingsPanel` die Einstellungen, `Explainer` den Erklärabschnitt. |
| `src/App.tsx` | Klammert alles: Uhr, Abruf, Status, Layout. |

Der Datenfluss ist derselbe wie im Terminal und einseitig: `settings`
(+ optionaler `Snapshot`) → `buildState` → `compute`/`computeHint` → Anzeige.
`regen.ts` und `hint.ts` kennen weder Einstellungen noch API noch React.

## Zwei Implementierungen, eine Wahrheit

Die Rechenlogik steht zweimal da: in Go unter `terminal_app/internal/regen` und
in TypeScript unter `src/lib`. Das ist bewusst so — ein WASM-Build hätte die
Go-Runtime in jede Seitenladung geschleppt —, aber es ist eine Gefahrenstelle.
Deshalb sind **die Testfälle mitportiert**: `src/lib/regen.test.ts` und
`hint.test.ts` enthalten dieselben Fälle wie `internal/regen/regen_test.go`,
`state.test.ts` dieselben wie `internal/ui/state_test.go`, mit denselben
deutschen Namen.

Dazu kommt die harte Klammer: **`spec/regen-cases.json`** im Repo-Root. Die
Datei beschreibt Rechenfälle samt erwartetem Ergebnis und wird von *beiden*
Testsuiten gelesen — hier `src/lib/spec.test.ts`, dort
`internal/regen/spec_test.go`. Erzeugt wird sie aus der Go-Fassung
(`cd terminal_app && make spec`), die damit die Urfassung der Rechnung ist.
Weicht die TypeScript-Fassung ab, wird `spec.test.ts` rot; ist die Datei
veraltet, schlägt `make check` in der Terminal-App fehl.

Wer an der Tick-Mechanik etwas ändert, ändert beide Seiten, erzeugt die
Vektoren neu und lässt beide Testsuiten laufen.

## Was gegenüber dem Terminal absichtlich anders ist

- **Die Gutschrift pro Tick ist keine Einstellung**, sondern `max / 10` (`regenFor`). Die
  Terminal-App lässt sie in der Config einstellen; hier steht sie nur als Information an der Leiste.
- **Zwei Ebenen in den Einstellungen**: vorne Spielername, Zielzeit und Zielzeit-Modus, dahinter
  („Mehr einstellen“) Zeitbasis, Zone, eigene Werte, Tipp-Fenster, Sprache, Zurücksetzen.
- **Geladen wird auf Klick**, nicht beim Tippen: der Spielername wird erst beim Verlassen des Feldes
  übernommen, und der Knopf daneben lädt mit dem Entwurf. Der Abruf hängt bewusst nicht am Namen —
  sonst geht pro Tastendruck eine Anfrage an WarEra (`src/App.test.tsx`).
- **Ein Snapshot gilt nur für den Namen, für den er geholt wurde** (`snapFor`). Danach zeigt das
  Abzeichen `nicht geladen`, und gerechnet wird wie ohne Abruf.
- **Der Tick-Hinweis ist ein Knopf**, der die vorgeschlagene Zielzeit übernimmt.
- **Kein `<label>` um eine Zeile mit Knopf** (`Row` ist ein `<div data-row=…>`, Beschriftungen
  hängen über `htmlFor` an ihrem Feld). Ein `<label>` leitet Klicks an das erste bedienbare Element
  weiter, `<button>` inklusive — vorher drückte ein Klick auf die Beschriftung die erste Option.
- **Die Vorschlagsliste am Namensfeld** löst jeden Treffer einzeln auf (die Suche der API gibt nur
  IDs her), entprellt 300 ms, ab drei Zeichen, höchstens sechs Treffer. Ein Klick übergibt die ID
  mit, damit der Name nicht neu aufgelöst wird — und verhindert `mousedown`, damit das Feld den
  Fokus behält: sonst übernimmt `onBlur` den Suchtext und die Liste ist weg, ehe der Klick ankommt.
- **Benachrichtigungen** gibt es nur, solange die Seite offen ist. Was fällig ist, entscheidet
  `lib/alerts.ts` ohne Browser-API und ist damit geprüft; der Tab-Titel trägt die Restzeit immer.
- **Der Fan-Projekt-Hinweis steht immer sichtbar** — kurz in der Kopfleiste, ausführlich im Fuß
  (`components/Disclaimer.tsx`), nie hinter einem Aufklapp-Abschnitt.

## Millisekunden statt time.Time

Zeitpunkte und Dauern sind durchgehend `number` — Millisekunden seit Epoch bzw.
Millisekunden Abstand. Damit ist die Tick-Arithmetik ganzzahlig, es gibt keine
versehentlich veränderten `Date`-Objekte, und `floorDiv`/`ceilDiv` verhalten
sich wie in Go (`Math.trunc` trunkiert Richtung null, genau wie Go — deshalb
stehen die beiden Funktionen in beiden Fassungen).

Die Zone kommt aus `zone.ts`. `instantFromWall` rechnet in zwei Durchgängen,
weil der Offset vom Ergebnis abhängt; das ist die Stelle, an der die
Zeitumstellung sonst eine Stunde verschluckt. Getestet wird gegen die
Umstellungen 2026 in `Europe/Berlin`.

## Kein User-Agent, kein Proxy

Die Terminal-App muss einen browserähnlichen User-Agent und `Origin` senden,
sonst antwortet Cloudflare vor `api2.warera.io` mit leerem Body. Im Browser
entfällt das: beide Header setzt der Browser selbst und lässt sich nicht
hineinreden. Nötig ist es auch nicht — die API schickt fremden Herkunftsadressen
`access-control-allow-origin: *`, der Preflight erlaubt `GET`. Deshalb geht die
Anfrage direkt aus der Seite, ohne Proxy und ohne Server. Außer `Accept` wird
kein Header gesetzt, damit es eine „simple request“ ohne Vorabfrage bleibt.

## Lesbarkeit ist geprüft, nicht geschätzt

`src/theme.test.ts` liest die Token aus `theme.css` und rechnet die
Kontrastverhältnisse nach: jede Textfarbe muss auf jeder Grundfläche
mindestens **4,5:1** erreichen (WCAG AA für kleinen Text). Die erste Palette kam
aus dem Terminal-Thema und fiel damit durch — `faint` lag bei 3,99:1, `danger`
bei 4,47:1.

Wer eine Farbe ändert, ändert sie im `@theme`-Block; der Test sagt sofort, ob
sie trägt. Kleinste Schriftgröße im Quellcode ist 0,78rem (≈ 12,5 px).

## Auf dem Handy

- Eingabefelder haben auf schmalen Anzeigen **1rem** Schriftgröße: darunter
  zoomt iOS Safari beim Antippen in die Seite hinein.
- Knöpfe, Auswahlflächen und Felder sind mindestens `min-h-11` (44 px) hoch —
  eine Daumenfläche, keine Mauszeigerfläche.
- Alles Mehrspaltige hat einen Breakpoint (`sm:`/`md:`) und stapelt darunter;
  die Knopfgruppe der Kopfleiste bekommt auf dem Handy eine eigene Zeile.
- `theme-color` färbt die Browserleiste, `text-size-adjust` verhindert das
  Aufblasen der Schrift beim Drehen.
- **Browser-Untergrenze:** Tailwind v4 erzeugt `@media (width>=40rem)`,
  `@property` und `color-mix()` — nötig ist ein Browser ab etwa 2023 (Safari
  16.4, Chrome 111). Ältere fallen auf das Handy-Layout zurück; damit die
  Balken-Zonen dort nicht verschwinden, setzt `ZONE_STYLE` neben dem Muster
  immer einen Vollton als `backgroundColor`.

## Farben

`src/theme.css` übernimmt die Palette aus dem Stylesheet von `app.warera.io`:
Grund `#0A0E10`, Flächen `#0F1517`/`#141C1F`/`#192327`, Ränder `#28383E`, Text
`#D0DDE1`, Akzent-Rot `#DA6E70`, dazu der harte 1px-Ring (`ring-game`), den die
Spieloberfläche an Karten und Knöpfen hat. Signalfarben (grün, orange, rot) sind
dieselben wie in `theme.go`. Schrift ist **Saira**, wie im Spiel.

Bewusst nur dunkel: WarEra hat keinen hellen Modus, eine halbherzige helle
Variante sähe daneben falsch aus. Neue Farben gehören als Token in den
`@theme`-Block, nicht als Literal an die Verwendungsstelle.

## Die vier Zonen des Balkens

Behalten, ausgebbar, Fehlbetrag, verbraucht — dieselben wie im Terminal, und sie
unterscheiden sich **nicht nur in der Farbe**, sondern auch im Muster
(gestreift, gegengestreift, gepunktet). Wer eine Zone ändert, ändert sie an drei
Stellen mit: `ZONE_STYLE` und `zonesFor` in `BarCard.tsx`, die `Legend` darunter
und die Liste in `Explainer.tsx`.

## Deployment

`.github/workflows/pages.yml` baut bei jedem Push auf `main`, der `web_app/`
berührt, und veröffentlicht `dist/` auf GitHub Pages. Die Seite läuft unter
**https://barkeeper.c0re.ninja/**.

Einmalig nötig in den Repo-Settings → Pages: Source auf „GitHub Actions“,
Custom domain auf `barkeeper.c0re.ninja`, danach „Enforce HTTPS“.

### base-Pfad und eigene Domain

`vite.config.ts` setzt `base: './'` — relativ. Damit läuft **derselbe Build**
unter beiden Adressen: unter dem Repo-Unterpfad
`https://corestriker.github.io/warera-barkeeper/` und unter einer eigenen Domain
im Wurzelverzeichnis. Möglich ist das nur, weil die Anwendung eine einzige Seite
ohne Routen ist; die Assets liegen immer neben der `index.html`. Ein absoluter
Pfad lässt sich beim Bauen erzwingen:

```sh
BASE_PATH=/unterordner/ npm run build
```

Die eigene Domain steht in `public/CNAME` — genau eine Zeile, der Hostname;
Vite kopiert die Datei unverändert nach `dist/`, und GitHub Pages liest sie von
dort. Dieselbe Domain muss zusätzlich in den Repo-Settings unter Pages → Custom
domain stehen, sonst liefert GitHub sie nicht aus. Wer die Domain wechselt,
ändert **beides** und die Links in den READMEs.

Im DNS zeigt `barkeeper.c0re.ninja` als `CNAME` auf `corestriker.github.io.`
