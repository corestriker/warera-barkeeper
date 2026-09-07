package regen

import "time"

// HintKind unterscheidet, warum ein Hinweis ausgelöst wurde.
type HintKind int

const (
	// HintOnTick: die Zielzeit liegt exakt auf einem Tick.
	HintOnTick HintKind = iota
	// HintNearTick: kurz nach der Zielzeit käme noch ein Tick.
	HintNearTick
)

// HintOffset ist der Sicherheitsabstand, um den der Vorschlag hinter dem Tick liegt.
const HintOffset = 5 * time.Minute

// TargetAfterTick liefert eine Zielzeit, die den Tick um t herum verlässlich
// mitnimmt: den ersten Tick auf oder nach t, plus HintOffset.
//
// Gedacht für eine Zielzeit, die aus einem Ereignis kommt (Ende des
// Pillen-Debuffs) und auf das Tick-Raster gehoben werden soll. Der Zuschlag
// ist nicht Kosmetik: genau auf dem Tick wäre die Gutschrift ein Münzwurf.
func TargetAfterTick(p Params, t time.Time) time.Time {
	return TickAtOrAfter(p, t).Add(HintOffset)
}

// Hint schlägt eine minimal verschobene Zielzeit vor, die einen weiteren Tick
// mitnimmt. Das ist der eigentliche Trick am Regen in Stunden-Ticks: fünf
// Minuten später anfangen zu wollen kann eine ganze Regenerationsstunde
// schenken.
type Hint struct {
	Kind      HintKind
	Tick      time.Time // der Tick, um den es geht
	Suggested time.Time // vorgeschlagene neue Zielzeit
	Gap       time.Duration
	Extra     map[string]float64 // zusätzliches Budget je Leisten-Key
}

// ComputeHint prüft, ob die Zielzeit dicht an einem Tick liegt, und beziffert
// den Gewinn einer Verschiebung. Liefert nil, wenn nichts zu holen ist.
func ComputeHint(p Params, bars []Bar, window time.Duration) *Hint {
	if window <= 0 || !p.Target.After(p.Base) {
		return nil
	}
	tick := TickAtOrAfter(p, p.Target)
	gap := tick.Sub(p.Target)
	if gap > window {
		return nil
	}

	h := &Hint{
		Kind:      HintNearTick,
		Tick:      tick,
		Suggested: tick.Add(HintOffset),
		Gap:       gap,
		Extra:     make(map[string]float64, len(bars)),
	}
	if gap == 0 {
		h.Kind = HintOnTick
	}

	shifted := p
	shifted.Target = h.Suggested
	now := CountTicks(p, false)
	then := CountTicks(shifted, false)
	if then <= now {
		return nil
	}

	any := false
	for _, b := range bars {
		diff := evaluate(b, then).Budget - evaluate(b, now).Budget
		h.Extra[b.Key] = diff
		if diff > 0 {
			any = true
		}
	}
	// Sind alle Leisten schon voll auffüllbar, bringt die Verschiebung nichts.
	if !any {
		return nil
	}
	return h
}
