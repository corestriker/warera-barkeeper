# tampermonkey

Die dritte Oberfläche: ein Userscript, das die Rechnung **im Spiel** zeigt statt
daneben. Es greift an zwei Stellen in `app.warera.io` ein, beide additiv — es
entfernt nichts und klickt nichts an:

1. Ein Knopf neben der Benachrichtigungsglocke öffnet die Einstellungen
   (Zielzeit, Zielzeit-Modus) und zeigt die Zahlen, um die es geht:
   „ausgeben 42“ je Leiste, oder „voll um 14:00“, wenn die Zeit nicht mehr
   reicht.
2. Die Leisten für **Leben und Hunger** in der Kopfzeile werden umgefärbt —
   behalten, ausgebbar, Fehlbetrag, verbraucht, mit denselben Mustern wie in
   der Webapp.

**Einen Spielernamen tippt niemand ein.** Die eigene User-ID steht in der
Kopfzeile in den Links aufs eigene Profil (`/user/<id>/inventory` und
Nachbarn); das Skript liest sie dort ab und fragt damit direkt
`user.getUserLite`. Den Namen liefert die Antwort mit.

Energie und Unternehmertum bleiben unangetastet: die rechnet der Barkeeper
nicht.

## Die Rechnung steht nicht hier

`src/main.ts` importiert `regen`, `state`, `zones`, `settings` und den
API-Client aus `../web_app/src/lib`; der Bundler zieht sie mit hinein. Damit
gibt es weiterhin genau **zwei** Fassungen der Tick-Rechnung im Projekt — Go
und TypeScript — und nicht drei. Wer an der Mechanik etwas ändert, ändert sie
in `web_app/src/lib`, baut hier neu, und beide Oberflächen stimmen wieder
überein.

Aus demselben Grund liegt die Zoneneinteilung seit diesem Stand in
`web_app/src/lib/zones.ts` statt in `BarCard.tsx`: dort hing sie an React und
war von hier nicht erreichbar. `BarCard` reicht sie weiter, für die Webapp
ändert sich nichts.

## Bauen

Node 22 oder neuer (wie `web_app`; `.nvmrc` im Repo-Root sagt 24):

```sh
cd tampermonkey
npm install
npm run check     # tsc --noEmit + vite build — das Pflicht-Gate
npm run build     # nur bauen
```

Ergebnis ist `dist/barkeeper.user.js`, eine einzige Datei, absichtlich **nicht
minimiert**: wer ein Userscript installiert, darf hineinsehen können.

> **`.npmrc` ist Absicht**, aus demselben Grund wie in `web_app`: sie schreibt
> `registry=https://registry.npmjs.org/` fest, damit keine interne Registry aus
> `~/.npmrc` in der Lockfile landet.

## Versionieren

Tampermonkey aktualisiert ein installiertes Skript nur, wenn `@version` größer
geworden ist. Die Version steht deshalb an **genau einer** Stelle — in
`package.json` — und wird von `meta.ts` in den Banner gezogen. Ein Sprung:

```sh
npm version patch     # oder minor / major
```

Das erhöht `package.json`, baut über den `version`-Lebenszyklus `dist/` neu und
legt die Datei zum Committen bereit. **Ohne Git-Tag**, und das ist Absicht:
`npm version` würde sonst `v0.1.1` im Repo-Root setzen, und
`.github/workflows/release.yml` baut aus *jedem* `v*`-Tag ein Release der
Terminal-App. Abgeschaltet ist es über `git-tag-version=false` in der `.npmrc`.

`npm run check` prüft zum Schluss mit `dist-check`, dass die Version im
gebauten Skript zu `package.json` passt. Damit fällt auf, wenn `dist/`
veraltet ist — dieselbe Sorge wie bei `spec/regen-cases.json` auf der Go-Seite,
dieselbe Antwort.

## Installieren

**Der bequeme Weg:** Tampermonkey installieren, dann
`dist/barkeeper.user.js` aus dem Repo öffnen — die Erweiterung erkennt die
Endung `.user.js` und bietet die Installation an. `@updateURL` zeigt auf die
Roh-URL im Repo, Aktualisierungen kommen also von selbst.

**Zum Entwickeln:** im Tampermonkey-Dashboard unter *Einstellungen → Allgemein*
den Konfigurationsmodus auf *Erweitert* stellen, dann lädt
`// @require file:///…/tampermonkey/dist/barkeeper.user.js` bei jedem
Seitenaufruf neu. Chrome braucht dafür zusätzlich „Zugriff auf Datei-URLs
zulassen“ in den Details der Erweiterung.

Deshalb liegt `dist/barkeeper.user.js` als einzige Ausnahme mit im Repo,
obwohl `dist/` sonst ignoriert wird.

## Umfärben statt überlegen

Es wird kein eigener Balken über die Leiste gelegt — die Leiste des Spiels
selbst bekommt andere Farben. Beteiligt sind ihre zwei Elemente: die **Bahn**
über die volle Breite und die **Füllung**, die das Spiel per
`transform: scaleX(…)` auf den Ist-Wert staucht.

- Die Bahn trägt „verbraucht“ (gepunktet) und, wenn die Zeit nicht mehr reicht,
  das Band für den Fehlbetrag.
- Die Füllung trägt den Verlauf von „behalten“ zu „ausgebbar“. Ihre Breite
  bleibt Sache des Spiels; sie steht ohnehin genau für den Ist-Wert, und der
  ist auch bei uns die Grenze zwischen ausgebbar und verbraucht.

Zwei Eigenheiten, die daraus folgen:

- **`!important` und CSS-Variablen.** React schreibt `background` als
  inline-Style auf die Füllung. Eine Regel aus dem Stylesheet mit `!important`
  sticht das; die veränderlichen Zahlen reicht das Skript als Custom Properties
  (`--bk-split`, `--bk-band-x`, `--bk-band-w`) nach, denn die fasst React
  nicht an.
- **Das Streifenmuster auf der Füllung wird mitgestaucht.** `scaleX` wirkt auch
  auf den Hintergrund, der 45°-Winkel ändert sich also mit dem Ist-Wert. Als
  Muster bleibt es erkennbar — und darum geht es: die Zonen sollen auch ohne
  Farbe unterscheidbar sein.

Die Einteilung selbst kommt weiter aus `zonesFor` in
`web_app/src/lib/zones.ts`; das Skript verteilt deren Anteile nur auf die
beiden Elemente.

## Wie die Leisten gefunden werden

Das ist die wackelige Stelle, und sie ist es zwangsläufig: WarEra liefert
minimierte Klassennamen aus, die sich mit jedem Build ändern. Das Skript hängt
sich deshalb an drei Dinge, die aus dem Aufbau der Seite kommen und nicht aus
einem Klassennamen:

- `#layoutUserMenu` — die Kopfzeile oben rechts, eine feste ID im Spiel.
- Die **Füllung** jeder Leiste trägt ein `transform: scaleX(…)` direkt im
  `style`-Attribut. Gesucht wird der tiefste Vorfahr, unter dem genau **vier**
  davon hängen; das ist die Zeile mit Leben, Hunger, Energie und
  Unternehmertum, in dieser Reihenfolge.
- Die Glocke ist der Link auf `/notifications` (oder `/world`, wenn man schon
  dort ist). Der Knopf wird davor eingehängt.
- Die eigene User-ID steht in `href="/user/<24 Hex-Stellen>…"` in derselben
  Kopfzeile.

Findet das Skript die Leisten nicht, färbt es nichts ein und sagt das im
Panel — die Zahlen stimmen dann trotzdem. **Getestet ist das gegen die
eingeloggte Oberfläche noch nicht**; die Anker stammen aus dem ausgelieferten
Bundle, nicht aus einem Durchlauf im Browser.

## Was hier gilt

- **Kein Schreibzugriff aufs Spiel.** Wie in den anderen beiden Fassungen wird
  nur gelesen: der eigene Abruf geht gegen `user.getUserLite`,
  `search.searchAnything` und `gameConfig.getDates`, alle öffentlich und
  lesend. Das Skript klickt nichts an und löst keine Aktion aus.
- **Eigener Speicher.** Zielzeit und Modus liegen unter
  `barkeeper.userscript.v1` im `localStorage` von `app.warera.io`, getrennt von
  der Webapp. Name und ID stehen nur dort, weil `buildState` einen Namen
  braucht; eingegeben wird beides nicht.
- **Deutschsprachig kommentiert**, wie der Rest des Projekts; nur Identifier
  bleiben englisch. Die Oberfläche selbst spricht Deutsch oder Englisch, je
  nach `navigator.language`.
