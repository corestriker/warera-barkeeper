// Package regen berechnet, wie weit eine WarEra-Leiste (Health, Hunger, …)
// leergespielt werden darf, damit sie zu einem Zielzeitpunkt wieder voll ist.
//
// Der entscheidende Punkt: WarEra regeneriert nicht kontinuierlich, sondern in
// Stunden-Ticks. Zu jedem Tick werden max/10 gutgeschrieben, gedeckelt bei
// max. Ob ein Tick noch vor die Zielzeit fällt oder knapp dahinter, macht also
// immer gleich eine ganze Regenerationsstunde Unterschied.
package regen

import (
	"math"
	"time"
)

// DefaultTickPeriod ist der Abstand zwischen zwei Regen-Ticks.
const DefaultTickPeriod = time.Hour

// Bar beschreibt eine regenerierende Leiste.
type Bar struct {
	Key         string  // "health", "hunger"
	Label       string  // Anzeigename
	Max         float64 // Maximalwert (skills.<bar>.total)
	HourlyRegen float64 // Gutschrift pro Tick (skills.<bar>.hourlyBarRegen)
}

// Params sind die Zeitparameter einer Berechnung.
type Params struct {
	Base       time.Time     // Zeitpunkt, ab dem gerechnet wird
	Target     time.Time     // Zeitpunkt, zu dem alles wieder voll sein soll
	TickAnchor time.Time     // ein bekannter Tick-Zeitpunkt (aus gameConfig.getDates)
	TickPeriod time.Duration // Abstand der Ticks, normalerweise eine Stunde
}

// Variant ist das Ergebnis für eine der beiden Zählweisen.
type Variant struct {
	Ticks    int     // Anzahl der Ticks bis zur Zielzeit
	Regen    float64 // ungedeckelte Regeneration: Ticks * HourlyRegen
	Budget   float64 // was tatsächlich ausgegeben werden darf
	Floor    float64 // Wert, auf den man runter darf
	FloorPct float64 // Floor in Prozent von Max
	Capped   bool    // true, wenn die Regeneration für ein volles Auffüllen reicht
}

// BarResult ist das Gesamtergebnis für eine Leiste.
//
// Angezeigt wird ausschließlich Safe: eine Zahl, die hält. Risky bleibt
// gerechnet, weil es die Mechanik vollständig abbildet und die Grundlage für
// den Hinweis ist ("Zielzeit fünf Minuten später, dann zählt der Tick mit") —
// als zweite Zahl in der Oberfläche hat es sich nicht bewährt.
type BarResult struct {
	Bar   Bar
	Safe  Variant // Tick exakt auf der Zielzeit zählt NICHT — das ist die angezeigte Zahl
	Risky Variant // Tick exakt auf der Zielzeit zählt MIT — nur intern

	// Nur befüllt, wenn mit echten Ist-Werten gerechnet wird.
	HasCurrent bool
	Current    float64
	LeftSafe   float64 // wie viel vom Ist-Wert aus noch ausgegeben werden darf
	LeftRisky  float64

	// Deficit ist der Betrag, der bis zur Zielzeit fehlt, wenn der Ist-Wert
	// schon unter dem Zielwert liegt. Dann ist die Leiste nicht mehr
	// rechtzeitig voll — die wichtigere Information als "0 ausgebbar".
	DeficitSafe  float64
	DeficitRisky float64

	// FullAt ist der Tick, zu dem die Leiste von Current aus wieder bei Max
	// steht. Nur gesetzt, wenn ein Ist-Wert vorliegt und die Leiste noch
	// nicht voll ist — sonst der Nullwert.
	FullAt      time.Time
	TicksToFull int
}

// Result bündelt die Ergebnisse aller Leisten samt Zeitkontext.
type Result struct {
	Params Params
	Bars   []BarResult
	Hint   *Hint
}

// floorDiv teilt abrundend Richtung minus unendlich (Go trunkiert Richtung null).
func floorDiv(a, b int64) int64 {
	q := a / b
	if (a%b != 0) && ((a < 0) != (b < 0)) {
		q--
	}
	return q
}

// ceilDiv teilt aufrundend Richtung plus unendlich.
func ceilDiv(a, b int64) int64 {
	q := a / b
	if (a%b != 0) && ((a < 0) == (b < 0)) {
		q++
	}
	return q
}

func period(p Params) time.Duration {
	if p.TickPeriod <= 0 {
		return DefaultTickPeriod
	}
	return p.TickPeriod
}

// lastTickIndexAtOrBefore liefert das größte k mit anchor+k*period <= t.
func lastTickIndexAtOrBefore(p Params, t time.Time) int64 {
	return floorDiv(int64(t.Sub(p.TickAnchor)), int64(period(p)))
}

// lastTickIndexBefore liefert das größte k mit anchor+k*period < t.
func lastTickIndexBefore(p Params, t time.Time) int64 {
	return ceilDiv(int64(t.Sub(p.TickAnchor)), int64(period(p))) - 1
}

// CountTicks zählt die Regen-Ticks zwischen Base und Target.
//
// inclusive=false zählt das offene Intervall (Base, Target): ein Tick, der
// exakt auf der Zielzeit liegt, wird nicht mitgezählt. inclusive=true zählt
// (Base, Target] und nimmt ihn mit.
func CountTicks(p Params, inclusive bool) int {
	if !p.Target.After(p.Base) {
		return 0
	}
	from := lastTickIndexAtOrBefore(p, p.Base)
	var to int64
	if inclusive {
		to = lastTickIndexAtOrBefore(p, p.Target)
	} else {
		to = lastTickIndexBefore(p, p.Target)
	}
	if to <= from {
		return 0
	}
	return int(to - from)
}

// TickAtOrAfter liefert den ersten Tick, der auf oder nach t liegt.
func TickAtOrAfter(p Params, t time.Time) time.Time {
	k := ceilDiv(int64(t.Sub(p.TickAnchor)), int64(period(p)))
	return p.TickAnchor.Add(time.Duration(k) * period(p))
}

// TickAfter liefert den ersten Tick echt nach t.
func TickAfter(p Params, t time.Time) time.Time {
	k := floorDiv(int64(t.Sub(p.TickAnchor)), int64(period(p))) + 1
	return p.TickAnchor.Add(time.Duration(k) * period(p))
}

// UpcomingTicks liefert bis zu limit Tick-Zeitpunkte im Intervall (Base, Target].
func UpcomingTicks(p Params, limit int) []time.Time {
	var out []time.Time
	t := TickAfter(p, p.Base)
	for len(out) < limit && !t.After(p.Target) {
		out = append(out, t)
		t = t.Add(period(p))
	}
	return out
}

// evaluate rechnet eine Tick-Anzahl in ein Budget für eine Leiste um.
func evaluate(b Bar, ticks int) Variant {
	v := Variant{Ticks: ticks, Regen: float64(ticks) * b.HourlyRegen}
	v.Budget = v.Regen
	if v.Budget >= b.Max {
		v.Budget = b.Max
		v.Capped = true
	}
	if v.Budget < 0 {
		v.Budget = 0
	}
	v.Floor = b.Max - v.Budget
	if b.Max > 0 {
		v.FloorPct = v.Floor / b.Max * 100
	}
	return v
}

// TicksToFull zählt die Ticks, bis eine Leiste von current aus wieder bei Max
// steht. 0 heißt: schon voll (oder es gibt keine Regeneration).
func TicksToFull(b Bar, current float64) int {
	missing := b.Max - current
	if missing <= 0 || b.HourlyRegen <= 0 {
		return 0
	}
	// Aufrunden: ein halber Tick füllt nichts auf, es zählt der Tick, der die
	// Leiste über die Kante schiebt.
	return int(math.Ceil(missing / b.HourlyRegen))
}

// FullAt liefert den Zeitpunkt, zu dem die Leiste von current aus wieder voll
// ist. ok ist false, wenn sie das schon ist oder nicht regeneriert.
//
// Gezählt wird ab dem ersten Tick echt nach Base — genau die Ticks, die auch
// CountTicks zählt, damit beide Zahlen dieselbe Wirklichkeit beschreiben.
func FullAt(p Params, b Bar, current float64) (time.Time, int, bool) {
	n := TicksToFull(b, current)
	if n == 0 {
		return time.Time{}, 0, false
	}
	first := TickAfter(p, p.Base)
	return first.Add(time.Duration(n-1) * period(p)), n, true
}

// Compute berechnet für jede Leiste, wie weit sie leergespielt werden darf.
//
// current ordnet Leisten-Keys ihren echten Ist-Wert zu und darf nil sein. Ohne
// Ist-Werte gilt die Annahme, dass zum Zeitpunkt Base alles voll ist.
func Compute(p Params, bars []Bar, current map[string]float64) Result {
	safeTicks := CountTicks(p, false)
	riskyTicks := CountTicks(p, true)

	res := Result{Params: p, Bars: make([]BarResult, 0, len(bars))}
	for _, b := range bars {
		br := BarResult{
			Bar:   b,
			Safe:  evaluate(b, safeTicks),
			Risky: evaluate(b, riskyTicks),
		}
		if cur, ok := current[b.Key]; ok {
			br.HasCurrent = true
			br.Current = cur
			br.LeftSafe = math.Max(0, cur-br.Safe.Floor)
			br.LeftRisky = math.Max(0, cur-br.Risky.Floor)
			br.DeficitSafe = math.Max(0, br.Safe.Floor-cur)
			br.DeficitRisky = math.Max(0, br.Risky.Floor-cur)
			if at, n, ok := FullAt(p, b, cur); ok {
				br.FullAt, br.TicksToFull = at, n
			}
		}
		res.Bars = append(res.Bars, br)
	}
	return res
}
