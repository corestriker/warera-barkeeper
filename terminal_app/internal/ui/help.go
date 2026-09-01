package ui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// helpGroup ist ein Block der Tastenhilfe: Überschrift und Tastenpaare als
// Message-IDs.
type helpGroup struct {
	title string
	keys  [][2]string
}

var helpGroups = []helpGroup{
	{"help.group.everywhere", [][2]string{
		{"m", "help.k.menu"},
		{"r", "help.k.reload"},
		{"i", "help.k.guide"},
		{"? h", "help.k.keys"},
		{"q", "help.k.quit"},
	}},
	{"help.group.settings", [][2]string{
		{"↑ ↓", "help.k.updown"},
		{"↵", "help.k.enter"},
		{"esc", "help.k.esc"},
	}},
}

// viewHelp listet Tastenbelegung, Balken-Legende und wo die Werte herkommen.
func (m Model) viewHelp() string {
	w := m.contentWidth()

	labelW := 0
	for _, g := range helpGroups {
		for _, k := range g.keys {
			if n := len([]rune(k[0])); n > labelW {
				labelW = n
			}
		}
	}

	var b strings.Builder
	b.WriteString(styTitle.Render(m.t("help.title")))
	b.WriteString(styMuted.Render("   " + AppName + " v" + m.version))
	b.WriteString("\n\n")

	for _, g := range helpGroups {
		b.WriteString(styTitle.Render(m.t(g.title)) + "\n")
		for _, k := range g.keys {
			b.WriteString("  " + styKey.Render(padLeft(k[0], labelW)) + "  " +
				styMuted.Render(m.t(k[1])) + "\n")
		}
		b.WriteString("\n")
	}

	// Die Legende des Balkens: dieselben Zeichen wie im Dashboard, hier mit
	// Platz für den ganzen Satz.
	b.WriteString(styTitle.Render(m.t("help.bar.title")) + "\n")
	b.WriteString("  " + styMuted.Render(m.t("help.bar.range")) + "\n")
	for _, e := range []legendEntry{
		{"███", m.t("help.bar.keep"), styKeep},
		{"░░░", m.t("help.bar.spend"), stySafe},
		{"▒▒▒", m.t("help.bar.missing"), styErr},
		{"···", m.t("help.bar.used"), styBorder},
	} {
		b.WriteString("  " + e.style.Render(e.glyph) + "  " + styMuted.Render(e.label) + "\n")
	}
	b.WriteString("\n")

	// Woher die Zahlen kommen, steht im Kopf nur als Badge — hier
	// ausgeschrieben, inklusive gecachter userId und Zeitpunkt des Abrufs.
	//
	// Eigene Spaltenbreite: die Wörter hier sind länger als die Tastennamen
	// oben, mit labelW stünden sie schief.
	const infoW = 6
	b.WriteString(styTitle.Render(m.t("help.values.title")) + "\n")
	if APIMode(m.cfg) {
		b.WriteString("  " + styKey.Render(pad(m.t("help.values.source"), infoW)) + "  " +
			styMuted.Render(m.t("help.values.api", m.cfg.Username)) + "\n")
		if m.cfg.UserID != "" {
			b.WriteString("  " + styKey.Render(pad(m.t("help.values.userid"), infoW)) + "  " +
				styMuted.Render(m.cfg.UserID) + "\n")
		}
		abruf := m.t("help.values.none")
		if !m.fetchedA.IsZero() {
			abruf = m.fetchedA.In(m.cfg.Location()).Format("15:04:05")
		}
		b.WriteString("  " + styKey.Render(pad(m.t("help.values.fetch"), infoW)) + "  " +
			styMuted.Render(abruf) + "\n")
	} else {
		b.WriteString("  " + styKey.Render(pad(m.t("help.values.source"), infoW)) + "  " +
			styMuted.Render(m.t("help.values.manual")) + "\n")
	}
	b.WriteString("\n")

	// Der Pfad steht hier, weil die Config auch von Hand editierbar ist und
	// man sie sonst suchen müsste.
	b.WriteString(styTitle.Render(m.t("help.config.title")) + "\n")
	for _, line := range wrap(m.cfg.Path(), w-2) {
		b.WriteString("  " + styText.Render(line) + "\n")
	}
	b.WriteString("  " + styMuted.Render(m.t("help.config.note")) + "\n\n")

	b.WriteString(m.footer(
		[2]string{"esc", m.t("key.back")},
		[2]string{"i", m.t("key.guide")},
		[2]string{"q", m.t("key.quit")},
	))
	return lipgloss.NewStyle().Padding(1, 1).Render(b.String())
}
