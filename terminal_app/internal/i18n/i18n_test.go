package i18n

import (
	"strings"
	"testing"
)

// Jede Sprache muss dieselben IDs kennen wie die Referenz — eine fehlende ID
// fällt im Betrieb sonst erst dann auf, wenn jemand den Screen öffnet.
func TestKatalogeSindVollstaendig(t *testing.T) {
	ref, ok := langs[Fallback]
	if !ok {
		t.Fatalf("die Referenzsprache %q ist nicht registriert", Fallback)
	}

	for _, code := range Codes() {
		l := langs[code]
		for id := range ref.Msg {
			if _, ok := l.Msg[id]; !ok {
				t.Errorf("%s: ID %q fehlt", code, id)
			}
		}
		for id := range l.Msg {
			if _, ok := ref.Msg[id]; !ok {
				t.Errorf("%s: ID %q gibt es in %q nicht — Tippfehler?", code, id, Fallback)
			}
		}
		if l.Name == "" {
			t.Errorf("%s: kein Eigenname gesetzt", code)
		}
	}
}

// Platzhalter müssen in allen Sprachen gleich sein, sonst bricht Sprintf.
//
// Gezählt werden nur echte Format-Verben: ein „100% pro Stunde" im Text ist
// keiner, und weil T ohne Argumente gar nicht durch Sprintf läuft, ist das
// auch harmlos.
func TestPlatzhalterStimmenUeberein(t *testing.T) {
	ref := langs[Fallback]
	count := countVerbs

	for _, code := range Codes() {
		if code == Fallback {
			continue
		}
		for id, want := range ref.Msg {
			got, ok := langs[code].Msg[id]
			if !ok {
				continue // meldet schon der andere Test
			}
			if count(got) != count(want) {
				t.Errorf("%s/%s: %d Platzhalter, Referenz hat %d", code, id, count(got), count(want))
			}
		}
	}
}

func TestFehlendeIDFaelltAuf(t *testing.T) {
	if got := For("de").T("gibt.es.nicht"); got != "!gibt.es.nicht" {
		t.Errorf("fehlende ID soll sichtbar sein, ist %q", got)
	}
}

func TestUnbekannteSpracheFaelltZurueck(t *testing.T) {
	if got := For("kl").Code(); got != Fallback {
		t.Errorf("unbekannte Sprache soll %q ergeben, ergibt %q", Fallback, got)
	}
	if got := For("de").Code(); got != "de" {
		t.Errorf("bekannte Sprache soll bleiben, ist %q", got)
	}
}

func TestDetectLiestUmgebung(t *testing.T) {
	t.Setenv("LC_ALL", "")
	t.Setenv("LANGUAGE", "")

	for _, tc := range []struct{ lang, want string }{
		{"de_DE.UTF-8", "de"},
		{"de", "de"},
		{"en_US.UTF-8", "en"},
		{"fr_FR.UTF-8", Fallback}, // nicht übersetzt
		{"C", Fallback},
		{"", Fallback},
	} {
		t.Setenv("LANG", tc.lang)
		if got := Detect(); got != tc.want {
			t.Errorf("LANG=%q: Detect = %q, want %q", tc.lang, got, tc.want)
		}
	}
}

// Übersetzt wird tatsächlich, nicht nur nachgeschlagen.
func TestUebersetzung(t *testing.T) {
	de, en := For("de"), For("en")
	if de.T("bar.spend") == en.T("bar.spend") {
		t.Error("deutsche und englische Fassung sind identisch")
	}
	if got := de.T("bar.ticks", 3); !strings.Contains(got, "3") {
		t.Errorf("Platzhalter nicht eingesetzt: %q", got)
	}
}

// verbs sind die Platzhalter, die in den Katalogen vorkommen dürfen. Mehr
// braucht es nicht, und weniger Auswahl heißt weniger Fehler.
const verbs = "sdq"

// countVerbs zählt Platzhalter und überspringt verdoppelte Prozentzeichen.
func countVerbs(s string) int {
	n := 0
	for i := 0; i < len(s); i++ {
		if s[i] != '%' {
			continue
		}
		if i+1 < len(s) && s[i+1] == '%' {
			i++
			continue
		}
		n++
	}
	return n
}

// Jedes Prozentzeichen in einem Katalog ist entweder verdoppelt oder ein
// Platzhalter — sonst frisst Sprintf den Text.
func TestKeineNacktenProzentzeichen(t *testing.T) {
	for _, code := range Codes() {
		for id, msg := range langs[code].Msg {
			for i := 0; i < len(msg); i++ {
				if msg[i] != '%' {
					continue
				}
				if i+1 < len(msg) && msg[i+1] == '%' {
					i++
					continue
				}
				if i+1 >= len(msg) || !strings.ContainsRune(verbs, rune(msg[i+1])) {
					t.Errorf("%s/%s: nacktes Prozentzeichen bei Position %d — als %%%% schreiben:\n%s",
						code, id, i, msg)
					break
				}
			}
		}
	}
}

// Ein Text mit Prozentzeichen darf nicht als Platzhalter durchgehen.
func TestCountVerbs(t *testing.T) {
	for _, tc := range []struct {
		in   string
		want int
	}{
		{"10%% pro Stunde", 0},
		{"100%%", 0},
		{"%s Ticks", 1},
		{"100%% erst %s, es fehlen %s", 2},
		{"%d von %d", 2},
	} {
		if got := countVerbs(tc.in); got != tc.want {
			t.Errorf("countVerbs(%q) = %d, want %d", tc.in, got, tc.want)
		}
	}
}
