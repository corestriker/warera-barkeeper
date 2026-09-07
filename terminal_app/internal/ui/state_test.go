package ui

import (
	"strings"
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

// Zielzeit aus dem Pillen-Debuff: das Ende steht in der API-Antwort und ist
// ein absoluter Zeitpunkt, keine Uhrzeit — es wird direkt übernommen.
func TestZielzeitAusDebuff(t *testing.T) {
	now := time.Date(2026, 9, 2, 8, 31, 0, 0, time.Local)
	end := now.Add(6*time.Hour + 3*time.Minute)

	snapWith := func(end time.Time) *warera.Snapshot {
		snap := testSnapshot()
		snap.User.Buffs = warera.Buffs{DebuffCodes: []string{"cocain"}, DebuffEndAt: end}
		return snap
	}

	cfg := testCfg()
	cfg.Username = "Beispiel"
	cfg.TargetMode = config.TargetModeDebuff

	st := buildState(cfg, snapWith(end), now)
	if st.Target != TargetFromDebuff {
		t.Fatal("die Zielzeit soll aus dem Debuff kommen")
	}
	if !st.Params.Target.Equal(end) {
		t.Errorf("Zielzeit = %s, want %s", st.Params.Target, end)
	}
	if !st.DebuffEnd.Equal(end) {
		t.Errorf("DebuffEnd = %s, want %s", st.DebuffEnd, end)
	}

	// Abgelaufener Debuff zählt nicht — dann gilt wieder die Uhrzeit.
	st = buildState(cfg, snapWith(now.Add(-time.Minute)), now)
	if st.Target != TargetFromClock {
		t.Error("ein abgelaufener Debuff darf die Zielzeit nicht setzen")
	}
	if got := st.Params.Target.Format("15:04"); got != "14:05" {
		t.Errorf("Rückfall auf target_time erwartet, ist %s", got)
	}

	// Kein Debuff im Snapshot: ebenfalls Rückfall.
	if st := buildState(cfg, testSnapshot(), now); st.Target != TargetFromClock {
		t.Error("ohne Debuff-Feld darf nichts gesetzt werden")
	}

	// Ohne Abruf (offline, manueller Betrieb) gibt es keine Debuff-Daten.
	if st := buildState(cfg, nil, now); st.Target != TargetFromClock {
		t.Error("ohne Snapshot darf nichts gesetzt werden")
	}

	// Modus aus: der Debuff wird ignoriert, auch wenn er aktiv ist.
	cfg.TargetMode = config.TargetModeClock
	st = buildState(cfg, snapWith(end), now)
	if st.Target != TargetFromClock {
		t.Error("im Uhrzeit-Modus darf der Debuff die Zielzeit nicht setzen")
	}
	if got := st.Params.Target.Format("15:04"); got != "14:05" {
		t.Errorf("Uhrzeit-Modus soll 14:05 nehmen, nimmt %s", got)
	}

	// „Nächste Stunde": das Ende 14:34 wird auf den 15:00-Tick gehoben, plus
	// fünf Minuten Sicherheitsabstand.
	cfg.TargetMode = config.TargetModeDebuffHour
	st = buildState(cfg, snapWith(end), now)
	if st.Target != TargetFromDebuffTick {
		t.Fatalf("Target = %v, want TargetFromDebuffTick", st.Target)
	}
	if got := st.Params.Target.Format("15:04"); got != "15:05" {
		t.Errorf("Zielzeit = %s, want 15:05", got)
	}
	// Ein Tick mehr als beim exakten Ende — das ist der ganze Zweck.
	exact := buildState(withMode(cfg, config.TargetModeDebuff), snapWith(end), now)
	if a, b := st.Compute(cfg).Bars[0].Safe.Ticks, exact.Compute(cfg).Bars[0].Safe.Ticks; a != b+1 {
		t.Errorf("nächste Stunde soll genau einen Tick mehr zählen: %d vs %d", a, b)
	}
}

func withMode(cfg config.Config, mode string) config.Config {
	cfg.TargetMode = mode
	return cfg
}

// Der Kopf muss sagen, woher die Zielzeit kommt.
func TestKopfBeschriftetDieZielzeit(t *testing.T) {
	now := time.Date(2026, 9, 2, 8, 31, 0, 0, time.Local)

	cfg := testCfg()
	cfg.Username = "Beispiel"
	cfg.TargetMode = config.TargetModeDebuff

	snap := testSnapshot()
	snap.User.Buffs = warera.Buffs{DebuffCodes: []string{"cocain"}, DebuffEndAt: now.Add(6 * time.Hour)}

	m := New(cfg, "0.1.0", false)
	m.width, m.now, m.api, m.snap = 78, now, apiOK, snap
	view := m.viewDashboard()
	if !strings.Contains(view, "Debuff-Ende") {
		t.Errorf("Debuff-Zielzeit soll beschriftet sein:\n%s", view)
	}

	// Modus an, aber kein Debuff aktiv: der Rückfall wird vermerkt.
	m.snap = testSnapshot()
	view = m.viewDashboard()
	if !strings.Contains(view, "kein Debuff aktiv") {
		t.Errorf("Rückfall soll vermerkt sein:\n%s", view)
	}
}

// Die Kopfzeile darf nicht umbrechen: dafür fallen bei schmaler Anzeige die
// verzichtbaren Teile weg, statt mitten im Wort umzuklappen.
func TestKopfPasstInEineZeile(t *testing.T) {
	now := time.Date(2026, 9, 2, 8, 34, 0, 0, time.Local)

	snap := testSnapshot()
	snap.User.Buffs = warera.Buffs{DebuffEndAt: now.Add(6 * time.Hour)}

	for _, mode := range []string{
		config.TargetModeClock, config.TargetModeDebuff, config.TargetModeDebuffHour,
	} {
		for _, width := range []int{minWidth, 70, maxWidth} {
			cfg := testCfg()
			cfg.Username, cfg.TargetMode = "c0re", mode

			m := New(cfg, "0.1.0", false)
			m.width, m.now, m.api, m.snap = width, now, apiOK, snap

			head := m.renderHeader(buildState(cfg, snap, now), m.contentWidth())
			// Rahmen oben und unten plus drei Inhaltszeilen.
			if got := len(strings.Split(strings.TrimRight(head, "\n"), "\n")); got != 5 {
				t.Errorf("%s bei Breite %d: %d Zeilen statt 5:\n%s", mode, width, got, head)
			}
		}
	}
}

// Das Hauptfenster meldet einen laufenden Debuff in jedem Modus — und sagt,
// wenn die Zielzeit daran hängt.
func TestHinweisAufDenDebuff(t *testing.T) {
	now := time.Date(2026, 9, 2, 8, 34, 0, 0, time.Local)
	end := time.Date(2026, 9, 2, 14, 34, 0, 0, time.Local)

	snap := testSnapshot()
	snap.User.Buffs = warera.Buffs{DebuffCodes: []string{"cocain"}, DebuffEndAt: end}

	view := func(mode string, snap *warera.Snapshot) string {
		cfg := testCfg()
		cfg.Username, cfg.TargetMode = "c0re", mode
		m := New(cfg, "0.1.0", false)
		m.width, m.now, m.api, m.snap = 74, now, apiOK, snap
		return m.viewDashboard()
	}

	// Uhrzeit-Modus: die Meldung steht da, aber ohne Anspruch auf die Zielzeit.
	v := view(config.TargetModeClock, snap)
	for _, want := range []string{"Pillen-Debuff", "14:34", "6h 00m"} {
		if !strings.Contains(v, want) {
			t.Errorf("Uhrzeit-Modus: %q fehlt:\n%s", want, v)
		}
	}
	if strings.Contains(v, "Grundlage") || strings.Contains(v, "Tick danach") {
		t.Error("im Uhrzeit-Modus hängt die Zielzeit nicht am Debuff")
	}

	// Welche Pille es war, steht in der API, gehört aber nicht in die
	// Anzeige — „Pillen-Debuff" sagt alles, was für die Rechnung zählt.
	for _, mode := range []string{
		config.TargetModeClock, config.TargetModeDebuff, config.TargetModeDebuffHour,
	} {
		if v := view(mode, snap); strings.Contains(v, "cocain") {
			t.Errorf("%s: der Pillen-Code gehört nicht in die Anzeige:\n%s", mode, v)
		}
	}

	// Debuff-Modus: die Meldung nennt sich selbst als Grundlage.
	if v := view(config.TargetModeDebuff, snap); !strings.Contains(v, "Grundlage der Zielzeit") {
		t.Errorf("Debuff-Modus soll die Grundlage nennen:\n%s", v)
	}

	// Stunde danach: entsprechend anders formuliert.
	if v := view(config.TargetModeDebuffHour, snap); !strings.Contains(v, "Ziel: Tick danach") {
		t.Errorf("Stunden-Modus soll den Tick nennen:\n%s", v)
	}

	// Bei üblicher Breite passt die Meldung in eine Zeile — sonst steht über
	// den Leisten ein zweizeiliger Absatz.
	for mode, tail := range map[string]string{
		config.TargetModeClock:      "noch",
		config.TargetModeDebuff:     "Grundlage der Zielzeit",
		config.TargetModeDebuffHour: "Ziel: Tick danach",
	} {
		for _, line := range strings.Split(view(mode, snap), "\n") {
			if strings.Contains(line, "Pillen-Debuff") && !strings.Contains(line, tail) {
				t.Errorf("%s: Meldung bricht um:\n%s", mode, line)
			}
		}
	}

	// Kein Debuff, keine Meldung.
	if v := view(config.TargetModeDebuff, testSnapshot()); strings.Contains(v, "Pillen-Debuff") {
		t.Errorf("ohne Debuff darf keine Meldung stehen:\n%s", v)
	}
	if v := view(config.TargetModeClock, nil); strings.Contains(v, "Pillen-Debuff") {
		t.Errorf("ohne Abruf darf keine Meldung stehen:\n%s", v)
	}

	// Abgelaufener Debuff zählt nicht mehr.
	stale := testSnapshot()
	stale.User.Buffs = warera.Buffs{DebuffCodes: []string{"cocain"}, DebuffEndAt: now.Add(-time.Second)}
	if v := view(config.TargetModeDebuff, stale); strings.Contains(v, "Pillen-Debuff") {
		t.Errorf("abgelaufener Debuff darf nicht gemeldet werden:\n%s", v)
	}
}
