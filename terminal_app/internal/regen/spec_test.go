package regen

import (
	"encoding/json"
	"math"
	"os"
	"testing"
	"time"
)

// Die gemeinsamen Testvektoren liegen im Repo-Root und werden von beiden
// Anwendungen gelesen: hier und in web_app/src/lib/spec.test.ts. Damit fällt
// ein Auseinanderdriften der beiden Rechnungen sofort auf.
//
// Erzeugt werden sie aus dieser Implementierung — sie ist die Urfassung:
//
//	go run ./tools/specgen ../spec/regen-cases.json
//
// Dieser Test prüft die Gegenrichtung: dass die Datei zur Implementierung
// passt. Wer die Rechnung ändert, erzeugt die Datei neu und sieht im
// TypeScript-Test, ob die Webapp mitgezogen hat.
const specPath = "../../../spec/regen-cases.json"

type specBar struct {
	Key         string  `json:"key"`
	Max         float64 `json:"max"`
	HourlyRegen float64 `json:"hourlyRegen"`
}

type specBarExpect struct {
	Key          string   `json:"key"`
	SafeBudget   float64  `json:"safeBudget"`
	SafeFloor    float64  `json:"safeFloor"`
	SafeFloorPct float64  `json:"safeFloorPct"`
	SafeCapped   bool     `json:"safeCapped"`
	RiskyBudget  float64  `json:"riskyBudget"`
	LeftSafe     *float64 `json:"leftSafe"`
	DeficitSafe  *float64 `json:"deficitSafe"`
	FullAt       string   `json:"fullAt"`
	TicksToFull  int      `json:"ticksToFull"`
}

type specCase struct {
	Name         string             `json:"name"`
	Base         time.Time          `json:"base"`
	Target       time.Time          `json:"target"`
	TickAnchor   time.Time          `json:"tickAnchor"`
	TickPeriodMs int64              `json:"tickPeriodMs"`
	Bars         []specBar          `json:"bars"`
	Current      map[string]float64 `json:"current"`
	HintWindowMs int64              `json:"hintWindowMs"`
	Expect       struct {
		SafeTicks  int             `json:"safeTicks"`
		RiskyTicks int             `json:"riskyTicks"`
		NextTick   time.Time       `json:"nextTick"`
		Bars       []specBarExpect `json:"bars"`
		Hint       *struct {
			Kind      string             `json:"kind"`
			Tick      time.Time          `json:"tick"`
			Suggested time.Time          `json:"suggested"`
			GapMs     int64              `json:"gapMs"`
			Extra     map[string]float64 `json:"extra"`
		} `json:"hint"`
	} `json:"expect"`
}

func loadSpec(t *testing.T) []specCase {
	t.Helper()
	data, err := os.ReadFile(specPath)
	if err != nil {
		t.Fatalf("gemeinsame Testvektoren nicht lesbar: %v", err)
	}
	var doc struct {
		Faelle []specCase `json:"faelle"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatalf("%s ist kein gültiges JSON: %v", specPath, err)
	}
	if len(doc.Faelle) == 0 {
		t.Fatalf("%s enthält keine Fälle", specPath)
	}
	return doc.Faelle
}

func nearly(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func TestGemeinsameTestvektoren(t *testing.T) {
	for _, tc := range loadSpec(t) {
		t.Run(tc.Name, func(t *testing.T) {
			p := Params{
				Base:       tc.Base,
				Target:     tc.Target,
				TickAnchor: tc.TickAnchor,
				TickPeriod: time.Duration(tc.TickPeriodMs) * time.Millisecond,
			}
			bars := make([]Bar, 0, len(tc.Bars))
			for _, b := range tc.Bars {
				bars = append(bars, Bar{Key: b.Key, Max: b.Max, HourlyRegen: b.HourlyRegen})
			}

			if got := CountTicks(p, false); got != tc.Expect.SafeTicks {
				t.Errorf("sichere Ticks = %d, erwartet %d", got, tc.Expect.SafeTicks)
			}
			if got := CountTicks(p, true); got != tc.Expect.RiskyTicks {
				t.Errorf("riskante Ticks = %d, erwartet %d", got, tc.Expect.RiskyTicks)
			}
			if got := TickAfter(p, p.Base); !got.Equal(tc.Expect.NextTick) {
				t.Errorf("nächster Tick = %s, erwartet %s", got, tc.Expect.NextTick)
			}

			res := Compute(p, bars, tc.Current)
			if len(res.Bars) != len(tc.Expect.Bars) {
				t.Fatalf("%d Leisten, erwartet %d", len(res.Bars), len(tc.Expect.Bars))
			}
			for i, want := range tc.Expect.Bars {
				got := res.Bars[i]
				if got.Bar.Key != want.Key {
					t.Fatalf("Leiste %d ist %q, erwartet %q", i, got.Bar.Key, want.Key)
				}
				if !nearly(got.Safe.Budget, want.SafeBudget) {
					t.Errorf("%s: Budget = %v, erwartet %v", want.Key, got.Safe.Budget, want.SafeBudget)
				}
				if !nearly(got.Safe.Floor, want.SafeFloor) {
					t.Errorf("%s: Zielwert = %v, erwartet %v", want.Key, got.Safe.Floor, want.SafeFloor)
				}
				if !nearly(got.Safe.FloorPct, want.SafeFloorPct) {
					t.Errorf("%s: Zielwert-Prozent = %v, erwartet %v", want.Key, got.Safe.FloorPct, want.SafeFloorPct)
				}
				if got.Safe.Capped != want.SafeCapped {
					t.Errorf("%s: Capped = %v, erwartet %v", want.Key, got.Safe.Capped, want.SafeCapped)
				}
				if !nearly(got.Risky.Budget, want.RiskyBudget) {
					t.Errorf("%s: riskantes Budget = %v, erwartet %v", want.Key, got.Risky.Budget, want.RiskyBudget)
				}
				if want.LeftSafe != nil && !nearly(got.LeftSafe, *want.LeftSafe) {
					t.Errorf("%s: LeftSafe = %v, erwartet %v", want.Key, got.LeftSafe, *want.LeftSafe)
				}
				if want.DeficitSafe != nil && !nearly(got.DeficitSafe, *want.DeficitSafe) {
					t.Errorf("%s: Fehlbetrag = %v, erwartet %v", want.Key, got.DeficitSafe, *want.DeficitSafe)
				}
				if got.TicksToFull != want.TicksToFull {
					t.Errorf("%s: TicksToFull = %d, erwartet %d", want.Key, got.TicksToFull, want.TicksToFull)
				}
				if want.FullAt == "" {
					if !got.FullAt.IsZero() {
						t.Errorf("%s: FullAt = %s, erwartet leer", want.Key, got.FullAt)
					}
				} else {
					wantAt, err := time.Parse(time.RFC3339, want.FullAt)
					if err != nil {
						t.Fatalf("FullAt %q unlesbar: %v", want.FullAt, err)
					}
					if !got.FullAt.Equal(wantAt) {
						t.Errorf("%s: FullAt = %s, erwartet %s", want.Key, got.FullAt, wantAt)
					}
				}
			}

			hint := ComputeHint(p, bars, time.Duration(tc.HintWindowMs)*time.Millisecond)
			if tc.Expect.Hint == nil {
				if hint != nil {
					t.Errorf("kein Hinweis erwartet, got %+v", hint)
				}
				return
			}
			if hint == nil {
				t.Fatalf("Hinweis erwartet: %+v", tc.Expect.Hint)
			}
			kind := "nearTick"
			if hint.Kind == HintOnTick {
				kind = "onTick"
			}
			if kind != tc.Expect.Hint.Kind {
				t.Errorf("Hinweis-Art = %s, erwartet %s", kind, tc.Expect.Hint.Kind)
			}
			if !hint.Suggested.Equal(tc.Expect.Hint.Suggested) {
				t.Errorf("Vorschlag = %s, erwartet %s", hint.Suggested, tc.Expect.Hint.Suggested)
			}
			if int64(hint.Gap/time.Millisecond) != tc.Expect.Hint.GapMs {
				t.Errorf("Abstand = %v, erwartet %d ms", hint.Gap, tc.Expect.Hint.GapMs)
			}
			for key, want := range tc.Expect.Hint.Extra {
				if !nearly(hint.Extra[key], want) {
					t.Errorf("Zusatzbudget %s = %v, erwartet %v", key, hint.Extra[key], want)
				}
			}
		})
	}
}
