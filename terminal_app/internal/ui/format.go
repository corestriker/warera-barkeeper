package ui

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// num formatiert Leisten-Werte kompakt: ganze Zahlen ohne Nachkommastelle,
// gebrochene mit einer. Hunger regeneriert auf niedrigem Skill-Level 0.4 pro
// Tick — da wäre Runden auf ganze Zahlen irreführend.
func num(v float64) string {
	if math.Abs(v-math.Round(v)) < 1e-9 {
		return strconv.FormatFloat(math.Round(v), 'f', 0, 64)
	}
	return strconv.FormatFloat(v, 'f', 1, 64)
}

// pct formatiert einen Prozentwert ohne unnötige Nachkommastellen.
func pct(v float64) string {
	if math.Abs(v-math.Round(v)) < 1e-9 {
		return fmt.Sprintf("%d%%", int(math.Round(v)))
	}
	return fmt.Sprintf("%.1f%%", v)
}

// wrap bricht Text auf die angegebene Breite um.
func wrap(s string, width int) []string {
	if width < 10 {
		width = 10
	}
	var out []string
	for _, para := range strings.Split(s, "\n") {
		words := strings.Fields(para)
		if len(words) == 0 {
			out = append(out, "")
			continue
		}
		line := words[0]
		for _, w := range words[1:] {
			if len([]rune(line))+1+len([]rune(w)) > width {
				out = append(out, line)
				line = w
				continue
			}
			line += " " + w
		}
		out = append(out, line)
	}
	return out
}

// pad füllt einen String rechts auf n Zeichen auf.
func pad(s string, n int) string {
	d := n - len([]rune(s))
	if d <= 0 {
		return s
	}
	return s + strings.Repeat(" ", d)
}

// padLeft füllt einen String links auf n Zeichen auf.
func padLeft(s string, n int) string {
	d := n - len([]rune(s))
	if d <= 0 {
		return s
	}
	return strings.Repeat(" ", d) + s
}
