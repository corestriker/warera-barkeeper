// Package ui enthält die Terminal-Oberfläche auf Basis von bubbletea.
package ui

import (
	"context"
	"errors"
	"fmt"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/corestriker/warera-barkeeper/terminal_app/internal/config"
	"github.com/corestriker/warera-barkeeper/terminal_app/internal/i18n"
	"github.com/corestriker/warera-barkeeper/terminal_app/internal/warera"
)

type screen int

const (
	screenIntro screen = iota
	screenDashboard
	screenMenu
	screenHelp
)

type apiState int

const (
	apiIdle apiState = iota
	apiLoading
	apiOK
	apiFailed
	apiOff
)

const (
	minWidth = 56
	maxWidth = 96
)

// statusTTL ist die Lebensdauer einer Erfolgsmeldung. Fehler und Rückfragen
// bleiben dagegen stehen, bis der Nutzer etwas anderes tut.
const statusTTL = 8 * time.Second

// tickMsg treibt die Live-Anzeige an.
type tickMsg time.Time

// apiMsg ist das Ergebnis eines Abrufs.
type apiMsg struct {
	snap   warera.Snapshot
	userID string
	err    error
}

// Model ist das Wurzel-Model der Anwendung.
type Model struct {
	cfg     config.Config
	version string

	// p übersetzt die Oberfläche. Wird beim Sprachwechsel im Menü neu
	// gesetzt, damit die Anzeige sofort umschaltet.
	p i18n.Printer

	screen     screen
	prevScreen screen

	width, height int
	now           time.Time

	snap     *warera.Snapshot
	api      apiState
	fetchedA time.Time

	menu     menuModel
	status   string
	stErr    bool
	statusAt time.Time

	// firstRun führt den Erststart: erst Erklärung, dann direkt in die
	// Einstellungen. Ab dem zweiten Start steht sofort die Berechnung da.
	firstRun bool

	quitting bool
}

// New baut das Model. firstRun steuert, ob der Erklärscreen zuerst kommt.
func New(cfg config.Config, version string, firstRun bool) Model {
	m := Model{
		cfg:     cfg,
		version: version,
		p:       i18n.For(cfg.Language),
		now:     time.Now(),
		width:   80,
		screen:  screenDashboard,
	}
	if firstRun || cfg.ShowIntroOnStart {
		m.screen = screenIntro
	}
	m.firstRun = firstRun
	m.menu = newMenu()
	if !cfg.API.Enabled || cfg.Username == "" {
		m.api = apiOff
	}
	return m
}

// t übersetzt eine Message-ID in der eingestellten Sprache.
func (m Model) t(id string, args ...any) string { return m.p.T(id, args...) }

// Printer gibt den Übersetzer heraus, damit auch freie Funktionen übersetzen
// können.
func (m Model) Printer() i18n.Printer { return m.p }

// Init startet Uhr und ersten API-Abruf.
func (m Model) Init() tea.Cmd {
	return tea.Batch(tickCmd(), m.fetchCmd())
}

func tickCmd() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg { return tickMsg(t) })
}

// fetchCmd holt die Werte im Hintergrund. Das UI ist sofort da und wartet
// nicht auf das Netz.
func (m Model) fetchCmd() tea.Cmd {
	if !m.cfg.API.Enabled || m.cfg.Username == "" {
		return nil
	}
	cfg := m.cfg
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), cfg.Timeout())
		defer cancel()
		c := warera.New(cfg.API.BaseURL, cfg.Timeout())
		snap, id, err := c.Fetch(ctx, cfg.Username, cfg.UserID)
		return apiMsg{snap: snap, userID: id, err: err}
	}
}

// cacheValid sagt, ob ein erneuter Abruf nötig ist.
func (m Model) cacheValid() bool {
	if m.snap == nil || m.cfg.API.CacheMinutes <= 0 {
		return false
	}
	age := time.Since(m.fetchedA)
	return age < time.Duration(m.cfg.API.CacheMinutes)*time.Minute
}

// Update verarbeitet Nachrichten.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		return m, nil

	case tickMsg:
		m.now = time.Time(msg)
		m.expireStatus()
		return m, tickCmd()

	case apiMsg:
		return m.handleAPI(msg), nil

	case tea.KeyMsg:
		return m.handleKey(msg)
	}
	return m, nil
}

func (m Model) handleAPI(msg apiMsg) Model {
	// Die Statuszeile berichtet immer vom Ausgang der letzten Aktion — ohne
	// diesen Zweig bliebe „Werte werden abgerufen …" für immer stehen, und der
	// Grund eines fehlgeschlagenen Abrufs würde nie sichtbar.
	if msg.err != nil {
		m.api = apiFailed
		m.setStatus(m.t("status.fetch_failed", m.apiErrText(msg.err)), true)
		return m
	}
	m.api = apiOK
	m.snap = &msg.snap
	m.fetchedA = time.Now()
	m.setStatus(m.t("status.fetched", m.fetchedA.In(m.cfg.Location()).Format("15:04:05")), false)

	// Die aufgelöste userId wird gecacht, damit der nächste Start einen
	// Suchaufruf weniger braucht.
	if msg.userID != "" && msg.userID != m.cfg.UserID {
		m.cfg.UserID = msg.userID
	}
	// Die API-Werte bleiben, wo sie hingehören: im Snapshot. Früher wurden sie
	// in cfg.Bars gespiegelt — das hat die selbst eingetragenen Werte des
	// Nutzers überschrieben und beide Modi vermischt.
	m.menu.syncFromConfig()
	return m
}

func (m Model) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	// Im Menü frisst der Editor die Tasten, solange ein Feld bearbeitet wird.
	if m.screen == screenMenu {
		return m.updateMenu(msg)
	}

	switch msg.String() {
	case "ctrl+c", "q":
		m.quitting = true
		return m, tea.Quit

	case "esc", "enter", " ":
		if m.isOverlay() {
			return m.leaveOverlay(), nil
		}
		if msg.String() == "esc" {
			m.quitting = true
			return m, tea.Quit
		}
		return m, nil

	case "i":
		return m.toggleOverlay(screenIntro), nil

	case "?", "h":
		return m.toggleOverlay(screenHelp), nil

	case "m":
		m.menu.syncFromConfig()
		m.menu.cursor = 0
		m.screen = screenMenu
		return m, nil

	case "r":
		if !m.cfg.API.Enabled || m.cfg.Username == "" {
			m.setStatus(m.t("status.no_fetch"), true)
			return m, nil
		}
		m.api = apiLoading
		// Kein Text nötig: das Badge im Kopf zeigt „◌ lädt …". Die alte
		// Meldung muss aber weg, sie gehört zur vorigen Aktion.
		m.setStatus("", false)
		return m, m.fetchCmd()
	}
	return m, nil
}

// isOverlay sagt, ob gerade eine Textseite über dem Inhalt liegt: Erklärung
// oder Tastenhilfe. Beide verhalten sich gleich — aufschlagen und zurück.
func (m Model) isOverlay() bool {
	return m.screen == screenIntro || m.screen == screenHelp
}

// toggleOverlay schlägt eine Textseite auf oder wieder zu. Aus einer Seite
// heraus führt dieselbe Taste zurück, eine andere wechselt direkt hinüber.
func (m Model) toggleOverlay(target screen) Model {
	if m.screen == target {
		return m.leaveOverlay()
	}
	if !m.isOverlay() {
		m.prevScreen = m.screen
	}
	m.screen = target
	return m
}

// leaveOverlay verlässt Erklärung oder Tastenhilfe. Beim allerersten Start
// geht es von der Erklärung direkt in die Einstellungen — ohne Spielername und
// Zielzeit ist die Berechnung ohnehin nur geraten. Danach führt der Weg zurück
// dorthin, wo die Seite aufgerufen wurde.
func (m Model) leaveOverlay() Model {
	if m.firstRun {
		m.firstRun = false
		m.menu.syncFromConfig()
		m.menu.cursor = 0
		m.screen = screenMenu
		m.setStatus(m.t("status.first_run"), false)
		return m
	}
	m.screen = m.returnScreen()
	return m
}

// returnScreen ist der Screen, zu dem das Intro zurückkehrt — der, von dem aus
// die Hilfe aufgerufen wurde.
func (m Model) returnScreen() screen {
	if m.prevScreen == screenMenu {
		return screenMenu
	}
	return screenDashboard
}

// apiErrText übersetzt die Fehler, die den Nutzer betreffen. Technische
// Fehler (Netz, JSON, HTTP) bleiben im Originaltext — sie richten sich an
// jemanden, der etwas reparieren soll, nicht an den Spieler.
func (m Model) apiErrText(err error) string {
	switch {
	case errors.Is(err, warera.ErrNoUsername):
		return m.t("err.no_username")
	case errors.Is(err, warera.ErrNotFound):
		return m.t("err.no_player", m.cfg.Username)
	case errors.Is(err, warera.ErrAmbiguous):
		return m.t("err.ambiguous", m.cfg.Username)
	}
	return err.Error()
}

func (m *Model) setStatus(s string, isErr bool) {
	m.status, m.stErr, m.statusAt = s, isErr, time.Now()
}

// expireStatus räumt Erfolgsmeldungen nach statusTTL weg, damit unter den
// Leisten nicht dauerhaft eine Meldung von vor einer Stunde steht.
func (m *Model) expireStatus() {
	if m.status == "" || m.stErr || m.statusAt.IsZero() {
		return
	}
	if time.Since(m.statusAt) > statusTTL {
		m.status = ""
	}
}

// contentWidth ist die nutzbare Breite, begrenzt auf einen lesbaren Bereich.
func (m Model) contentWidth() int {
	w := m.width - 2
	if w < minWidth {
		w = minWidth
	}
	if w > maxWidth {
		w = maxWidth
	}
	return w
}

// View rendert den aktiven Screen.
func (m Model) View() string {
	if m.quitting {
		return ""
	}
	switch m.screen {
	case screenIntro:
		return m.viewIntro()
	case screenHelp:
		return m.viewHelp()
	case screenMenu:
		return m.viewMenu()
	default:
		return m.viewDashboard()
	}
}

// apiBadge zeigt kompakt, woher die Zahlen stammen. Der Spielername steht
// beschriftet im Kopf, hier wäre er doppelt.
func (m Model) apiBadge() string {
	switch m.api {
	case apiOK:
		return stySafe.Render(m.t("badge.api"))
	case apiLoading:
		return styMuted.Render(m.t("badge.loading"))
	case apiFailed:
		return styErr.Render(m.t("badge.offline"))
	default:
		return styMuted.Render(m.t("badge.manual"))
	}
}

func (m Model) footer(keys ...[2]string) string {
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, styKey.Render(k[0])+" "+styMuted.Render(k[1]))
	}
	return lipgloss.JoinHorizontal(lipgloss.Left, joinSep(parts, styMuted.Render("   "))...)
}

func joinSep(parts []string, sep string) []string {
	if len(parts) == 0 {
		return nil
	}
	out := make([]string, 0, len(parts)*2-1)
	for i, p := range parts {
		if i > 0 {
			out = append(out, sep)
		}
		out = append(out, p)
	}
	return out
}

// statusLine rendert die Rückmeldung unter dem Inhalt.
func (m Model) statusLine() string {
	if m.status == "" {
		return ""
	}
	if m.stErr {
		return styErr.Render(m.status)
	}
	return styMuted.Render(m.status)
}

// Config gibt die (womöglich im Menü geänderte) Config zurück.
func (m Model) Config() config.Config { return m.cfg }

func fmtDuration(d time.Duration) string {
	if d < 0 {
		d = 0
	}
	h := int(d.Hours())
	mn := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	if h > 0 {
		return fmt.Sprintf("%dh %02dm %02ds", h, mn, s)
	}
	if mn > 0 {
		return fmt.Sprintf("%dm %02ds", mn, s)
	}
	return fmt.Sprintf("%ds", s)
}
