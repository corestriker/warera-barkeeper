# terminal_app

Die Konsolenanwendung von barkeeper. Was das Tool tut und wie man es
benutzt, steht in der [README im Repo-Root](../README.md) — hier stehen nur die
Entwickler-Notizen.

## Bauen und testen

```sh
make build        # Binary für das eigene System
make build-all    # linux, darwin, windows × amd64/arm64 nach dist/
make check        # go vet, Tests, gofmt-Prüfung, Vektoren-Abgleich
make spec         # gemeinsame Testvektoren für beide Apps neu erzeugen
make run          # bauen und starten
```

## Aufbau

| Paket | Aufgabe |
|---|---|
| `internal/i18n` | Übersetzungen: `i18n.go` ist die Mechanik, jede Sprache eine Datei mit einem Katalog (`de.go`, `en.go`), registriert im eigenen `init()`. Neue Sprache = neue Datei, sonst nichts. |
| `internal/regen` | Die Rechenlogik: Ticks zählen, Budget und Zielwert bestimmen, Tick-Hinweis erzeugen. Hat keine Abhängigkeiten außer der Standardbibliothek und ist der am dichtesten getestete Teil — hier gehört jede Verhaltensänderung mit einem Testfall abgesichert. |
| `internal/config` | TOML-Einstellungen laden und atomar zurückschreiben, inklusive Reparatur unsinniger Werte in `Normalize`. |
| `internal/warera` | Client für die drei öffentlichen tRPC-Endpunkte. Aufrufe sind **GET** mit JSON im `input`-Query-Parameter, nicht POST. |
| `internal/ui` | Bubble-Tea-Oberfläche: `app.go` routet zwischen den Screens, `intro.go`/`help.go` sind die beiden Textseiten (`i` und `?`/`h`), `dashboard.go` zeichnet Balken und Legende, `once.go` erzeugt die Textausgabe für `--once`, `theme.go` hält Anzeigename und Farbpalette. Screen-Flow und das Löschen der Config sind in `app_test.go` abgesichert. |

## Version

`main.version` ist der gepflegte Standardwert; `make build` überschreibt ihn per
`-ldflags -X` nur dann, wenn `git describe` etwas liefert. Ohne Git-Tag steht deshalb die
Zahl aus `main.go` im Kopf und kein nacktes `dev`. Für ein Release: Tag setzen, sonst den
Wert in `main.go` mitziehen.

## Erststart

`main` erkennt am fehlenden Config-File, dass es der erste Start ist, und gibt das als
`firstRun` an `ui.New` weiter. Der Ablauf: Erklärung → `leaveOverlay` → Einstellungen. Ab
dem zweiten Start geht es direkt aufs Dashboard, weil `ShowIntroOnStart` standardmäßig aus
ist; `i` holt die Erklärung jederzeit zurück.

Erklärung (`i`) und Tastenhilfe (`?`/`h`) sind „Overlays": `toggleOverlay` merkt sich in
`prevScreen`, von wo aus geöffnet wurde, dieselbe Taste schließt wieder, eine andere
wechselt direkt hinüber. Die Weiche liegt in `internal/ui/app.go`.

„Config löschen" im Menü braucht zwei `↵`: der erste setzt `menuModel.confirm`, der zweite
löscht. Cursorwechsel und `esc` verwerfen die Bestätigung.

## Farben

Die Palette in `theme.go` ist aus dem Stylesheet von `app.warera.io` übernommen
(Grund `#161A1D`, Ränder `#28383E`, Text `#D0DDE1`, Akzent-Rot `#DA6E70`). Weil das
Terminal-Hintergrundbild uns nicht gehört, ist jede Farbe ein `AdaptiveColor`: `Dark` ist
der Originalwert, `Light` dessen abgedunkelte Entsprechung.

## Menü

Die Zeilen tragen eine `sectionID`; die Überschriften zeichnet `viewMenu` beim Wechsel. Gruppiert
wird danach, **wann** eine Einstellung gilt — Zielzeit immer, Abruf nur mit Spielername, eigene
Werte nur ohne. `windowRows` schneidet die Liste auf `m.height` zu, damit sie auf kleinen Terminals
nicht überläuft; bei Höhe 0 (Tests) bleibt alles stehen.

## Sprachen

Alles, was der Nutzer liest, kommt aus `internal/i18n`. In der Oberfläche gilt:
`m.t("id", args…)` statt eines Literals; freie Funktionen bekommen den `i18n.Printer`
übergeben. Menüfelder halten **IDs** (`labelID`, `helpID`), nicht Text — die Sprache kann
sich zur Laufzeit ändern, aufgelöst wird erst beim Zeichnen.

Zwei Fallen:

- **Literale Prozentzeichen im Katalog verdoppeln** (`100%%`). „100% sein" ist für
  `fmt.Sprintf` ein `%s` mit Leerzeichen-Flag. `T` löst die Verdopplung wieder auf, ein Test
  hält sie fest.
- **Nach jedem Sprachwechsel `m.p` neu setzen** (`i18n.For(cfg.Language)`), sonst bleibt die
  nächste Statusmeldung in der alten Sprache stehen.

Technische Fehler aus `config`, `warera` und `regen` sind **englisch** und werden
unübersetzt durchgereicht. Nur die Fehler, die den Spieler betreffen, sind Sentinels
(`warera.ErrNotFound`, `ErrAmbiguous`, `ErrNoUsername`) und werden in `Model.apiErrText`
übersetzt; Eingabefehler im Menü formuliert das Menü selbst.

## Zwei Stolperstellen

**Der User-Agent ist nicht optional.** Cloudflare vor `api2.warera.io` beantwortet
Anfragen mit werkzeugtypischem User-Agent teilweise mit leerem Body. Der Client
schickt deshalb einen browserähnlichen Agent plus `Origin: https://app.warera.io`.

**Der Regen kommt in Stunden-Ticks.** Ein Tick zur vollen Stunde schreibt `max/10` gut, dazwischen
passiert nichts. Wer die Logik anfasst, sollte das im Kopf behalten: eine Minute
Verschiebung der Zielzeit kann eine ganze Regenerationsstunde kosten oder schenken.

## Modulpfad

Der Modulpfad in `go.mod` (`github.com/corestriker/warera-barkeeper/terminal_app`) muss auf
das echte Repository zeigen, sonst funktionieren `go install` und die Import-Pfade für
andere nicht. Wird der Repo-Name je geändert, ziehen `go.mod`, alle Import-Pfade in den
`.go`-Dateien und die Links in der Root-README mit.

## Release

`.github/workflows/release.yml` baut auf einen Tag `v*` hin alle fünf Plattformen,
schreibt `SHA256SUMS` und veröffentlicht das als GitHub-Release. Davor läuft `make check` —
was die eigenen Prüfungen nicht besteht, wird nicht veröffentlicht. Die Version im Binary
kommt aus `git describe`, deshalb checkt der Workflow mit `fetch-depth: 0` aus.

```sh
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

`workflow_dispatch` baut dasselbe ohne zu veröffentlichen — für einen Probelauf.
`.github/workflows/check.yml` läuft bei jedem Push und Pull Request.
