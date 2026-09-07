# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Was das ist

**War Era - Barkeeper** beantwortet für das Browserspiel [WarEra](https://warera.io) eine Frage: wie weit
darf ich Health und Hunger leerspielen, damit sie zu einer Zielzeit wieder auf 100 % stehen? Es gibt
zwei Oberflächen für dieselbe Rechnung, jede in ihrem Unterordner — der Repo-Root bleibt leer:

- `terminal_app/` — die Konsolenanwendung (Go + Bubble Tea), die Urfassung.
- `web_app/` — dieselbe Fachlichkeit als statische Single-Page-App (React + TypeScript + Tailwind),
  veröffentlicht auf GitHub Pages.

**Die Rechenlogik steht deshalb zweimal da** (`terminal_app/internal/regen` in Go,
`web_app/src/lib` in TypeScript). Das ist bewusst so — ein WASM-Build hätte die Go-Runtime in jede
Seitenladung geschleppt —, aber es ist die Gefahrenstelle des Projekts: **wer an der Tick-Mechanik
etwas ändert, ändert beide Seiten und beide Testsuiten.** Die Testfälle sind gegenseitig portiert und
tragen dieselben Namen.

Der Anzeigename steht als `ui.AppName` in `internal/ui/theme.go` und wird von Intro, Dashboard und
`--version` benutzt. **Binary, Modulname und Config-Verzeichnis heißen weiterhin `barkeeper`** — die
Pfade (`~/.config/barkeeper/`, `$BARKEEPER_CONFIG`) sollen sich nicht ändern.

Die Codebase ist durchgehend **deutschsprachig**: Kommentare, Doc-Comments, Fehlertexte, UI-Strings und
Test-Namen. Neuer Code hält das bei; nur Identifier bleiben englisch.

## Befehle

Die Terminal-App läuft aus `terminal_app/` (dort liegen `go.mod` und das `Makefile`):

```sh
cd terminal_app
make build        # Binary fürs eigene System (CGO_ENABLED=0)
make run          # bauen und starten
make check        # go vet + go test ./... + gofmt-Prüfung — das ist das Pflicht-Gate
make test         # nur Tests
make fmt          # gofmt -l -w .
make build-all    # linux/darwin/windows × amd64/arm64 nach dist/
```

Einzelnen Test laufen lassen:

```sh
go test ./internal/regen -run TestCountTicks -v
go test ./internal/regen -run 'TestCountTicks/Zielzeit_exakt_auf_einem_Tick' -v
```

Manuell prüfen, ohne die TUI zu starten (rechnet einmal und gibt Text aus):

```sh
go run . --once
BARKEEPER_CONFIG=/tmp/bk.toml go run . --once   # mit isolierter Config
```

Die Webapp läuft aus `web_app/` (Node 22+, `.nvmrc` sagt 24):

```sh
cd web_app
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173/warera-barkeeper/
npm run check      # tsc --noEmit + vitest run + vite build — das Pflicht-Gate
npm run test       # nur Tests
npm run build      # Produktions-Build nach dist/
```

Einen einzelnen Web-Test laufen lassen:

```sh
npx vitest run src/lib/regen.test.ts
npx vitest run -t 'Zielzeit exakt auf einem Tick'
```

## Architektur

```
main.go                  Flags (--config/--once/--version), Config laden, TUI starten,
                         beim Beenden nur den userId-Cache zurückschreiben
internal/regen           die Rechenlogik — nur Standardbibliothek, voll getestet
internal/config          TOML laden/atomar speichern, Normalize() repariert kaputte Werte
internal/warera          Client für drei öffentliche, lesende tRPC-Endpunkte
internal/i18n            Übersetzungen: eine Datei pro Sprache, Katalog = ID → Text
internal/ui              Bubble Tea: app.go routet Intro/Dashboard/Menü, once.go rendert --once,
                         theme.go hält AppName und die Farbpalette
```

Der Datenfluss ist einseitig: `config` (+ optionaler `warera.Snapshot`) → `ui.buildState` →
`regen.Compute`/`regen.ComputeHint` → Rendering. `regen` kennt weder Config noch API noch UI, und das
soll so bleiben — es ist der einzige Ort, an dem Spielmechanik als Rechnung steht.

### Der Stunden-Tick ist das zentrale Konzept

WarEra regeneriert **nicht kontinuierlich**, sondern in Stunden-Ticks: zu jedem Tick werden `max/10`
gutgeschrieben, gedeckelt bei `max`; Überschuss verfällt. Daraus folgt alles Weitere:

- `regen.Compute` liefert zwei Zählweisen: `Safe` zählt Ticks im offenen Intervall `(Base, Target)`,
  `Risky` im halboffenen `(Base, Target]`. **Angezeigt wird nur `Safe`** — eine Zahl, die hält. Ein
  Tick exakt auf der Zielzeit ist ein Münzwurf und wird deshalb nie mitgezählt; `Risky` bleibt in der
  Rechnung, weil es die Mechanik vollständig abbildet, hat in der Oberfläche aber nichts verloren
  (und die Wörter „sicher"/„riskant" schon gar nicht — der Nutzer bekommt eine Zahl, keine Wahl).
- Eine Minute Verschiebung der Zielzeit kann eine ganze Regenerationsstunde kosten oder schenken. Genau
  das ist der Zweck von `regen/hint.go`: liegt die Zielzeit im Hinweis-Fenster vor einem Tick, wird
  `Tick + 5min` als neue Zielzeit vorgeschlagen und der Gewinn beziffert.
- Das Tick-Raster kommt als Anchor aus `gameConfig.getDates` → `nextRegenAt`, **nicht** aus einer fest
  verdrahteten „volle Stunde UTC"-Annahme; das ist nur der Offline-Fallback (`NextWholeHourUTC`).
- Gerechnet wird durchgehend mit absoluten `time.Time`-Werten und Tick-Indizes (`floorDiv`/`ceilDiv`,
  bewusst statt Go-Trunkierung), damit Zeitzonen und die Sommerzeitumstellung nichts verfälschen.
  Tageswechsel laufen über `AddDate`, damit 14:05 auch an einem 23-Stunden-Tag 14:05 bleibt.
- Der Hinweis ist der Ersatz für die zweite Zahl: statt einen wackeligen Wert anzubieten, schlägt das
  Tool eine Zielzeit vor, mit der der Tick verlässlich zählt.
- Hunger regeneriert **fraktional** (0,4 pro Tick bei Max 4). Nirgends auf ganze Zahlen runden —
  `ui.num`/`ui.pct` formatieren genau deshalb ganzzahlig nur dann, wenn der Wert ganzzahlig ist.

Jede Verhaltensänderung in `internal/regen` gehört mit einem Testfall in
`internal/regen/regen_test.go` abgesichert — das ist auch die Erwartung an fremde PRs (siehe README).

### Screen-Flow, Erststart und Overlays

`main` erkennt am fehlenden Config-File den ersten Start und gibt das als `firstRun` an `ui.New`.
Daraus folgt genau ein Sonderweg, gebündelt in `Model.leaveOverlay`:

- **Erster Start:** Erklärung → Einstellungen. Ohne Spielername und Zielzeit wäre die Berechnung
  geraten.
- **Jeder weitere Start:** direkt aufs Dashboard, weil `ShowIntroOnStart` im Default **aus** ist.
- **Zwei Textseiten als Overlay:** `i` = Erklärung (`intro.go`), `?`/`h` = Tastenhilfe (`help.go`).
  `toggleOverlay` merkt sich `prevScreen`, dieselbe Taste schließt wieder, die andere wechselt direkt
  hinüber; `returnScreen` führt zurück. Beide sind von Dashboard **und** Menü aus erreichbar.
- **„Config löschen"** (`actionReset` → `Model.resetConfig`) braucht zwei `↵`: der erste setzt
  `menuModel.confirm`, der zweite löscht. Cursorwechsel und `esc` verwerfen die Bestätigung. Danach
  ist der Pfad noch gesetzt, die Werte stehen auf Default, `api` auf `apiOff` — und der nächste Start
  ist wieder ein Erststart.

Diese Wege sind der Grund für `internal/ui/app_test.go` (dem zweiten Testfile neben `regen`); wer am
Routing oder am Löschen dreht, hält die Tests dort aktuell.

### Version

`var version` in `main.go` trägt den gepflegten Standardwert. `make build` überschreibt ihn per
`-ldflags -X main.version=…` **nur**, wenn `git describe --tags --always --dirty` etwas liefert —
sonst entfällt das Flag. So steht im Kopf nie ein nacktes `dev`, auch nicht ohne Git. Für ein Release
also Tag setzen oder den Wert in `main.go` mitziehen.

### Farben

`theme.go` übernimmt die Palette aus dem Stylesheet von `app.warera.io`: Grund `#161A1D`, Ränder
`#28383E`, Text `#D0DDE1`, Akzent-Rot `#DA6E70`. Jede Farbe ist ein `lipgloss.AdaptiveColor`, weil der
Terminal-Hintergrund uns nicht gehört: `Dark` ist der Originalwert, `Light` dessen abgedunkelte
Entsprechung. Neue Farben gehören in dieselbe Liste, nicht als Literal an die Verwendungsstelle.

### API-Client: zwei Stolperstellen

- **Aufrufe sind GET, nicht POST.** Die Eingabe steckt JSON-kodiert im Query-Parameter `input`, die
  Antwort in einer tRPC-Hülle `{result:{data:…}}` bzw. `{error:{…}}`.
- **Der User-Agent ist nicht optional.** Cloudflare vor `api2.warera.io` antwortet auf
  werkzeugtypische User-Agents teils mit leerem Body; der Client schickt einen browserähnlichen Agent
  plus `Origin: https://app.warera.io`. Nicht „aufräumen".

Genutzt werden `search.searchAnything` (Name → `userId`, wird gecacht), `user.getUserLite` (Max-, Ist-
und Regen-Werte) und `gameConfig.getDates` (Tick-Anchor). Alles öffentlich und lesend, kein API-Key,
keine Zugangsdaten, keine Schreibzugriffe — diese Eigenschaft ist ein Versprechen der README und darf
nicht aufgeweicht werden.

### Zielzeit: Uhrzeit oder Pillen-Debuff

`cfg.TargetMode` entscheidet, woher `Params.Target` kommt. **Default ist `TargetModeDebuff`**: läuft
einer, ist sein Ende die interessante Frist; läuft keiner, gilt ohnehin die Uhrzeit.

- `TargetModeClock`: `regen.NextOccurrence` auf `cfg.TargetTime` — eine Wanduhrzeit, die bei Bedarf
  auf morgen rollt.
- `TargetModeDebuff`: `snap.User.Buffs.DebuffEndAt` aus `user.getUserLite`. Das ist ein **absoluter
  Zeitpunkt**, kein Uhrzeit-Muster — kein `NextOccurrence`, keine Tagesrolle.
- `TargetModeDebuffHour`: `regen.TargetAfterTick(params, end)` — der erste Tick **auf oder nach** dem
  Debuff-Ende plus `HintOffset`. Für wen die Pille zur runden Stunde dran ist: ein Tick mehr Budget
  gegen eine halbe Stunde Wartezeit. Genau 15:00 als Ziel wäre sinnlos (derselbe Tick-Satz wie 14:34)
  und der 15:00-Tick ein Münzwurf — deshalb die fünf Minuten.

`State.Target` (`TargetFromClock`/`FromDebuff`/`FromDebuffTick`) sagt, welcher Weg gegriffen hat.
Liegt das Debuff-Ende in der Vergangenheit, fehlt es oder gibt es keinen Snapshot, bleibt es bei der
Uhrzeit. Der Kopf beschriftet jeden Fall: `Debuff-Ende 14:34`, `Ziel nach Debuff 15:05`,
`Ziel 14:05 (kein Debuff aktiv)` — letzteres nur im API-Modus, denn ohne Abruf kann von einem Debuff
niemand wissen. Im Menü markiert `debuffDrivesTarget` die Zielzeit-Zeile als „Rückfall", solange ein
Debuff die Zielzeit setzt. Weil das Tick-Raster für `DebuffHour` gebraucht wird, steht `st.Params` in
`buildState` **vor** der Zielzeit-Auflösung.

### Zwei Betriebsarten, nie gemischt

`ui.APIMode(cfg)` (Spielername gesetzt **und** `api.enabled`) entscheidet, woher *alle* Werte kommen —
`buildState` mischt nicht:

| | API-Modus | manueller Modus |
|---|---|---|
| Max, Regen-Rate | `user.getUserLite` | `cfg.Bars` |
| Ist-Wert | `currentBarValue` | keiner → Annahme „jetzt voll" |
| angezeigte Zahl | `LeftSafe` (Ist-Wert → Zielwert) | `Safe.Budget` |
| Kopf der Leiste | `117.5 / 140` | `max 140` |

Daraus folgen drei Regeln, die leicht wieder kaputtgehen:

- **Ein Abruf schreibt nie in `cfg.Bars`.** Früher spiegelte `syncBarsToConfig` die API-Werte in die
  Config und überschrieb damit die selbst eingetragenen Werte des Nutzers. Das ist entfernt; die
  API-Werte leben ausschließlich im Snapshot.
- **Die Max-Zeilen im Menü sind im API-Modus gesperrt** (`barField.disabled`) und zeigen über
  `Model.apiBarValue` den Wert aus dem Abruf. Eine gesperrte Zeile darf nie eine Zahl anzeigen, die
  gerade nicht gilt.
- **Im API-Modus ohne Antwort** bleiben die Config-Werte, aber **kein** Ist-Wert wird erfunden; das
  Badge zeigt `⚠ offline`.

Liegt der Ist-Wert unter dem Zielwert, wird nicht „ausgeben 0" gemeldet, sondern `regen.FullAt` — die
Uhrzeit, zu der die Leiste wieder bei 100% ist (`ceil((Max−Ist)/Regen)` Ticks ab dem nächsten Tick).
Das ist die Information, die dann zählt.

### Menü: Abschnitte, Sichtfenster, Fokus

`field.sectionID` gruppiert die Zeilen, die Überschrift zeichnet `viewMenu` beim Wechsel selbst — die
Feldliste bleibt flach, die Cursor-Logik unberührt. Gegliedert wird nach der Frage, **wann eine
Einstellung gilt**: `menu.s.target` (immer), `menu.s.api` (nur mit Spielername), `menu.s.manual` (nur
ohne), `menu.s.display`, `menu.s.config`. `sectionTitle` vermerkt am jeweils unwirksamen Abschnitt,
warum er gerade nicht zählt.

Mit den Überschriften ist das Menü höher als ein kleines Terminal, deshalb schneidet `windowRows` die
Zeilen auf `m.height` zu und hält die Cursor-Zeile im Bild (`↑ 3 weitere` / `↓ 5 weitere`). Ist die
Höhe 0 — Tests, Pipes, vor dem ersten `WindowSizeMsg` — bleibt alles stehen.

Der Spielername steht seit der Gruppierung nicht mehr an erster Stelle; beim Erststart springt der
Cursor über `menuModel.focus("username")` dorthin.

### Debuff-Meldung im Hauptfenster

`renderDebuff` meldet über den Leisten einen laufenden Pillen-Debuff, **in jedem Modus** — im
Uhrzeit-Modus ist er die Alternative, die einen Tastendruck weit weg liegt. `State.DebuffEnd` trägt das
Ende, unabhängig davon, ob die Zielzeit daran hängt; die Views lesen ausschließlich `State`, nicht
`m.snap`.

**Der Pillen-Code (`buffs.debuffCodes`) wird bewusst nicht angezeigt** — „Pillen-Debuff" genügt, für
die Rechnung zählt nur das Ende. Ein Testfall verbietet, dass er in einer Ansicht auftaucht.

Jede Fassung sagt nur, was der Kopf **nicht** schon zeigt (im Debuff-Modus steht die Uhrzeit dort,
hier bleibt die Restzeit) — sonst wird die Zeile auf üblichen Breiten zweizeilig. Restzeit über
`fmtDurationShort` ohne Sekunden. Hängt die Zielzeit am Debuff, ist die Zeile `styHint` statt
`styMuted`. `TestHinweisAufDenDebuff` prüft alle drei Modi, den fehlenden, den abgelaufenen und den
Fall ohne Abruf — und dass die Meldung bei Breite 74 einzeilig bleibt.

### Kopfzeile: nichts umbrechen

Die erste Kopfzeile muss in **eine** Zeile passen, sonst klappt mitten in „Basis jetzt 08:34" um und
sieht wie ein Fehler aus. `renderHeader` baut sie deshalb mehrfach und lässt bei Platzmangel der
Reihe nach die verzichtbaren Teile weg: erst die Pillen-Codes, dann die Basis.
`TestKopfPasstInEineZeile` prüft alle drei Zielzeit-Modi über die Breiten `minWidth`, 70 und
`maxWidth`.

### Balken und Legende

Der Balken läuft immer über die volle Breite von 0 bis `Max`, mit bis zu vier Zonen: `█` behalten
(`styKeep`), `░` ausgebbar (`stySafe`), `▒` Fehlbetrag (`styErr`), `·` verbraucht (`styBorder`).
Fehlbetrag und ausgebbar haben **bewusst verschiedene Zeichen**, nicht nur verschiedene Farben — die
Anzeige muss auch ohne Farbe lesbar bleiben.

`legendFor` baut die Legende aus genau den Zonen, die gerade vorkommen (kein „verbraucht" ohne
Ist-Wert, kein „fehlt" ohne Fehlbetrag), `renderLegend` bricht sie bei schmaler Anzeige um. Wer eine
Zone am Balken ändert, ändert sie an drei Stellen mit: `renderGauge`, `legendFor` und die ausführliche
Liste in `help.go`.

### Sprachen

Kein user-sichtbares Literal in `internal/ui` — alles läuft über `m.t("id", args…)` bzw. den
`i18n.Printer`, den freie Funktionen übergeben bekommen. `Model.p` wird in `New` aus
`cfg.Language` aufgelöst (leer = `$LC_ALL`/`$LANG`/`$LANGUAGE`, unbekannt = Englisch) und **muss nach
jedem Sprachwechsel neu gesetzt werden** (`activate`, `resetConfig`) — sonst hängt die nächste
Meldung in der alten Sprache.

- **Menüfelder halten IDs** (`labelID`, `helpID`) und lösen erst beim Zeichnen auf; `get`/`set`
  bekommen den Printer, weil Werte („an"/„aus") und Eingabefehler übersetzt gehören.
- **Literale Prozentzeichen im Katalog verdoppeln** (`100%%`): `% s` ist für `fmt.Sprintf` ein
  Verb mit Leerzeichen-Flag. `T` löst `%%` auf, wenn keine Argumente kommen.
- **Neue Sprache = eine Datei** in `internal/i18n` mit `init()` + `Register`. Menü und
  Autoerkennung finden sie über `i18n.Codes()` von selbst; nichts anderes anfassen.
- **Tests halten die Kataloge zusammen**: gleiche ID-Menge wie Englisch (die Referenz), gleiche
  Platzhalterzahl, keine nackten Prozentzeichen, und `TestKeineFehlendenIDsInDenScreens` rendert
  jeden Screen in jeder Sprache und sucht die `!id`-Markierung fehlender Texte.
- **Technische Fehler bleiben englisch** und werden unübersetzt durchgereicht (`config`, `warera`,
  `regen`). Übersetzt wird nur, was den Spieler betrifft: die Sentinels `warera.ErrNotFound`,
  `ErrAmbiguous`, `ErrNoUsername` in `Model.apiErrText`, und die Eingabefehler im Menü.
- **UI-Tests setzen die Sprache explizit** (`testCfg()` → `"de"`), damit sie nicht am `$LANG` des
  Rechners hängen, auf dem sie laufen.

### Statuszeile

Die Zeile unter den Leisten berichtet vom Ausgang der **letzten** Aktion, nicht von einem Zustand.
Deshalb setzt jeder Zweig sie: Abruf starten löscht die alte Meldung (das Badge im Kopf zeigt
`◌ lädt …`), Erfolg meldet die Uhrzeit, Fehlschlag den Grund. Erfolgsmeldungen laufen nach
`statusTTL` über den Sekundentakt aus (`expireStatus`), Fehler und Rückfragen bleiben stehen. Wer
einen neuen Zweig einbaut, der einen Abruf oder eine Aktion auslöst, setzt dort auch den Status —
sonst bleibt die vorige Meldung stehen und behauptet etwas Falsches.

### Fehlertoleranz als Prinzip

Das UI blockiert nie aufs Netz: es ist sofort da, der Abruf läuft als `tea.Cmd` im Hintergrund und die
Werte trudeln nach. Fällt die API aus, wird mit den Config-Werten weitergerechnet und der Zustand im
Kopf als `⚠ offline` markiert. Fehlt nur `nextRegenAt`, bleiben die Leisten-Werte trotzdem gültig.
Live-Werte werden nach jedem Abruf in die Config gespiegelt (`syncBarsToConfig`), damit der
Offline-Fallback nicht auf uralten Zahlen sitzt.

### Config-Verhalten

Die Config wird beim ersten Start automatisch mit kommentiertem Header angelegt. `Load` parst **auf die
Defaults drauf**, damit neue Felder in alten Dateien ihren Standardwert behalten; `Normalize` repariert
danach unsinnige Werte. `Save` schreibt atomar (Nachbardatei + `os.Rename`).

Beim Beenden schreibt `main.saveUserIDCache` **nur** die aufgelöste `user_id` zurück — ungespeicherte
Menü-Änderungen werden absichtlich verworfen, gespeichert wird nur über die Menü-Aktion.

Pfad-Auflösung: `--config` → `$BARKEEPER_CONFIG` → `os.UserConfigDir()/barkeeper/config.toml`.

## Die Webapp (`web_app/`)

Fachlich identisch, technisch anders. Was gilt:

```
src/lib/regen.ts     Port von internal/regen/regen.go    + regen.test.ts
src/lib/hint.ts      Port von internal/regen/hint.go     + hint.test.ts
src/lib/schedule.ts  Port von internal/regen/schedule.go
src/lib/zone.ts      was in Go *time.Location erledigt   + zone.test.ts
src/lib/state.ts     Port von internal/ui/state.go       + state.test.ts
src/lib/settings.ts  Port von internal/config            + settings.test.ts
src/lib/warera.ts    Client für die drei tRPC-Endpunkte  + warera.test.ts
src/lib/i18n/        index.ts + eine Datei pro Sprache   + i18n.test.ts
src/components/      die Ansichten                       + screens.test.tsx
src/App.tsx          Uhr, Abruf, Status, Layout
```

### Was im Web anders ist

- **Zeit ist `number`**, nicht `time.Time`: Millisekunden seit Epoch. Damit bleibt die
  Tick-Arithmetik ganzzahlig. `floorDiv`/`ceilDiv` sind mitportiert, weil `Math.trunc` wie Go
  Richtung null trunkiert.
- **Zonen ohne Bibliothek**: `zone.ts` baut über `Intl` nach, was `*time.Location` kann.
  `instantFromWall` braucht **zwei Durchgänge**, weil der Offset vom Ergebnis abhängt — das ist die
  Stelle, an der die Zeitumstellung sonst eine Stunde verschluckt. `addWallDays` ist das `AddDate`
  aus Go: kalendarisch, nicht 24 Stunden.
- **Kein User-Agent, kein Proxy.** Den browserähnlichen Agent und `Origin` setzt der Browser selbst
  und lässt sich nicht hineinreden; nötig ist es auch nicht, denn `api2.warera.io` schickt fremden
  Herkunftsadressen `access-control-allow-origin: *`. Außer `Accept` wird kein Header gesetzt, damit
  es eine „simple request“ ohne Vorabfrage bleibt. Nicht „aufräumen“ und keinen Proxy einbauen.
- **Platzhalter sind `{0}`**, nicht `%s`. Damit entfällt die `%%`-Falle des Go-Katalogs; ein Test
  verbietet übernommene Sprintf-Verben in den Katalogen.
- **Gespeichert wird sofort** in den `localStorage` (`barkeeper.settings.v1`), es gibt keinen
  Speichern-Knopf. `loadSettings` liest wie `config.Load` **auf die Defaults drauf**, `normalize`
  repariert danach. Jeder Zugriff steckt in `try/catch` — ein privates Fenster darf die Seite nicht
  umbringen.
- **Der Tick-Hinweis ist ein Knopf.** Hängt die Zielzeit am Debuff, schaltet er auf den Modus
  „Debuff, nächste Stunde“ — dort eine Uhrzeit einzutragen würde nichts ändern.
- **Nachgeladen wird nach jedem Tick-Wechsel**, nicht auf einem festen Intervall: zwischen zwei Ticks
  ändert sich im Spiel nichts. `api.cacheMinutes` ist die Frischeschranke davor.
- **Die Gutschrift pro Tick ist keine Einstellung.** Sie ist `max / 10` (`regenFor` in
  `settings.ts`) — eine Rechnung des Spiels, keine Frage an den Nutzer. `BarSettings` trägt deshalb
  nur `max`; `normalize` wirft eine mitgespeicherte Rate weg. Angezeigt wird die Rate trotzdem, an
  der Leiste und als Hilfstext am Maximum.
- **Der Spielername wird erst beim Verlassen des Feldes übernommen** (`commitOn="blur"`), und der
  Abruf hängt **nicht** am Namen: geladen wird über den Knopf neben dem Feld (`onLoad`) oder „Werte
  holen“ oben. Vorher hing der Auto-Abruf am Namen und schickte pro Tastendruck eine Anfrage an
  WarEra; `src/App.test.tsx` hält das fest.
- **Ein Snapshot gehört zu dem Namen, für den er geholt wurde** (`snapFor`, kleingeschrieben).
  Stimmt er nicht mehr, gilt der Snapshot nicht und das Abzeichen zeigt `nicht geladen` — sonst
  stünden fremde Zahlen unter einem neuen Namen. Verglichen wird mit dem **angefragten** Namen, nicht
  mit dem, den die API zurückgibt: die Suche findet zu „c0r“ auch „c0re“.
- **Kein `<label>` um eine Zeile mit Knopf.** Ein `<label>` leitet jeden Klick an das erste
  bedienbare Element darin weiter, und `<button>` gehört dazu: mit einem `<label>` um die ganze Zeile
  drückte ein Klick auf die Beschriftung oder den Hilfstext die erste Option — bei der
  Zurücksetzen-Zeile beim zweiten Klick „Ja, zurücksetzen“, also Datenverlust. `Row` ist deshalb ein
  `<div data-row=…>`; Beschriftungen von Einzelfeldern hängen über `htmlFor`/`useId` an genau ihrem
  Feld, Knopfgruppen bekommen `role="group"` samt `aria-label`. Drei Tests halten das fest, darunter
  „legt kein `<label>` um einen Knopf“.
- **Zwei Ebenen in den Einstellungen.** Vorne nur Spielername, Zielzeit und Zielzeit-Modus; alles
  Seltene liegt hinter „Mehr einstellen“. Ein Test in `screens.test.tsx` hält fest, dass die erste
  Ebene genau diese drei Felder hat — sonst wandert dort mit der Zeit wieder alles nach vorne.
- **Der Fan-Projekt-Hinweis ist Pflicht** und darf nicht hinter einem Aufklapp-Abschnitt
  verschwinden: kurz in der Kopfleiste (`disclaimer.short`), ausführlich im Fuß
  (`Disclaimer.tsx` → `disclaimer.title`/`disclaimer.full`). Ein Test prüft ihn in jeder Sprache.
- **Feste Basiszeit plus Abruf warnt.** Liegt die Basis in der Vergangenheit, zählt die Rechnung
  Ticks mit, die im abgerufenen Ist-Wert schon stecken — die Zahl fällt zu großzügig aus. Die
  Zielzeit-Zeile schreibt das dazu (`menu.f.base_time.warn`). **Dasselbe gilt in der Terminal-App,
  dort steht der Hinweis noch nicht.**
- **Kein `--once`, keine Tastenhilfe.** Der Erklärtext lebt im aufklappbaren Abschnitt am Seitenende
  (`Explainer.tsx`), die Zonen-Liste dort ist die dritte Stelle, die bei einer Änderung am Balken
  mitgezogen werden muss (neben `ZONE_STYLE`/`zonesFor` und `Legend` in `BarCard.tsx`).

### Was im Web genauso gilt

Alle Regeln aus „Zwei Betriebsarten, nie gemischt“, „Zielzeit: Uhrzeit oder Pillen-Debuff“,
„Debuff-Meldung“, „Statuszeile“ und „Fehlertoleranz als Prinzip“ gelten unverändert:

- Ein Abruf schreibt **nie** in die eigenen Werte; im API-Modus sind die Max-Felder gesperrt und
  zeigen den Wert aus dem Abruf.
- Im API-Modus ohne Antwort wird **kein** Ist-Wert erfunden, das Abzeichen zeigt `offline`.
- Der Pillen-Code (`buffs.debuffCodes`) wird nicht angezeigt; ein Test in `screens.test.tsx`
  verbietet es.
- Angezeigt wird nur `safe`. `risky` bleibt gerechnet, erscheint aber nirgends.
- Jeder Zweig, der eine Aktion auslöst, setzt die Statuszeile — sonst behauptet die vorige Meldung
  etwas Falsches.

### Farben und Schrift

`src/theme.css` hält die Tokens im `@theme`-Block, übernommen aus dem Stylesheet von
`app.warera.io`: Grund `#0A0E10`, Flächen `#0F1517`/`#141C1F`/`#192327`, dazu `ring-game` für den
harten 1px-Ring der Spieloberfläche. Schrift ist **Saira** (wie im Spiel) aus Google Fonts. Bewusst
**nur dunkel** — WarEra hat keinen hellen Modus. Neue Farben gehören als Token in denselben Block,
nicht als Literal an die Verwendungsstelle.

**Die Textfarben sind nicht die aus `theme.go`.** Die des Terminals liegen auf einem
Terminal-Hintergrund; auf dem dunklen Grund der Seite fielen `faint` (3,99:1) und `danger` (4,47:1)
durch. `src/theme.test.ts` liest die Token aus dem CSS und rechnet nach, dass **jede** Textfarbe auf
**jeder** Grundfläche mindestens 4,5:1 erreicht (WCAG AA für kleinen Text) — eine Farbänderung, die
das reißt, fällt im Test auf. Kleinste Schriftgröße im Quellcode ist 0,78rem.

Handy: Eingabefelder haben unter `sm` 1rem Schriftgröße (darunter zoomt iOS Safari beim Antippen in
die Seite), Bedienelemente sind `min-h-11` (44 px), alles Mehrspaltige hat einen Breakpoint. Nötig ist
ein Browser ab etwa 2023 (Tailwind v4 erzeugt `@property`, `color-mix()`, `width>=`-Media-Queries);
`ZONE_STYLE` setzt deshalb neben dem Muster immer einen Vollton, sonst verschwinden die Balken-Zonen
auf älteren Browsern.

### Deployment

`.github/workflows/pages.yml` baut bei Push auf `main` mit Pfadfilter `web_app/**` und
veröffentlicht `dist/` auf GitHub Pages; `workflow_dispatch` geht auch ohne Push. Vorher läuft
`npm run check`. `check.yml` hat dafür einen zweiten Job `web`, damit auch Branches und PRs geprüft
werden.

Die Seite läuft unter **https://barkeeper.c0re.ninja/** (`CNAME` im DNS auf `corestriker.github.io.`).
Der Hostname steht an drei Stellen und muss bei einem Wechsel überall mitziehen:
`web_app/public/CNAME` (liest GitHub Pages aus dem Artefakt), die Repo-Settings unter Pages → Custom
domain, und die Meta-Tags `canonical`/`og:url` in `web_app/index.html`.

`base` in `vite.config.ts` ist **relativ** (`'./'`), damit derselbe Build sowohl unter der eigenen
Domain im Wurzelverzeichnis als auch unter dem Repo-Unterpfad
`https://corestriker.github.io/warera-barkeeper/` läuft. Das geht nur, weil die App eine einzige Seite
ohne Routen ist — wer Client-Routen einbaut, braucht wieder einen absoluten `base` (`BASE_PATH` beim
Bauen setzen).

## Hinweise

- Modulpfad und Repo: `github.com/corestriker/warera-barkeeper`, die App im Unterordner
  `terminal_app`. Bei einer Umbenennung ziehen `go.mod`, alle Import-Pfade und die Links in der
  Root-README mit.
- Die **README im Repo-Root ist englisch** (öffentliches Publikum), Code-Kommentare und die
  Entwickler-Doku (`terminal_app/README.md`, `web_app/README.md`, diese Datei) sind deutsch. Wer die
  README ändert, ändert sie auf Englisch. Auch der TypeScript-Code ist deutschsprachig
  kommentiert — nur Identifier bleiben englisch.
- **Releases** baut `.github/workflows/release.yml` aus einem Tag `v*`: `make check`, `make build-all`,
  `SHA256SUMS`, `gh release create`. Die Version im Binary kommt aus `git describe`, deshalb
  `fetch-depth: 0`.
- **Ein Release entsteht nur aus einem Tag** `v*`; ein Push auf `main` löst nur `check.yml` aus, und
  `workflow_dispatch` baut ohne zu veröffentlichen. Ohne Tag liefert `git describe --always` den
  Commit-Hash, `barkeeper --version` zeigt dann etwa `9e68f7f-dirty` statt einer Version.
- Bewusst nicht implementiert: Umrechnung des Health-Budgets in eine Anzahl Hits. Schaden pro Hit hängt
  am Gear, Ausweichen ist zufällig — jede Zahl wäre geraten.
