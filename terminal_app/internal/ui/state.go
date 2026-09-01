package ui

import (
	"time"

	"github.com/yourname/warera-barkeeper/terminal_app/internal/config"
	"github.com/yourname/warera-barkeeper/terminal_app/internal/regen"
	"github.com/yourname/warera-barkeeper/terminal_app/internal/warera"
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
}

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
