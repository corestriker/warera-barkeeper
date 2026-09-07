package ui

import (
	"time"

	"github.com/corestriker/warera-barkeeper/terminal_app/internal/config"
	"github.com/corestriker/warera-barkeeper/terminal_app/internal/regen"
	"github.com/corestriker/warera-barkeeper/terminal_app/internal/warera"
)

// barOrder legt die Reihenfolge der Anzeige fest.
var barOrder = []string{config.BarHealth, config.BarHunger}

var barLabels = map[string]string{
	config.BarHealth: "HEALTH",
	config.BarHunger: "HUNGER",
}

// State ist alles, was für eine Berechnung gebraucht wird — entweder aus der
// API oder aus der Config, nie aus beiden.
type State struct {
	Params  regen.Params
	Bars    []regen.Bar
	Current map[string]float64
	Live    bool // true, wenn die Werte aus der API stammen

	// Target sagt, woher die Zielzeit kommt.
	Target TargetSource

	// DebuffEnd ist das Ende eines laufenden Pillen-Debuffs — unabhängig
	// davon, ob die Zielzeit daran hängt. Das Hauptfenster zeigt ihn auch im
	// Uhrzeit-Modus an, weil er dort die Alternative ist.
	//
	// Welche Pille es war, steht in der API (buffs.debuffCodes), wird aber
	// nicht angezeigt: „Pillen-Debuff" sagt alles, was für die Rechnung zählt.
	DebuffEnd time.Time
}

// TargetSource ist die Herkunft der Zielzeit.
type TargetSource int

const (
	// TargetFromClock: die eingestellte Uhrzeit.
	TargetFromClock TargetSource = iota
	// TargetFromDebuff: das Ende des Pillen-Debuffs, unverändert.
	TargetFromDebuff
	// TargetFromDebuffTick: der Tick nach dem Debuff-Ende plus Sicherheitsabstand.
	TargetFromDebuffTick
)

// APIMode sagt, ob mit API-Werten gerechnet wird: dafür braucht es einen
// Spielernamen und einen eingeschalteten Abruf.
func APIMode(cfg config.Config) bool {
	return cfg.API.Enabled && cfg.Username != ""
}

// buildState setzt Zeitparameter und Leisten-Werte zusammen.
//
// Entweder-oder: mit Spielername und aktivem Abruf gelten ausschließlich die
// Werte aus der API — Maximum, Regen-Rate und Ist-Wert. Ohne beides gelten
// ausschließlich die selbst eingetragenen Werte aus der Config, und es wird
// angenommen, dass die Leisten gerade voll sind. Gemischt wird nicht, sonst
// stünde im Kopf ein Maximum aus der Config neben einem Ist-Wert aus dem Spiel.
//
// Der eine Sonderfall: im API-Modus ohne Antwort (Netz weg, Name unbekannt)
// bleiben nur die Config-Werte. Das Badge im Kopf zeigt dann „⚠ offline", und
// ein Ist-Wert wird bewusst nicht erfunden.
func buildState(cfg config.Config, snap *warera.Snapshot, now time.Time) State {
	loc := cfg.Location()
	st := State{Current: map[string]float64{}}

	base := now.In(loc)
	if cfg.BaseMode == config.BaseModeFixed {
		if h, m, err := regen.ParseClock(cfg.BaseTime); err == nil {
			base = regen.AtClock(now.In(loc), h, m)
		}
	}

	target := base.Add(time.Hour)
	if h, m, err := regen.ParseClock(cfg.TargetTime); err == nil {
		target = regen.NextOccurrence(base, h, m)
	}

	// Das Tick-Raster steht vor der Zielzeit, weil die Debuff-Variante
	// „nächste Stunde" darauf aufsetzt.
	anchor := regen.NextWholeHourUTC(now)
	if snap != nil && !snap.NextRegenAt.IsZero() {
		anchor = snap.NextRegenAt
	}
	st.Params = regen.Params{
		Base:       base,
		Target:     target,
		TickAnchor: anchor,
		TickPeriod: regen.DefaultTickPeriod,
	}

	// Zielzeit aus dem Pillen-Debuff: bis dahin bringt die nächste Pille
	// nichts, und genau dann sollen die Leisten voll sein. Der Wert ist ein
	// absoluter Zeitpunkt, kein Uhrzeit-Muster — er braucht deshalb kein
	// NextOccurrence. Ohne aktiven Debuff (fehlend, abgelaufen, kein Abruf)
	// bleibt es bei der eingestellten Uhrzeit.
	if end := debuffEnd(snap, now); !end.IsZero() {
		st.DebuffEnd = end.In(loc)

		switch cfg.TargetMode {
		case config.TargetModeDebuff:
			st.Params.Target = st.DebuffEnd
			st.Target = TargetFromDebuff
		case config.TargetModeDebuffHour:
			st.Params.Target = regen.TargetAfterTick(st.Params, end).In(loc)
			st.Target = TargetFromDebuffTick
		}
	}

	useAPI := APIMode(cfg) && snap != nil
	for _, key := range barOrder {
		b := regen.Bar{Key: key, Label: barLabels[key]}

		if sk, ok := skillFor(snap, key); useAPI && ok && sk.Total > 0 {
			b.Max, b.HourlyRegen = sk.Total, sk.HourlyBarRegen
			st.Current[key] = sk.CurrentBar
			st.Live = true
		} else if cb, ok := cfg.Bars[key]; ok {
			b.Max, b.HourlyRegen = cb.Max, cb.HourlyRegen
		}

		// Notnagel, falls weder API noch Config eine Regen-Rate liefern:
		// WarEra schreibt pro Tick max/10 gut.
		if b.HourlyRegen <= 0 && b.Max > 0 {
			b.HourlyRegen = b.Max / 10
		}
		st.Bars = append(st.Bars, b)
	}

	return st
}

// debuffEnd liefert das Ende eines noch laufenden Debuffs, sonst den Nullwert.
func debuffEnd(snap *warera.Snapshot, now time.Time) time.Time {
	if snap == nil {
		return time.Time{}
	}
	if end := snap.User.Buffs.DebuffEndAt; end.After(now) {
		return end
	}
	return time.Time{}
}

func skillFor(snap *warera.Snapshot, key string) (warera.Skill, bool) {
	if snap == nil {
		return warera.Skill{}, false
	}
	switch key {
	case config.BarHealth:
		return snap.User.Skills.Health, true
	case config.BarHunger:
		return snap.User.Skills.Hunger, true
	}
	return warera.Skill{}, false
}

// Compute führt die Berechnung inklusive Hinweis aus.
func (s State) Compute(cfg config.Config) regen.Result {
	res := regen.Compute(s.Params, s.Bars, s.Current)
	res.Hint = regen.ComputeHint(s.Params, s.Bars, cfg.HintWindow())
	return res
}
