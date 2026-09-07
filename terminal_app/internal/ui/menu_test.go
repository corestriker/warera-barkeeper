package ui

import (
	"strings"
	"testing"
	"time"

	"github.com/corestriker/warera-barkeeper/terminal_app/internal/config"
	"github.com/corestriker/warera-barkeeper/terminal_app/internal/warera"
)

// Das Menü ist in Abschnitte gegliedert, und die Reihenfolge folgt der Frage,
// wann eine Einstellung gilt.
func TestMenuAbschnitte(t *testing.T) {
	cfg := testCfg()
	cfg.Username = "Beispiel"

	m := New(cfg, "0.1.0", false)
	m.width, m.api, m.snap = 78, apiOK, liveSnapshot()
	view := typeKey(m, 'm').viewMenu()

	want := []string{"Zielzeit", "WarEra-Abruf", "Eigene Werte", "Anzeige", "Config-Datei"}
	at := -1
	for _, title := range want {
		i := strings.Index(view, title)
		if i < 0 {
			t.Fatalf("Abschnitt %q fehlt:\n%s", title, view)
		}
		if i < at {
			t.Errorf("Abschnitt %q steht an der falschen Stelle", title)
		}
		at = i
	}

	// Läuft der Abruf, sind die eigenen Werte ungenutzt — das muss dastehen.
	if !strings.Contains(view, "ungenutzt, solange der Abruf an ist") {
		t.Errorf("Vermerk am Abschnitt „Eigene Werte\" fehlt:\n%s", view)
	}

	// Ohne Abruf ist es umgekehrt.
	off := testCfg()
	m2 := New(off, "0.1.0", false)
	m2.width = 78
	view2 := typeKey(m2, 'm').viewMenu()
	if !strings.Contains(view2, "es gelten die eigenen Werte") {
		t.Errorf("Vermerk am Abschnitt „WarEra-Abruf\" fehlt:\n%s", view2)
	}
	if strings.Contains(view2, "ungenutzt, solange der Abruf an ist") {
		t.Error("ohne Abruf sind die eigenen Werte nicht ungenutzt")
	}
}

// Beim Erststart steht der Cursor auf dem Spielernamen, obwohl der im zweiten
// Abschnitt liegt.
func TestErststartFokussiertSpielername(t *testing.T) {
	m := New(testCfg(), "0.1.0", true)
	m.width = 78
	m = press(m, enter) // Intro verlassen → Einstellungen

	if got := m.menu.current().key; got != "username" {
		t.Errorf("Cursor steht auf %q, erwartet „username\"", got)
	}
}

// Bei kleiner Terminalhöhe wird die Liste zugeschnitten, die Cursor-Zeile
// bleibt aber im Bild.
func TestMenuScrolltBeiKleinemFenster(t *testing.T) {
	cfg := testCfg()
	cfg.Username = "Beispiel"

	m := New(cfg, "0.1.0", false)
	m.width, m.height = 78, 20
	m = typeKey(m, 'm')
	m.menu.focus("reset") // letzte Zeile

	view := m.viewMenu()
	if !strings.Contains(view, "Config löschen") {
		t.Errorf("die Cursor-Zeile muss sichtbar bleiben:\n%s", view)
	}
	if !strings.Contains(view, "weitere") {
		t.Errorf("abgeschnittene Zeilen sollen gemeldet werden:\n%s", view)
	}
	if lines := strings.Count(view, "\n"); lines > m.height {
		t.Errorf("Ausgabe ist %d Zeilen hoch, Fenster hat %d", lines, m.height)
	}

	// Ohne bekannte Höhe (Tests, Pipes) bleibt alles stehen.
	full := New(cfg, "0.1.0", false)
	full.width = 78
	if v := typeKey(full, 'm').viewMenu(); strings.Contains(v, "weitere") {
		t.Error("ohne Höhenangabe darf nichts abgeschnitten werden")
	}
}

// Setzt ein Debuff die Zielzeit, ist die eingetragene Uhrzeit nur der
// Rückfall — und das muss an der Zeile stehen.
func TestZielzeitZeileZeigtRueckfall(t *testing.T) {
	now := time.Date(2026, 9, 2, 9, 16, 0, 0, time.Local)

	cfg := testCfg()
	cfg.Username = "c0re"

	snap := liveSnapshot()
	snap.User.Buffs = warera.Buffs{DebuffEndAt: now.Add(5 * time.Hour)}

	m := New(cfg, "0.1.0", false)
	m.width, m.now, m.api, m.snap = 78, now, apiOK, snap
	if v := typeKey(m, 'm').viewMenu(); !strings.Contains(v, "14:05   Rückfall") {
		t.Errorf("Rückfall-Vermerk fehlt:\n%s", v)
	}

	// Ohne laufenden Debuff gilt die Uhrzeit selbst — dann kein Vermerk.
	m.snap = liveSnapshot()
	if v := typeKey(m, 'm').viewMenu(); strings.Contains(v, "Rückfall") {
		t.Errorf("ohne Debuff darf kein Vermerk stehen:\n%s", v)
	}

	// Im Uhrzeit-Modus ebenfalls nicht.
	m.cfg.TargetMode = config.TargetModeClock
	m.snap = snap
	if v := typeKey(m, 'm').viewMenu(); strings.Contains(v, "Rückfall") {
		t.Errorf("im Uhrzeit-Modus darf kein Vermerk stehen:\n%s", v)
	}
}

// Der Zielzeit-Schalter läuft im Kreis durch alle drei Quellen.
func TestZielzeitSchalter(t *testing.T) {
	m := New(testCfg(), "0.1.0", false)
	m.width = 78
	m = typeKey(m, 'm')
	m.menu.focus("target_mode")

	// Startpunkt ist der Standard, von dort läuft der Schalter einmal rum.
	want := []string{config.TargetModeDebuffHour, config.TargetModeClock, config.TargetModeDebuff}
	if m.cfg.TargetMode != config.TargetModeDebuff {
		t.Fatalf("Standard soll %q sein, ist %q", config.TargetModeDebuff, m.cfg.TargetMode)
	}
	for _, mode := range want {
		m = press(m, enter)
		if m.cfg.TargetMode != mode {
			t.Fatalf("nächster Modus soll %q sein, ist %q", mode, m.cfg.TargetMode)
		}
	}
}
