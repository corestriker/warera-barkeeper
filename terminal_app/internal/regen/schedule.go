package regen

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// ParseClock liest eine Uhrzeit im Format "HH:MM".
func ParseClock(s string) (hour, minute int, err error) {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("time %q: expected format HH:MM", s)
	}
	hour, err = strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || hour < 0 || hour > 23 {
		return 0, 0, fmt.Errorf("time %q: hour must be between 0 and 23", s)
	}
	minute, err = strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil || minute < 0 || minute > 59 {
		return 0, 0, fmt.Errorf("time %q: minute must be between 0 and 59", s)
	}
	return hour, minute, nil
}

// AtClock legt eine Uhrzeit auf denselben Kalendertag wie ref (in dessen Zone).
func AtClock(ref time.Time, hour, minute int) time.Time {
	y, m, d := ref.Date()
	return time.Date(y, m, d, hour, minute, 0, 0, ref.Location())
}

// NextOccurrence liefert das nächste Auftreten von hour:minute nach base.
// Liegt die Uhrzeit heute schon hinter base, wird auf morgen gerollt.
//
// Der Tageswechsel läuft über AddDate, damit über eine Zeitumstellung hinweg
// die Wanduhrzeit erhalten bleibt: 14:05 bleibt 14:05, auch wenn der Tag 23
// oder 25 Stunden hat.
func NextOccurrence(base time.Time, hour, minute int) time.Time {
	t := AtClock(base, hour, minute)
	if !t.After(base) {
		t = AtClock(base.AddDate(0, 0, 1), hour, minute)
	}
	return t
}

// NextWholeHourUTC ist der Fallback-Tick-Anchor, wenn die API nicht erreichbar
// ist: WarEra tickt zur vollen Stunde UTC.
func NextWholeHourUTC(now time.Time) time.Time {
	u := now.UTC()
	return time.Date(u.Year(), u.Month(), u.Day(), u.Hour(), 0, 0, 0, time.UTC).Add(time.Hour)
}
