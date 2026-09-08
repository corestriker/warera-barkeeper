// Erzeugt die gemeinsamen Testvektoren aus der Go-Implementierung.
// Die Go-Fassung ist die Urfassung der Rechnung; sie gibt die Wahrheit vor,
// und die TypeScript-Fassung muss sie treffen.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/corestriker/warera-barkeeper/terminal_app/internal/regen"
)

type barSpec struct {
	Key         string  `json:"key"`
	Max         float64 `json:"max"`
	HourlyRegen float64 `json:"hourlyRegen"`
}

type barExpect struct {
	Key          string   `json:"key"`
	SafeBudget   float64  `json:"safeBudget"`
	SafeFloor    float64  `json:"safeFloor"`
	SafeFloorPct float64  `json:"safeFloorPct"`
	SafeCapped   bool     `json:"safeCapped"`
	RiskyBudget  float64  `json:"riskyBudget"`
	LeftSafe     *float64 `json:"leftSafe,omitempty"`
	DeficitSafe  *float64 `json:"deficitSafe,omitempty"`
	FullAt       string   `json:"fullAt,omitempty"`
	TicksToFull  int      `json:"ticksToFull"`
}

type caseSpec struct {
	Name         string             `json:"name"`
	Base         string             `json:"base"`
	Target       string             `json:"target"`
	TickAnchor   string             `json:"tickAnchor"`
	TickPeriodMs int64              `json:"tickPeriodMs"`
	Bars         []barSpec          `json:"bars"`
	Current      map[string]float64 `json:"current,omitempty"`
	HintWindowMs int64              `json:"hintWindowMs"`
	Expect       struct {
		SafeTicks  int         `json:"safeTicks"`
		RiskyTicks int         `json:"riskyTicks"`
		NextTick   string      `json:"nextTick"`
		Bars       []barExpect `json:"bars"`
		Hint       *struct {
			Kind      string             `json:"kind"`
			Tick      string             `json:"tick"`
			Suggested string             `json:"suggested"`
			GapMs     int64              `json:"gapMs"`
			Extra     map[string]float64 `json:"extra"`
		} `json:"hint"`
	} `json:"expect"`
}

func iso(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func main() {
	berlin, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		panic(err)
	}
	health := regen.Bar{Key: "health", Label: "HEALTH", Max: 140, HourlyRegen: 14}
	hunger := regen.Bar{Key: "hunger", Label: "HUNGER", Max: 7, HourlyRegen: 0.7}
	small := regen.Bar{Key: "health", Label: "HEALTH", Max: 110, HourlyRegen: 11}
	lvl0 := regen.Bar{Key: "hunger", Label: "HUNGER", Max: 4, HourlyRegen: 0.4}

	at := func(loc *time.Location, y int, m time.Month, d, h, min int) time.Time {
		return time.Date(y, m, d, h, min, 0, 0, loc)
	}

	type input struct {
		name    string
		base    time.Time
		target  time.Time
		bars    []regen.Bar
		current map[string]float64
		window  time.Duration
	}

	inputs := []input{
		{"Zielzeit exakt auf einem Tick", at(berlin, 2026, 9, 1, 8, 36), at(berlin, 2026, 9, 1, 14, 0), []regen.Bar{small}, nil, 15 * time.Minute},
		{"Zielzeit fuenf Minuten nach dem Tick", at(berlin, 2026, 9, 1, 8, 36), at(berlin, 2026, 9, 1, 14, 5), []regen.Bar{small}, nil, 15 * time.Minute},
		{"Zielzeit kurz vor einem Tick", at(berlin, 2026, 9, 1, 8, 36), at(berlin, 2026, 9, 1, 13, 50), []regen.Bar{small}, nil, 15 * time.Minute},
		{"Basis exakt auf einem Tick", at(berlin, 2026, 9, 1, 9, 0), at(berlin, 2026, 9, 1, 12, 0), []regen.Bar{small}, nil, 0},
		{"Zielzeit gleich Basis", at(berlin, 2026, 9, 1, 9, 30), at(berlin, 2026, 9, 1, 9, 30), []regen.Bar{small}, nil, 15 * time.Minute},
		{"Zielzeit vor der Basis", at(berlin, 2026, 9, 1, 15, 0), at(berlin, 2026, 9, 1, 14, 0), []regen.Bar{small}, nil, 15 * time.Minute},
		{"Deckelung bei langem Vorlauf", at(berlin, 2026, 9, 1, 1, 0), at(berlin, 2026, 9, 1, 14, 5), []regen.Bar{small}, nil, 15 * time.Minute},
		{"Hunger fraktional", at(berlin, 2026, 9, 1, 8, 36), at(berlin, 2026, 9, 1, 14, 5), []regen.Bar{lvl0}, nil, 15 * time.Minute},
		{"Mit Ist-Werten", at(berlin, 2026, 9, 1, 8, 36), at(berlin, 2026, 9, 1, 14, 0), []regen.Bar{small}, map[string]float64{"health": 70}, 15 * time.Minute},
		{"Ist-Wert unter dem Zielwert", at(berlin, 2026, 9, 1, 8, 36), at(berlin, 2026, 9, 1, 14, 0), []regen.Bar{small}, map[string]float64{"health": 18.6}, 15 * time.Minute},
		{"Beide Leisten mit Ist-Werten", at(berlin, 2026, 9, 1, 11, 12), at(berlin, 2026, 9, 1, 14, 5), []regen.Bar{health, hunger}, map[string]float64{"health": 117.5, "hunger": 6.1}, 15 * time.Minute},
		{"Auffuellzeitpunkt in der Zukunft", at(berlin, 2026, 9, 1, 11, 12), at(berlin, 2026, 9, 1, 14, 5), []regen.Bar{health}, map[string]float64{"health": 80}, 15 * time.Minute},
		{"Sommerzeit: 25-Stunden-Tag", at(berlin, 2026, 10, 25, 0, 30), at(berlin, 2026, 10, 25, 14, 5), []regen.Bar{health}, nil, 15 * time.Minute},
		{"Normaler Tag als Gegenprobe", at(berlin, 2026, 10, 24, 0, 30), at(berlin, 2026, 10, 24, 14, 5), []regen.Bar{health}, nil, 15 * time.Minute},
		{"Verschobenes Tick-Raster", at(berlin, 2026, 9, 1, 8, 36), at(berlin, 2026, 9, 1, 14, 5), []regen.Bar{health}, nil, 15 * time.Minute},
	}

	out := make([]caseSpec, 0, len(inputs))
	for i, in := range inputs {
		anchor := regen.NextWholeHourUTC(in.base)
		if in.name == "Verschobenes Tick-Raster" {
			// WarEra kann das Raster verschieben; dann zaehlt der Anchor aus der API.
			anchor = anchor.Add(30 * time.Minute)
		}
		p := regen.Params{Base: in.base, Target: in.target, TickAnchor: anchor, TickPeriod: regen.DefaultTickPeriod}
		res := regen.Compute(p, in.bars, in.current)
		hint := regen.ComputeHint(p, in.bars, in.window)

		c := caseSpec{
			Name: in.name, Base: iso(in.base), Target: iso(in.target), TickAnchor: iso(anchor),
			TickPeriodMs: int64(regen.DefaultTickPeriod / time.Millisecond),
			Current:      in.current, HintWindowMs: int64(in.window / time.Millisecond),
		}
		for _, b := range in.bars {
			c.Bars = append(c.Bars, barSpec{b.Key, b.Max, b.HourlyRegen})
		}
		c.Expect.SafeTicks = regen.CountTicks(p, false)
		c.Expect.RiskyTicks = regen.CountTicks(p, true)
		c.Expect.NextTick = iso(regen.TickAfter(p, in.base))
		for _, br := range res.Bars {
			e := barExpect{
				Key: br.Bar.Key, SafeBudget: br.Safe.Budget, SafeFloor: br.Safe.Floor,
				SafeFloorPct: br.Safe.FloorPct, SafeCapped: br.Safe.Capped, RiskyBudget: br.Risky.Budget,
				TicksToFull: br.TicksToFull,
			}
			if br.HasCurrent {
				left, deficit := br.LeftSafe, br.DeficitSafe
				e.LeftSafe, e.DeficitSafe = &left, &deficit
			}
			if !br.FullAt.IsZero() {
				e.FullAt = iso(br.FullAt)
			}
			c.Expect.Bars = append(c.Expect.Bars, e)
		}
		if hint != nil {
			kind := "nearTick"
			if hint.Kind == regen.HintOnTick {
				kind = "onTick"
			}
			c.Expect.Hint = &struct {
				Kind      string             `json:"kind"`
				Tick      string             `json:"tick"`
				Suggested string             `json:"suggested"`
				GapMs     int64              `json:"gapMs"`
				Extra     map[string]float64 `json:"extra"`
			}{kind, iso(hint.Tick), iso(hint.Suggested), int64(hint.Gap / time.Millisecond), hint.Extra}
		}
		out = append(out, c)
		_ = i
	}

	doc := map[string]any{
		"_kommentar": "Erzeugt aus der Go-Implementierung (internal/regen) — siehe spec/README.md. Nicht von Hand pflegen.",
		"faelle":     out,
	}
	body, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		panic(err)
	}
	if err := os.WriteFile(os.Args[1], append(body, '\n'), 0o644); err != nil {
		panic(err)
	}
	fmt.Printf("%d Fälle geschrieben nach %s\n", len(out), os.Args[1])
}
