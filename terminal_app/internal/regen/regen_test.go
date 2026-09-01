package regen

import (
	"math"
	"testing"
	"time"
)

var berlin = mustLoad("Europe/Berlin")

func mustLoad(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

// anchorAt baut Params mit einem Tick-Raster zur vollen Stunde UTC.
func paramsAt(base, target time.Time) Params {
	return Params{
		Base:       base,
		Target:     target,
		TickAnchor: NextWholeHourUTC(base),
		TickPeriod: time.Hour,
	}
}

func clock(loc *time.Location, h, m int) time.Time {
	return time.Date(2026, 9, 1, h, m, 0, 0, loc)
}

func TestCountTicks(t *testing.T) {
	tests := []struct {
		name      string
		base      time.Time
		target    time.Time
		wantSafe  int
		wantRisky int
	}{
		{
			// Der Fall aus der README: 08:36 -> 14:00.
			// Ticks 09,10,11,12,13 sicher; der 14:00-Tick nur riskant.
			name:      "Zielzeit exakt auf einem Tick",
			base:      clock(berlin, 8, 36),
			target:    clock(berlin, 14, 0),
			wantSafe:  5,
			wantRisky: 6,
		},
		{
			// Fünf Minuten später und der 14:00-Tick ist sicher drin.
			name:      "Zielzeit fuenf Minuten nach dem Tick",
			base:      clock(berlin, 8, 36),
			target:    clock(berlin, 14, 5),
			wantSafe:  6,
			wantRisky: 6,
		},
		{
			name:      "Zielzeit kurz vor einem Tick",
			base:      clock(berlin, 8, 36),
			target:    clock(berlin, 13, 50),
			wantSafe:  5,
			wantRisky: 5,
		},
		{
			name:      "Basis exakt auf einem Tick zaehlt diesen nicht mit",
			base:      clock(berlin, 9, 0),
			target:    clock(berlin, 12, 0),
			wantSafe:  2,
			wantRisky: 3,
		},
		{
			name:      "Zielzeit gleich Basis",
			base:      clock(berlin, 9, 30),
			target:    clock(berlin, 9, 30),
			wantSafe:  0,
			wantRisky: 0,
		},
		{
			name:      "Zielzeit vor der Basis",
			base:      clock(berlin, 15, 0),
			target:    clock(berlin, 14, 0),
			wantSafe:  0,
			wantRisky: 0,
		},
		{
			name:      "Weniger als eine Stunde Vorlauf",
			base:      clock(berlin, 13, 10),
			target:    clock(berlin, 13, 50),
			wantSafe:  0,
			wantRisky: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p := paramsAt(tc.base, tc.target)
			if got := CountTicks(p, false); got != tc.wantSafe {
				t.Errorf("sicher: got %d, want %d", got, tc.wantSafe)
			}
			if got := CountTicks(p, true); got != tc.wantRisky {
				t.Errorf("riskant: got %d, want %d", got, tc.wantRisky)
			}
		})
	}
}

func TestComputeHealthExample(t *testing.T) {
	health := Bar{Key: "health", Label: "Health", Max: 110, HourlyRegen: 11}
	p := paramsAt(clock(berlin, 8, 36), clock(berlin, 14, 0))

	res := Compute(p, []Bar{health}, nil)
	got := res.Bars[0]

	if got.Safe.Ticks != 5 || got.Safe.Budget != 55 || got.Safe.Floor != 55 {
		t.Errorf("sicher: %+v", got.Safe)
	}
	if math.Abs(got.Safe.FloorPct-50) > 1e-9 {
		t.Errorf("sicher FloorPct = %v, want 50", got.Safe.FloorPct)
	}
	if got.Risky.Ticks != 6 || got.Risky.Budget != 66 || got.Risky.Floor != 44 {
		t.Errorf("riskant: %+v", got.Risky)
	}
	if math.Abs(got.Risky.FloorPct-40) > 1e-9 {
		t.Errorf("riskant FloorPct = %v, want 40", got.Risky.FloorPct)
	}
}

func TestComputeCapsAtMax(t *testing.T) {
	// Zwölf Stunden Vorlauf regenerieren mehr als eine volle Leiste.
	health := Bar{Key: "health", Label: "Health", Max: 110, HourlyRegen: 11}
	p := paramsAt(clock(berlin, 1, 0), clock(berlin, 14, 5))

	got := Compute(p, []Bar{health}, nil).Bars[0]
	if !got.Safe.Capped {
		t.Fatalf("erwartet Capped, got %+v", got.Safe)
	}
	if got.Safe.Budget != 110 || got.Safe.Floor != 0 || got.Safe.FloorPct != 0 {
		t.Errorf("Budget/Floor nicht gedeckelt: %+v", got.Safe)
	}
	if got.Safe.Regen <= got.Safe.Budget {
		t.Errorf("Regen sollte ungedeckelt groesser sein: %+v", got.Safe)
	}
}

func TestComputeFractionalHunger(t *testing.T) {
	// Hunger hat auf Skill-Level 0 nur max 4 und regeneriert 0.4 pro Tick.
	hunger := Bar{Key: "hunger", Label: "Hunger", Max: 4, HourlyRegen: 0.4}
	p := paramsAt(clock(berlin, 8, 36), clock(berlin, 14, 5))

	got := Compute(p, []Bar{hunger}, nil).Bars[0]
	if got.Safe.Ticks != 6 {
		t.Fatalf("Ticks = %d, want 6", got.Safe.Ticks)
	}
	if math.Abs(got.Safe.Budget-2.4) > 1e-9 {
		t.Errorf("Budget = %v, want 2.4", got.Safe.Budget)
	}
	if math.Abs(got.Safe.Floor-1.6) > 1e-9 {
		t.Errorf("Floor = %v, want 1.6", got.Safe.Floor)
	}
}

func TestComputeWithCurrentValues(t *testing.T) {
	health := Bar{Key: "health", Label: "Health", Max: 110, HourlyRegen: 11}
	p := paramsAt(clock(berlin, 8, 36), clock(berlin, 14, 0))

	// Floor sicher ist 55. Bei 70 Ist-Wert bleiben also noch 15 uebrig.
	got := Compute(p, []Bar{health}, map[string]float64{"health": 70}).Bars[0]
	if !got.HasCurrent || got.Current != 70 {
		t.Fatalf("Ist-Wert nicht uebernommen: %+v", got)
	}
	if got.LeftSafe != 15 {
		t.Errorf("LeftSafe = %v, want 15", got.LeftSafe)
	}
	if got.LeftRisky != 26 {
		t.Errorf("LeftRisky = %v, want 26", got.LeftRisky)
	}

	// Wer schon unter dem Floor liegt, darf nichts mehr ausgeben (nicht negativ).
	got = Compute(p, []Bar{health}, map[string]float64{"health": 30}).Bars[0]
	if got.LeftSafe != 0 {
		t.Errorf("LeftSafe = %v, want 0", got.LeftSafe)
	}
}

func TestComputeHint(t *testing.T) {
	bars := []Bar{{Key: "health", Label: "Health", Max: 110, HourlyRegen: 11}}

	t.Run("Zielzeit exakt auf Tick", func(t *testing.T) {
		p := paramsAt(clock(berlin, 8, 36), clock(berlin, 14, 0))
		h := ComputeHint(p, bars, 15*time.Minute)
		if h == nil {
			t.Fatal("erwartet Hinweis")
		}
		if h.Kind != HintOnTick || h.Gap != 0 {
			t.Errorf("Kind/Gap: %v / %v", h.Kind, h.Gap)
		}
		if !h.Suggested.Equal(clock(berlin, 14, 5)) {
			t.Errorf("Suggested = %v, want 14:05", h.Suggested)
		}
		if h.Extra["health"] != 11 {
			t.Errorf("Extra = %v, want 11", h.Extra["health"])
		}
	})

	t.Run("Zielzeit kurz vor Tick", func(t *testing.T) {
		p := paramsAt(clock(berlin, 8, 36), clock(berlin, 13, 50))
		h := ComputeHint(p, bars, 15*time.Minute)
		if h == nil {
			t.Fatal("erwartet Hinweis")
		}
		if h.Kind != HintNearTick || h.Gap != 10*time.Minute {
			t.Errorf("Kind/Gap: %v / %v", h.Kind, h.Gap)
		}
	})

	t.Run("Zielzeit weit weg vom Tick", func(t *testing.T) {
		p := paramsAt(clock(berlin, 8, 36), clock(berlin, 13, 20))
		if h := ComputeHint(p, bars, 15*time.Minute); h != nil {
			t.Errorf("kein Hinweis erwartet, got %+v", h)
		}
	})

	t.Run("Kein Hinweis wenn ohnehin voll auffuellbar", func(t *testing.T) {
		p := paramsAt(clock(berlin, 1, 0), clock(berlin, 14, 0))
		if h := ComputeHint(p, bars, 15*time.Minute); h != nil {
			t.Errorf("kein Hinweis erwartet, got %+v", h)
		}
	})
}

func TestNextOccurrence(t *testing.T) {
	base := clock(berlin, 8, 36)

	if got := NextOccurrence(base, 14, 5); !got.Equal(clock(berlin, 14, 5)) {
		t.Errorf("heute: got %v", got)
	}
	// Liegt die Zielzeit schon hinter der Basis, rollt sie auf morgen.
	want := time.Date(2026, 9, 2, 7, 0, 0, 0, berlin)
	if got := NextOccurrence(base, 7, 0); !got.Equal(want) {
		t.Errorf("morgen: got %v, want %v", got, want)
	}
	// Zielzeit exakt gleich der Basis zaehlt als vergangen.
	want = time.Date(2026, 9, 2, 8, 36, 0, 0, berlin)
	if got := NextOccurrence(base, 8, 36); !got.Equal(want) {
		t.Errorf("gleich: got %v, want %v", got, want)
	}
}

func TestDSTTransition(t *testing.T) {
	// In der Nacht vom 25. auf den 26. Oktober 2026 wird in Europa die Uhr um
	// 03:00 auf 02:00 zurueckgestellt. Der Kalendertag hat 25 Stunden, das
	// Tick-Raster laeuft aber stur in UTC weiter.
	base := time.Date(2026, 10, 25, 0, 30, 0, 0, berlin)
	target := NextOccurrence(base, 14, 5)

	if want := time.Date(2026, 10, 25, 14, 5, 0, 0, berlin); !target.Equal(want) {
		t.Fatalf("target = %v, want %v", target, want)
	}
	// Von 00:30 aus liegen an diesem 25-Stunden-Tag 15 Ticks vor 14:05.
	p := paramsAt(base, target)
	if got := CountTicks(p, false); got != 15 {
		t.Errorf("Ticks = %d, want 15 (Tag hat 25 Stunden)", got)
	}
	// Gegenprobe: derselbe Wanduhr-Abstand an einem normalen Tag ergibt einen Tick weniger.
	base = time.Date(2026, 10, 24, 0, 30, 0, 0, berlin)
	p = paramsAt(base, NextOccurrence(base, 14, 5))
	if got := CountTicks(p, false); got != 14 {
		t.Errorf("Ticks = %d, want 14 (normaler Tag)", got)
	}
}

func TestParseClock(t *testing.T) {
	for _, tc := range []struct {
		in      string
		h, m    int
		wantErr bool
	}{
		{in: "14:05", h: 14, m: 5},
		{in: "07:00", h: 7, m: 0},
		{in: "0:00", h: 0, m: 0},
		{in: " 23:59 ", h: 23, m: 59},
		{in: "24:00", wantErr: true},
		{in: "12:60", wantErr: true},
		{in: "1400", wantErr: true},
		{in: "", wantErr: true},
		{in: "ab:cd", wantErr: true},
	} {
		h, m, err := ParseClock(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("ParseClock(%q): Fehler erwartet", tc.in)
			}
			continue
		}
		if err != nil {
			t.Errorf("ParseClock(%q): %v", tc.in, err)
		} else if h != tc.h || m != tc.m {
			t.Errorf("ParseClock(%q) = %d:%d, want %d:%d", tc.in, h, m, tc.h, tc.m)
		}
	}
}

func TestUpcomingTicks(t *testing.T) {
	p := paramsAt(clock(berlin, 8, 36), clock(berlin, 14, 5))
	got := UpcomingTicks(p, 3)
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3", len(got))
	}
	if !got[0].Equal(clock(berlin, 9, 0)) {
		t.Errorf("erster Tick = %v, want 09:00", got[0])
	}
	// Ueber die Zielzeit hinaus wird nicht aufgefuellt.
	if got := UpcomingTicks(p, 50); len(got) != 6 {
		t.Errorf("len = %d, want 6", len(got))
	}
}

func TestComputeDeficit(t *testing.T) {
	// Wer schon unter dem Zielwert liegt, schafft die 100% nicht mehr. Das ist
	// die wichtigere Aussage als "0 ausgebbar".
	health := Bar{Key: "health", Label: "Health", Max: 110, HourlyRegen: 11}
	p := paramsAt(clock(berlin, 8, 36), clock(berlin, 14, 0))

	got := Compute(p, []Bar{health}, map[string]float64{"health": 18.6}).Bars[0]
	if math.Abs(got.DeficitSafe-36.4) > 1e-9 {
		t.Errorf("DeficitSafe = %v, want 36.4", got.DeficitSafe)
	}
	if math.Abs(got.DeficitRisky-25.4) > 1e-9 {
		t.Errorf("DeficitRisky = %v, want 25.4", got.DeficitRisky)
	}

	// Ueber dem Zielwert gibt es kein Defizit.
	got = Compute(p, []Bar{health}, map[string]float64{"health": 80}).Bars[0]
	if got.DeficitSafe != 0 || got.DeficitRisky != 0 {
		t.Errorf("kein Defizit erwartet: %+v", got)
	}
}

func TestTicksToFull(t *testing.T) {
	health := Bar{Key: "health", Max: 140, HourlyRegen: 14}
	hunger := Bar{Key: "hunger", Max: 7, HourlyRegen: 0.7}

	tests := []struct {
		name    string
		bar     Bar
		current float64
		want    int
	}{
		{"schon voll", health, 140, 0},
		{"über voll", health, 150, 0},
		{"genau ein Tick fehlt", health, 126, 1},
		{"ein halber Tick fehlt — trotzdem ein ganzer Tick", health, 133, 1},
		{"anderthalb Ticks fehlen", health, 119, 2},
		{"leer", health, 0, 10},
		{"fraktional", hunger, 6.1, 2},
		{"keine Regeneration", Bar{Max: 100}, 50, 0},
	}
	for _, tc := range tests {
		if got := TicksToFull(tc.bar, tc.current); got != tc.want {
			t.Errorf("%s: TicksToFull = %d, want %d", tc.name, got, tc.want)
		}
	}
}

// FullAt muss auf einem Tick landen, nicht auf einer krummen Uhrzeit — und der
// erste Tick zählt schon als Auffüllung.
func TestFullAt(t *testing.T) {
	base := clock(berlin, 11, 12)
	p := paramsAt(base, clock(berlin, 14, 5))
	health := Bar{Key: "health", Max: 140, HourlyRegen: 14}

	// 117.5 von 140: es fehlen 22.5, also zwei Ticks — 12:00 und 13:00.
	at, n, ok := FullAt(p, health, 117.5)
	if !ok || n != 2 {
		t.Fatalf("FullAt = (%v, %d, %v), want zwei Ticks", at, n, ok)
	}
	if want := clock(berlin, 13, 0); !at.Equal(want) {
		t.Errorf("FullAt = %s, want %s", at.Format("15:04"), want.Format("15:04"))
	}

	// Ein einzelner fehlender Tick ist mit dem nächsten Tick erledigt.
	at, n, ok = FullAt(p, health, 130)
	if !ok || n != 1 || !at.Equal(clock(berlin, 12, 0)) {
		t.Errorf("FullAt = (%s, %d, %v), want 12:00 und ein Tick", at.Format("15:04"), n, ok)
	}

	// Volle Leiste: kein Zeitpunkt.
	if _, _, ok := FullAt(p, health, 140); ok {
		t.Error("eine volle Leiste braucht keinen Auffüll-Zeitpunkt")
	}
}

// Compute muss den Auffüll-Zeitpunkt mitliefern, sobald ein Ist-Wert da ist.
func TestComputeFuelltFullAt(t *testing.T) {
	base := clock(berlin, 11, 12)
	p := paramsAt(base, clock(berlin, 14, 5))
	bars := []Bar{{Key: "health", Max: 140, HourlyRegen: 14}}

	// 80 von 140: Zielwert ist 98, der Ist-Wert liegt darunter — die Leiste
	// wird zur Zielzeit nicht voll, sondern erst um 16:00 (fünf Ticks).
	got := Compute(p, bars, map[string]float64{"health": 80}).Bars[0]
	if got.DeficitSafe != 18 {
		t.Errorf("DeficitSafe = %v, want 18", got.DeficitSafe)
	}
	if got.TicksToFull != 5 {
		t.Errorf("TicksToFull = %d, want 5", got.TicksToFull)
	}
	if want := clock(berlin, 16, 0); !got.FullAt.Equal(want) {
		t.Errorf("FullAt = %s, want %s", got.FullAt.Format("15:04"), want.Format("15:04"))
	}

	// Ohne Ist-Wert bleibt das Feld leer.
	if bare := Compute(p, bars, nil).Bars[0]; !bare.FullAt.IsZero() {
		t.Errorf("ohne Ist-Wert soll FullAt leer sein, ist %v", bare.FullAt)
	}
}
