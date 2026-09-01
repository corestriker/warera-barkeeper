package ui

import (
	"strings"
	"testing"
	"time"

	"github.com/corestriker/warera-barkeeper/terminal_app/internal/config"
	"github.com/corestriker/warera-barkeeper/terminal_app/internal/i18n"
	"github.com/corestriker/warera-barkeeper/terminal_app/internal/warera"
)

func liveSnapshot() *warera.Snapshot {
	snap := &warera.Snapshot{}
	snap.User.Skills.Health = warera.Skill{Total: 140, CurrentBar: 117.5, HourlyBarRegen: 14}
	snap.User.Skills.Hunger = warera.Skill{Total: 7, CurrentBar: 6.1, HourlyBarRegen: 0.7}
	return snap
}

// Dieselbe Lage, zwei Sprachen: die Zahlen bleiben, die Wörter wechseln.
func TestDashboardInBeidenSprachen(t *testing.T) {
	for _, tc := range []struct {
		lang string
		want []string
		gone []string
	}{
		{"de", []string{"ausgeben", "runter bis", "3 Ticks", "Spieler", "muss stehen bleiben"},
			[]string{"spend", "down to"}},
		{"en", []string{"spend", "down to", "3 ticks", "player", "must stay"},
			[]string{"ausgeben", "runter bis"}},
	} {
		cfg := config.Default()
		cfg.Language = tc.lang
		cfg.Username = "c0re"

		m := New(cfg, "0.1.0", false)
		m.width, m.api, m.snap = 78, apiOK, liveSnapshot()
		m.now = time.Date(2026, 9, 1, 11, 12, 0, 0, time.Local)

		view := m.viewDashboard()
		for _, want := range tc.want {
			if !strings.Contains(view, want) {
				t.Errorf("%s: %q fehlt:\n%s", tc.lang, want, view)
			}
		}
		for _, gone := range tc.gone {
			if strings.Contains(view, gone) {
				t.Errorf("%s: %q soll nicht vorkommen", tc.lang, gone)
			}
		}
		// Die Rechnung darf von der Sprache nicht abhängen.
		if !strings.Contains(view, "19.5") || !strings.Contains(view, "117.5 / 140") {
			t.Errorf("%s: Zahlen stimmen nicht:\n%s", tc.lang, view)
		}
	}
}

// Alle Screens müssen in jeder Sprache ohne fehlende IDs auskommen; ein "!"
// vor einer ID ist die Markierung aus i18n.
func TestKeineFehlendenIDsInDenScreens(t *testing.T) {
	for _, code := range i18n.Codes() {
		cfg := config.Default()
		cfg.Language = code
		cfg.Username = "c0re"
		cfg.SetPath("/tmp/config.toml")

		m := New(cfg, "0.1.0", true)
		m.width, m.api, m.snap, m.fetchedA = 78, apiOK, liveSnapshot(), time.Now()

		screens := map[string]string{
			"intro":     m.viewIntro(),
			"help":      m.viewHelp(),
			"dashboard": m.viewDashboard(),
			"menu":      typeKey(m, 'm').viewMenu(),
		}
		for name, view := range screens {
			for _, line := range strings.Split(view, "\n") {
				if i := strings.Index(line, "!"); i >= 0 && strings.Contains(line, ".") {
					// Nur melden, wenn es wie eine Message-ID aussieht.
					if id := strings.Fields(line[i:]); len(id) > 0 && strings.Count(id[0], ".") >= 1 {
						t.Errorf("%s/%s: fehlende Übersetzung: %s", code, name, id[0])
					}
				}
			}
		}
	}
}

// Der Sprachschalter im Menü wirkt sofort und läuft im Kreis: automatisch →
// jede registrierte Sprache → wieder automatisch.
func TestSprachschalterImMenue(t *testing.T) {
	cfg := config.Default()
	cfg.Language = "de"

	m := New(cfg, "0.1.0", false)
	m.width = 78
	m = typeKey(m, 'm')
	m.menu.cursor = menuIndex(t, m, "language")

	if !strings.Contains(m.viewMenu(), "Deutsch") {
		t.Error("das Sprachfeld soll den Eigenname zeigen")
	}

	// Einmal durch alle Werte und wieder zurück.
	start := m.cfg.Language
	seen := map[string]bool{start: true}
	for i := 0; i < len(languageChoices()); i++ {
		m = press(m, enter)
		seen[m.cfg.Language] = true
		if m.p.Code() != i18n.Resolve(m.cfg.Language) {
			t.Fatalf("Printer folgt der Auswahl nicht: cfg=%q, printer=%q",
				m.cfg.Language, m.p.Code())
		}
	}
	if m.cfg.Language != start {
		t.Errorf("nach einer Runde soll wieder %q stehen, steht %q", start, m.cfg.Language)
	}
	for _, code := range append([]string{""}, i18n.Codes()...) {
		if !seen[code] {
			t.Errorf("Sprachwert %q war nicht erreichbar", code)
		}
	}

	// Auf Englisch gestellt, ist das Menü englisch.
	for m.cfg.Language != "en" {
		m = press(m, enter)
	}
	if view := m.viewMenu(); !strings.Contains(view, "Settings") || strings.Contains(view, "Einstellungen") {
		t.Errorf("Menü sollte englisch sein:\n%s", view)
	}
}

// „automatisch" zeigt die Sprache, die dabei herauskommt, und folgt $LANG.
func TestAutomatischeSprache(t *testing.T) {
	t.Setenv("LC_ALL", "")
	t.Setenv("LANGUAGE", "")
	t.Setenv("LANG", "de_DE.UTF-8")

	cfg := config.Default()
	cfg.Language = ""
	m := New(cfg, "0.1.0", false)
	if m.p.Code() != "de" {
		t.Errorf("leere Sprache soll $LANG folgen, ist %q", m.p.Code())
	}

	m.width = 78
	m = typeKey(m, 'm')
	m.menu.cursor = menuIndex(t, m, "language")
	if view := m.viewMenu(); !strings.Contains(view, "automatisch (Deutsch)") {
		t.Errorf("das Feld soll die erkannte Sprache nennen:\n%s", view)
	}
}
