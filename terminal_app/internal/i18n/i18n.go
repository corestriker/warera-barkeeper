// Package i18n hält die Übersetzungen der Oberfläche.
//
// Regel für Katalogtexte: ein Prozentzeichen, das Prozent bedeutet, wird
// verdoppelt („100%%"). Sonst schluckt es fmt.Sprintf als Platzhalter — „100%
// sein" ist für Go ein %s mit Leerzeichen-Flag, nicht der Text, der gemeint
// war. T löst die Verdopplung wieder auf.
//
// Eine Sprache ist eine Datei mit einem Katalog: Message-ID → Text. Neue
// Sprachen kommen dazu, indem eine Datei nach dem Muster von en.go angelegt
// und in ihrem init() registriert wird — sonst ist nichts zu ändern. Fehlt in
// einem Katalog eine ID, greift der englische Text; fehlt der auch, erscheint
// die ID selbst, damit die Lücke auffällt statt leer zu bleiben.
package i18n

import (
	"fmt"
	"os"
	"sort"
	"strings"
)

// Fallback ist die Sprache, die einspringt, wenn eine ID fehlt oder eine
// unbekannte Sprache eingestellt ist.
const Fallback = "en"

// Catalog ordnet Message-IDs ihren Text zu.
type Catalog map[string]string

// Lang ist eine registrierte Sprache.
type Lang struct {
	Code string  // Kürzel wie "de", so steht es in der Config
	Name string  // Eigenname, so steht es im Menü: "Deutsch"
	Msg  Catalog // die Übersetzungen
}

var langs = map[string]Lang{}

// Register nimmt eine Sprache auf. Aufzurufen aus dem init() der Sprachdatei.
func Register(l Lang) {
	if l.Code == "" {
		panic("i18n: Sprache ohne Code")
	}
	langs[l.Code] = l
}

// Codes liefert alle registrierten Sprachen, alphabetisch — damit die
// Reihenfolge im Menü nicht von der Init-Reihenfolge abhängt.
func Codes() []string {
	out := make([]string, 0, len(langs))
	for code := range langs {
		out = append(out, code)
	}
	sort.Strings(out)
	return out
}

// Name ist der Eigenname einer Sprache, oder der Code selbst, wenn sie
// unbekannt ist.
func Name(code string) string {
	if l, ok := langs[code]; ok && l.Name != "" {
		return l.Name
	}
	return code
}

// Known sagt, ob eine Sprache registriert ist.
func Known(code string) bool {
	_, ok := langs[code]
	return ok
}

// Detect liest die Sprache aus der Umgebung: LC_ALL, LANG und LANGUAGE, in
// dieser Reihenfolge. Aus "de_DE.UTF-8" wird "de". Ist nichts gesetzt oder die
// Sprache nicht vorhanden, gilt Fallback.
func Detect() string {
	for _, key := range []string{"LC_ALL", "LANG", "LANGUAGE"} {
		v := strings.TrimSpace(os.Getenv(key))
		if v == "" {
			continue
		}
		// "de_DE.UTF-8", "de:en", "C.UTF-8" → das vorderste Sprachkürzel
		v = strings.NewReplacer("_", ".", ":", ".", "-", ".").Replace(v)
		code := strings.ToLower(strings.SplitN(v, ".", 2)[0])
		if Known(code) {
			return code
		}
	}
	return Fallback
}

// Resolve macht aus einem Config-Wert eine vorhandene Sprache: leer heißt
// „aus der Umgebung", unbekannt heißt Fallback.
func Resolve(code string) string {
	code = strings.TrimSpace(strings.ToLower(code))
	if code == "" {
		return Detect()
	}
	if Known(code) {
		return code
	}
	return Fallback
}

// Printer übersetzt Message-IDs in eine feste Sprache.
type Printer struct{ code string }

// For baut einen Printer. Ein leerer Code heißt „aus der Umgebung".
func For(code string) Printer { return Printer{code: Resolve(code)} }

// Code ist die Sprache, in der dieser Printer übersetzt.
func (p Printer) Code() string {
	if p.code == "" {
		return Fallback
	}
	return p.code
}

// T übersetzt eine ID. Weitere Argumente werden wie bei fmt.Sprintf eingesetzt.
func (p Printer) T(id string, args ...any) string {
	s, ok := lookup(p.Code(), id)
	if !ok {
		s, ok = lookup(Fallback, id)
	}
	if !ok {
		// Sichtbar statt still: eine fehlende ID soll auffallen.
		s = "!" + id
	}
	if len(args) == 0 {
		// Ohne Argumente läuft nichts durch Sprintf, das verdoppelte
		// Prozentzeichen muss also selbst aufgelöst werden.
		return strings.ReplaceAll(s, "%%", "%")
	}
	return fmt.Sprintf(s, args...)
}

func lookup(code, id string) (string, bool) {
	l, ok := langs[code]
	if !ok {
		return "", false
	}
	s, ok := l.Msg[id]
	return s, ok && s != ""
}
