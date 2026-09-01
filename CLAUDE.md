# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Was das ist

**War Era - Barkeeper** ist ein Terminal-Tool (Go + Bubble Tea) für das Browserspiel [WarEra](https://warera.io). Es
beantwortet eine Frage: wie weit darf ich Health und Hunger leerspielen, damit sie zu einer Zielzeit
wieder auf 100 % stehen? Der Repo-Root ist absichtlich leer gehalten — die App liegt unter
`terminal_app/`, damit später ein `web_app/` mit derselben Mechanik daneben passt.

Der Anzeigename steht als `ui.AppName` in `internal/ui/theme.go` und wird von Intro, Dashboard und
`--version` benutzt. **Binary, Modulname und Config-Verzeichnis heißen weiterhin `barkeeper`** — die
Pfade (`~/.config/barkeeper/`, `$BARKEEPER_CONFIG`) sollen sich nicht ändern.

Die Codebase ist durchgehend **deutschsprachig**: Kommentare, Doc-Comments, Fehlertexte, UI-Strings und
Test-Namen. Neuer Code hält das bei; nur Identifier bleiben englisch.

## Befehle

Alles läuft aus `terminal_app/` (dort liegen `go.mod` und das `Makefile`):

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

## Hinweise

- Der Modulpfad in `go.mod` ist noch ein Platzhalter (`github.com/yourname/warera-barkeeper/terminal_app`),
  in der README steht derselbe Platzhalter als `YOURNAME`. Beides muss vor einem Release auf das echte
  Repository zeigen, sonst funktionieren `go install` und die Download-Links nicht.
- Die **README im Repo-Root ist englisch** (öffentliches Publikum), Code-Kommentare und die
  Entwickler-Doku (`terminal_app/README.md`, diese Datei) sind deutsch. Wer die README ändert, ändert
  sie auf Englisch.
- **Releases** baut `.github/workflows/release.yml` aus einem Tag `v*`: `make check`, `make build-all`,
  `SHA256SUMS`, `gh release create`. Die Version im Binary kommt aus `git describe`, deshalb
  `fetch-depth: 0`.
- Der Arbeitsbaum ist derzeit **kein** Git-Repository — `git`-basierte Abläufe (Diff-Review, `VERSION`
  aus `git describe`) greifen hier nicht, `make build` fällt auf `VERSION=dev` zurück.
- Bewusst nicht implementiert: Umrechnung des Health-Budgets in eine Anzahl Hits. Schaden pro Hit hängt
  am Gear, Ausweichen ist zufällig — jede Zahl wäre geraten.
