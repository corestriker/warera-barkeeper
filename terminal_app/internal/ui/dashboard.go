package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"github.com/yourname/warera-barkeeper/terminal_app/internal/config"
	"github.com/yourname/warera-barkeeper/terminal_app/internal/i18n"
	"github.com/yourname/warera-barkeeper/terminal_app/internal/regen"
)

// viewDashboard rendert den Hauptscreen.
func (m Model) viewDashboard() string {
	w := m.contentWidth()
	st := buildState(m.cfg, m.snap, m.now)
	res := st.Compute(m.cfg)

	var b strings.Builder
	b.WriteString(m.renderHeader(st, w))
	b.WriteString("\n\n")

	for _, br := range res.Bars {
		b.WriteString(m.renderBar(br, w))
		b.WriteString("\n")
	}

	b.WriteString(m.renderLegend(res, w))
	b.WriteString("\n")

	if res.Hint != nil {
		b.WriteString(m.renderHint(res, w))
		b.WriteString("\n")
	}

	if s := m.statusLine(); s != "" {
		b.WriteString(s + "\n\n")
	}

	b.WriteString(m.footer(
		[2]string{"m", m.t("key.settings")},
		[2]string{"r", m.t("key.reload")},
		[2]string{"i", m.t("key.guide")},
		[2]string{"?", m.t("key.keys")},
		[2]string{"q", m.t("key.quit")},
	))
	return lipgloss.NewStyle().Padding(1, 1).Render(b.String())
}

func (m Model) renderHeader(st State, w int) string {
	loc := m.cfg.Location()
	target := st.Params.Target.In(loc)
	base := st.Params.Base.In(loc)

	// Der Countdown läuft immer gegen die echte Uhr, auch wenn mit einer
	// festen Basiszeit gerechnet wird — sonst stünde dort eine Zahl, die sich
	// nie ändert.
	remaining := target.Sub(m.now)

	basis := m.t("head.base_now")
	if m.cfg.BaseMode == config.BaseModeFixed {
		basis = m.t("head.base_fixed")
	}

	line1 := fmt.Sprintf("%s %s   %s %s   %s %s",
		styMuted.Render(m.t("head.target")), styTitle.Render(target.Format("15:04")),
		styMuted.Render(m.t("head.left")), styText.Render(fmtDuration(remaining)),
		styMuted.Render(m.t("head.base")), styText.Render(basis+" "+base.Format("15:04")),
	)

	nextTick := regen.TickAfter(st.Params, m.now).In(loc)
	line2 := fmt.Sprintf("%s %s %s   %s",
		styMuted.Render(m.t("head.next_tick")),
		styText.Render(nextTick.Format("15:04")),
		styMuted.Render(m.t("head.in", fmtDuration(nextTick.Sub(m.now)))),
		m.apiBadge(),
	)
	if target.Day() != base.Day() {
		line2 += styMuted.Render("   " + m.t("head.tomorrow"))
	}

	title := styTitle.Render(AppName)
	titleLen := len([]rune(AppName))
	if m.version != "" {
		title += styMuted.Render("  v" + m.version)
		titleLen += len([]rune("  v" + m.version))
	}

	lines := []string{title, line1, line2}

	// Der Spielername sagt, wessen Werte hier stehen — das gehört neben den
	// Namen der Anwendung, nicht in die Tick-Zeile. Rechts ausgerichtet,
	// solange Platz ist; sonst als eigene Zeile, damit ein langer Name nicht
	// mitten im Wort umbricht.
	if APIMode(m.cfg) {
		label := m.t("head.player") + " "
		who := styMuted.Render(label) + styText.Render(m.cfg.Username)
		if gap := w - 4 - titleLen - len([]rune(label+m.cfg.Username)); gap > 2 {
			lines[0] = title + strings.Repeat(" ", gap) + who
		} else {
			lines = []string{title, who, line1, line2}
		}
	}

	body := lipgloss.JoinVertical(lipgloss.Left, lines...)
	return styBox.Width(w).Render(body)
}

// legendEntry ist ein Eintrag der Balken-Legende: Musterzeichen, Bedeutung und
// die Farbe, mit der die Zone auch im Balken gezeichnet wird.
type legendEntry struct {
	glyph string
	label string
	style lipgloss.Style
}

// legendFor stellt die Legende aus den Zonen zusammen, die gerade zu sehen
// sind: ohne Ist-Wert gibt es kein „verbraucht", ohne Fehlbetrag kein „fehlt".
func legendFor(p i18n.Printer, res regen.Result) []legendEntry {
	entries := []legendEntry{
		{"███", p.T("legend.keep"), styKeep},
		{"░░░", p.T("legend.spendable"), stySafe},
	}

	var hasCurrent, hasDeficit bool
	for _, br := range res.Bars {
		if br.HasCurrent {
			hasCurrent = true
			if br.DeficitSafe > 0 {
				hasDeficit = true
			}
		}
	}
	if hasDeficit {
		entries = append(entries, legendEntry{"▒▒▒", p.T("legend.missing"), styErr})
	}
	if hasCurrent {
		entries = append(entries, legendEntry{"···", p.T("legend.used"), styBorder})
	}
	return entries
}

// renderLegend setzt die Legende in eine oder zwei Zeilen, je nach Breite.
func (m Model) renderLegend(res regen.Result, w int) string {
	const sep = "   "
	inner := w - 4

	var lines []string
	var row []string
	used := 0

	flush := func() {
		if len(row) > 0 {
			lines = append(lines, strings.Join(row, sep))
			row, used = nil, 0
		}
	}
	for _, e := range legendFor(m.p, res) {
		plain := len([]rune(e.glyph)) + 1 + len([]rune(e.label))
		if len(row) > 0 && used+len(sep)+plain > inner {
			flush()
		}
		if len(row) > 0 {
			used += len(sep)
		}
		used += plain
		row = append(row, e.style.Render(e.glyph)+" "+styMuted.Render(e.label))
	}
	flush()

	return lipgloss.NewStyle().Padding(0, 2).Render(
		lipgloss.JoinVertical(lipgloss.Left, lines...)) + "\n"
}

// renderBar zeichnet eine Leiste samt beiden Zählweisen.
func (m Model) renderBar(br regen.BarResult, w int) string {
	inner := w - 2

	// Mit Ist-Wert steht links im Kopf, was im Spiel steht — sonst nur das
	// Maximum, weil dann ohnehin „jetzt voll" angenommen wird.
	perTick := m.t("bar.per_tick", num(br.Bar.HourlyRegen))
	right := m.t("bar.max", num(br.Bar.Max)) + "   " + perTick
	if br.HasCurrent {
		right = num(br.Current) + " / " + num(br.Bar.Max) + "   " + perTick
	}
	head := lipgloss.JoinHorizontal(lipgloss.Left,
		styBarName.Render(br.Bar.Label),
		styMuted.Render(padLeft(right, inner-len([]rune(br.Bar.Label)))),
	)

	graph := m.renderGauge(br, inner)

	// Angezeigt wird nur die verlässliche Zählweise: ein Tick exakt auf der
	// Zielzeit bleibt außen vor, weil er eine Sekunde zu spät kommen kann.
	// Wer ihn mitnehmen will, verschiebt die Zielzeit — dafür gibt es den
	// Hinweis unter den Leisten.
	//
	// Ausgegeben werden darf nur, was über dem Zielwert liegt: mit Ist-Wert
	// ist das der Abstand von dort nach unten, ohne Ist-Wert das ganze
	// Regenerationsbudget.
	spend := br.Safe.Budget
	if br.HasCurrent {
		spend = br.LeftSafe
	}

	budget := fmt.Sprintf("%s %s   %s %s %s   %s",
		styMuted.Render(m.t("bar.spend")), stySafe.Render(num(spend)),
		styMuted.Render(m.t("bar.down_to")), styText.Render(num(br.Safe.Floor)),
		styMuted.Render("("+pct(br.Safe.FloorPct)+")"),
		styMuted.Render(m.t("bar.ticks", br.Safe.Ticks)),
	)
	if br.HasCurrent && br.DeficitSafe > 0 {
		// Der Ist-Wert liegt schon unter dem Zielwert: zur Zielzeit wird die
		// Leiste nicht voll. Dann ist die nützlichste Information, wann sie es
		// wird — nicht „0 ausgebbar".
		full := m.t("bar.later")
		if !br.FullAt.IsZero() {
			full = br.FullAt.In(m.cfg.Location()).Format("15:04")
		}
		budget = fmt.Sprintf("%s   %s %s   %s %s",
			styErr.Render(m.t("bar.not_full")),
			styMuted.Render(m.t("bar.full_at")), styHint.Render(full),
			styMuted.Render(m.t("bar.missing")), styText.Render(num(br.DeficitSafe)),
		)
	}

	lines := []string{head, graph, budget}

	if br.Safe.Capped {
		lines = append(lines, styMuted.Render(m.t("bar.capped")))
	}

	return lipgloss.NewStyle().Padding(0, 2).Render(
		lipgloss.JoinVertical(lipgloss.Left, lines...)) + "\n"
}

// renderGauge zeichnet die Leiste über die volle Breite von 0 bis Max.
//
// Ohne Ist-Wert sind es zwei Zonen: was stehen bleiben muss (grau) und was
// ausgegeben werden darf (grün). Mit Ist-Wert kommt eine dritte hinzu — was
// über dem Füllstand liegt, ist nicht mehr da und wird blass gezeichnet. Liegt
// der Füllstand schon unter dem Zielwert, markiert Rot, was bis zur Zielzeit
// fehlt.
func (m Model) renderGauge(br regen.BarResult, width int) string {
	if width < 10 || br.Bar.Max <= 0 {
		return ""
	}
	cells := width
	cell := func(v float64) int {
		n := int(clamp01(v/br.Bar.Max)*float64(cells) + 0.5)
		if n < 0 {
			return 0
		}
		if n > cells {
			return cells
		}
		return n
	}

	nFloor := cell(br.Safe.Floor)
	if !br.HasCurrent {
		return styKeep.Render(strings.Repeat("█", nFloor)) +
			stySafe.Render(strings.Repeat("░", cells-nFloor))
	}

	nCur := cell(br.Current)
	if nCur < nFloor {
		// Fehlbetrag: bis zum Zielwert reicht die Regeneration nicht mehr.
		return styKeep.Render(strings.Repeat("█", nCur)) +
			styErr.Render(strings.Repeat("▒", nFloor-nCur)) +
			styBorder.Render(strings.Repeat("·", cells-nFloor))
	}
	return styKeep.Render(strings.Repeat("█", nFloor)) +
		stySafe.Render(strings.Repeat("░", nCur-nFloor)) +
		styBorder.Render(strings.Repeat("·", cells-nCur))
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// renderHint erklärt, wie eine leicht verschobene Zielzeit einen weiteren Tick
// mitnimmt — der eigentliche Kniff am Regen in Stunden-Ticks.
func (m Model) renderHint(res regen.Result, w int) string {
	h := res.Hint
	loc := m.cfg.Location()

	var lead string
	if h.Kind == regen.HintOnTick {
		lead = m.t("hint.on_tick", h.Tick.In(loc).Format("15:04"))
	} else {
		lead = m.t("hint.near_tick", fmtDuration(h.Gap), h.Tick.In(loc).Format("15:04"))
	}

	var gains []string
	for _, br := range res.Bars {
		if extra := h.Extra[br.Bar.Key]; extra > 0 {
			gains = append(gains, fmt.Sprintf("%s +%s", br.Bar.Label, num(extra)))
		}
	}

	body := m.t("hint.body", lead, h.Suggested.In(loc).Format("15:04"), strings.Join(gains, ", "))

	lines := wrap(body, w-4)
	out := make([]string, 0, len(lines)+1)
	out = append(out, styHint.Render(m.t("hint.title")))
	for _, l := range lines {
		out = append(out, styText.Render(l))
	}
	return styHintBox.Width(w).Render(lipgloss.JoinVertical(lipgloss.Left, out...)) + "\n"
}
