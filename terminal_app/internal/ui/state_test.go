package ui

import (
	"testing"
	"time"

	"github.com/corestriker/warera-barkeeper/terminal_app/internal/config"
	"github.com/corestriker/warera-barkeeper/terminal_app/internal/warera"
)

func testSnapshot() *warera.Snapshot {
	snap := &warera.Snapshot{}
	snap.User.Skills.Health = warera.Skill{Total: 140, CurrentBar: 117.5, HourlyBarRegen: 14}
	snap.User.Skills.Hunger = warera.Skill{Total: 7, CurrentBar: 6.1, HourlyBarRegen: 0.7}
	return snap
}

func healthBar(st State) (float64, float64) {
	for _, b := range st.Bars {
		if b.Key == config.BarHealth {
			return b.Max, b.HourlyRegen
		}
	}
	return 0, 0
}

// Mit Spielername gelten ausschließlich die API-Werte — die selbst
// eingetragenen Max-Werte werden ignoriert, nicht mit ihnen gemischt.
func TestAPIModusIgnoriertManuelleWerte(t *testing.T) {
	cfg := testCfg()
	cfg.Username = "Beispiel"
	cfg.Bars[config.BarHealth] = config.Bar{Max: 999, HourlyRegen: 99}

	st := buildState(cfg, testSnapshot(), time.Now())
	max, regen := healthBar(st)
	if max != 140 || regen != 14 {
		t.Errorf("API-Modus soll 140/14 nehmen, nimmt %v/%v", max, regen)
	}
	if !st.Live {
		t.Error("Live soll im API-Modus gesetzt sein")
	}
	if got, ok := st.Current[config.BarHealth]; !ok || got != 117.5 {
		t.Errorf("Ist-Wert soll 117.5 sein, ist %v (vorhanden=%v)", got, ok)
	}
}

// Ohne Spielername gelten ausschließlich die eigenen Werte, und es gibt keinen
// Ist-Wert — dann gilt die Annahme „jetzt voll".
func TestManuellerModusIgnoriertAPIWerte(t *testing.T) {
	cfg := testCfg()
	cfg.Bars[config.BarHealth] = config.Bar{Max: 120, HourlyRegen: 12}

	// Selbst mit vorliegendem Snapshot: ohne Spielername zählt er nicht.
	st := buildState(cfg, testSnapshot(), time.Now())
	max, regen := healthBar(st)
	if max != 120 || regen != 12 {
		t.Errorf("manueller Modus soll 120/12 nehmen, nimmt %v/%v", max, regen)
	}
	if st.Live {
		t.Error("Live darf im manuellen Modus nicht gesetzt sein")
	}
	if len(st.Current) != 0 {
		t.Errorf("ohne API soll es keinen Ist-Wert geben, ist %v", st.Current)
	}
}

// Abgeschalteter Abruf ist manueller Betrieb, auch mit Spielername.
func TestAbrufAusIstManuellerModus(t *testing.T) {
	cfg := testCfg()
	cfg.Username = "Beispiel"
	cfg.API.Enabled = false
	cfg.Bars[config.BarHealth] = config.Bar{Max: 120, HourlyRegen: 12}

	if APIMode(cfg) {
		t.Error("ohne aktiven Abruf ist kein API-Modus")
	}
	st := buildState(cfg, testSnapshot(), time.Now())
	if max, _ := healthBar(st); max != 120 {
		t.Errorf("soll die eigenen 120 nehmen, nimmt %v", max)
	}
}

// Im API-Modus ohne Antwort bleiben nur die Config-Werte — aber es wird kein
// Ist-Wert erfunden.
func TestAPIModusOhneAntwort(t *testing.T) {
	cfg := testCfg()
	cfg.Username = "Beispiel"

	st := buildState(cfg, nil, time.Now())
	if len(st.Current) != 0 {
		t.Errorf("ohne Antwort darf es keinen Ist-Wert geben, ist %v", st.Current)
	}
	if st.Live {
		t.Error("ohne Antwort ist nichts live")
	}
	if max, _ := healthBar(st); max != 100 {
		t.Errorf("soll auf die Config zurückfallen (100), nimmt %v", max)
	}
}

// Der Abruf darf die selbst eingetragenen Werte nicht überschreiben.
func TestAbrufLaesstEigeneWerteStehen(t *testing.T) {
	cfg := testCfg()
	cfg.Username = "Beispiel"
	cfg.Bars[config.BarHealth] = config.Bar{Max: 120, HourlyRegen: 12}

	m := New(cfg, "0.1.0", false)
	m = press2(m, apiMsg{snap: *testSnapshot(), userID: "abc"})

	if got := m.Config().Bars[config.BarHealth]; got.Max != 120 || got.HourlyRegen != 12 {
		t.Errorf("Config-Werte wurden vom Abruf verändert: %+v", got)
	}
	if m.Config().UserID != "abc" {
		t.Error("die aufgelöste userId soll dagegen übernommen werden")
	}
}
