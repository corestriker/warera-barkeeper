package ui

import "github.com/charmbracelet/lipgloss"

// AppName ist der Anzeigename. Das Binary und das Config-Verzeichnis heißen
// weiterhin schlicht "barkeeper" — Pfade sollen sich nicht ändern.
const AppName = "War Era - Barkeeper"

// Tagline steht in der Kopfzeile hinter dem Namen: sachlich, was gerechnet
// wird, nicht was der Nutzer davon hat.
const Tagline = "Health- und Hunger-Rechner"

// Die Farben stammen aus dem Stylesheet von app.warera.io, damit sich das Tool
// neben dem Spiel nicht fremd anfühlt: dunkles Schiefer-Anthrazit als Grund
// (#161A1D), gedecktes Blaugrau für Ränder und Nebentext, Rot als Akzent.
//
// Gehalten als AdaptiveColor, weil das Terminal-Hintergrundbild nicht uns
// gehört: Dark sind die Originalwerte, Light deren abgedunkelte Entsprechung,
// damit die Anzeige auch auf einem hellen Terminal lesbar bleibt.
var (
	colAccent = lipgloss.AdaptiveColor{Light: "#A32A2C", Dark: "#DA6E70"} // WarEra-Rot
	colSafe   = lipgloss.AdaptiveColor{Light: "#1F7A50", Dark: "#8FD3A8"}
	colHint   = lipgloss.AdaptiveColor{Light: "#A65A12", Dark: "#F0A055"}
	colDanger = lipgloss.AdaptiveColor{Light: "#9E2224", Dark: "#D64F51"}
	colMuted  = lipgloss.AdaptiveColor{Light: "#566E78", Dark: "#83A3AF"}
	colText   = lipgloss.AdaptiveColor{Light: "#101A1D", Dark: "#D0DDE1"}
	colBorder = lipgloss.AdaptiveColor{Light: "#9EB2B9", Dark: "#28383E"}
	colKeep   = lipgloss.AdaptiveColor{Light: "#A8BAC1", Dark: "#2D3F46"}
)

var (
	styTitle  = lipgloss.NewStyle().Bold(true).Foreground(colAccent)
	styText   = lipgloss.NewStyle().Foreground(colText)
	styMuted  = lipgloss.NewStyle().Foreground(colMuted)
	stySafe   = lipgloss.NewStyle().Bold(true).Foreground(colSafe)
	styHint   = lipgloss.NewStyle().Bold(true).Foreground(colHint)
	styErr    = lipgloss.NewStyle().Foreground(colDanger)
	styKeep   = lipgloss.NewStyle().Foreground(colKeep)
	styBorder = lipgloss.NewStyle().Foreground(colBorder)

	styBarName = lipgloss.NewStyle().Bold(true).Foreground(colText)

	styBox = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(colBorder).
		Padding(0, 1)

	styHintBox = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(colHint).
			Padding(0, 1)

	styKey  = lipgloss.NewStyle().Bold(true).Foreground(colAccent)
	stySel  = lipgloss.NewStyle().Bold(true).Foreground(colAccent)
	styEdit = lipgloss.NewStyle().Foreground(colHint)
)
