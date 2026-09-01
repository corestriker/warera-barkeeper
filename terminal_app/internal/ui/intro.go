package ui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// introSettings sind die Message-IDs der Einstellungen, die das Intro
// aufzählt. Der Hilfetext heißt jeweils wie die ID plus ".help".
var introSettings = []string{
	"intro.set.username",
	"intro.set.target",
	"intro.set.base",
	"intro.set.max",
	"intro.set.language",
}

// viewIntro erklärt beim ersten Start, worum es geht.
func (m Model) viewIntro() string {
	w := m.contentWidth()

	var b strings.Builder
	b.WriteString(styTitle.Render(AppName))
	if m.version != "" {
		b.WriteString(styMuted.Render(" v" + m.version))
	}
	b.WriteString(styMuted.Render("   " + m.t("app.tagline")))
	b.WriteString("\n\n")

	for _, line := range wrap(m.t("intro.text"), w) {
		b.WriteString(styText.Render(line) + "\n")
	}
	b.WriteString("\n")
	b.WriteString(styTitle.Render(m.t("intro.settings_title")) + "\n")

	labelW := 0
	for _, id := range introSettings {
		if n := len([]rune(m.t(id))); n > labelW {
			labelW = n
		}
	}
	for _, id := range introSettings {
		desc := wrap(m.t(id+".help"), w-labelW-4)
		b.WriteString("  " + styKey.Render(pad(m.t(id), labelW)) + "  " + styMuted.Render(desc[0]) + "\n")
		for _, extra := range desc[1:] {
			b.WriteString("  " + strings.Repeat(" ", labelW) + "  " + styMuted.Render(extra) + "\n")
		}
	}
	b.WriteString("\n")

	if m.cfg.Username == "" {
		b.WriteString(styHint.Render(m.t("intro.no_username")) + "\n\n")
	}

	// Beim Erststart führt „weiter" direkt in die Einstellungen, deshalb sagt
	// die Fußzeile dort auch das und nicht bloß „weiter".
	next := [2]string{"enter", m.t("key.continue")}
	if m.firstRun {
		next = [2]string{"enter", m.t("key.settings")}
	}
	b.WriteString(m.footer(
		next,
		[2]string{"m", m.t("key.settings")},
		[2]string{"?", m.t("key.keys")},
		[2]string{"q", m.t("key.quit")},
	))
	return lipgloss.NewStyle().Padding(1, 1).Render(b.String())
}
