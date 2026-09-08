# spec

Die gemeinsamen Testvektoren beider Anwendungen.

`regen-cases.json` beschreibt Rechenfälle vollständig — Basis, Zielzeit,
Tick-Raster, Leisten-Werte, optionale Ist-Werte — samt dem Ergebnis, das
herauskommen muss: Tick-Anzahl, Budget, Zielwert, Fehlbetrag,
Auffüll-Zeitpunkt und Tick-Hinweis.

**Warum es das gibt.** Die Rechenlogik steht zweimal da: in Go unter
`terminal_app/internal/regen` und in TypeScript unter `web_app/src/lib`. Go und
TypeScript können keine Bibliothek teilen, aber sie können dieselben Zahlen
prüfen. Beide Testsuiten lesen diese Datei:

| Anwendung | Test |
|---|---|
| Terminal (Go) | `terminal_app/internal/regen/spec_test.go` |
| Webapp (TypeScript) | `web_app/src/lib/spec.test.ts` |

Weicht eine Seite ab, wird sie rot — auch bei einer Änderung, an die in der
anderen Sprache niemand gedacht hat.

**Die Go-Fassung gibt die Wahrheit vor**, sie ist die Urfassung. Die Datei wird
aus ihr erzeugt und nicht von Hand gepflegt:

```sh
cd terminal_app
make spec        # Datei neu erzeugen
make check       # enthält spec-check: schlägt fehl, wenn die Datei veraltet ist
```

Der Generator ist `terminal_app/tools/specgen`. Ein neuer Fall gehört dort in
die Liste `inputs`; danach `make spec` und beide Testsuiten laufen lassen.

Zeitpunkte stehen als RFC 3339 in UTC, Dauern in Millisekunden — beides ohne
Sprachbindung. Die Fälle enthalten bewusst die Kanten, an denen die Mechanik
weh tut: Zielzeit exakt auf einem Tick, Basis exakt auf einem Tick, Deckelung,
fraktionaler Hunger, Ist-Wert unter dem Zielwert, ein 25-Stunden-Tag samt
Gegenprobe und ein verschobenes Tick-Raster.
