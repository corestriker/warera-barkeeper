package ui

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/corestriker/warera-barkeeper/terminal_app/internal/config"
	"github.com/corestriker/warera-barkeeper/terminal_app/internal/i18n"
	"github.com/corestriker/warera-barkeeper/terminal_app/internal/regen"
)

type fieldKind int

const (
	fieldText fieldKind = iota
	fieldToggle
	fieldAction
)

// field beschreibt eine Zeile im Menü.
//
// get/set arbeiten direkt auf der Config; validate meldet Eingabefehler zurück,
// bevor etwas gespeichert wird. Dadurch bleibt die Config immer in einem
// Zustand, mit dem gerechnet werden kann.
type field struct {
	key  string
	kind fieldKind

	// sectionID gruppiert die Zeilen. Die Überschrift zeichnet das Menü
	// selbst, sobald sich die Sektion ändert — dadurch bleibt die Feldliste
	// eine flache Liste und die Cursor-Logik unberührt.
	sectionID string

	// labelID und helpID sind Message-IDs, nicht Text: die Sprache kann sich
	// zur Laufzeit ändern, aufgelöst wird deshalb erst beim Zeichnen.
	labelID string
	helpID  string

	get      func(i18n.Printer, *config.Config) string
	set      func(i18n.Printer, *config.Config, string) error
	toggle   func(*config.Config)
	action   string
	disabled func(*config.Config) bool
}

const (
	actionFetch = "fetch"
	actionSave  = "save"
	actionReset = "reset"
)

func parseFloat(p i18n.Printer, s string) (float64, error) {
	v, err := strconv.ParseFloat(strings.TrimSpace(strings.Replace(s, ",", ".", 1)), 64)
	if err != nil {
		return 0, errors.New(p.T("err.not_a_number", s))
	}
	return v, nil
}

func barField(key, labelID, helpID string, regenField bool) field {
	return field{
		key:       key,
		sectionID: "menu.s.manual",
		kind:      fieldText,
		labelID:   labelID,
		helpID:    helpID,
		// Mit Spielername und aktivem Abruf kommen Maximum und Regen-Rate aus
		// der API. Die Zeilen bleiben sichtbar, sind aber gesperrt: sonst
		// tippt man Werte ein, die nie benutzt werden.
		disabled: func(c *config.Config) bool { return APIMode(*c) },
		get: func(_ i18n.Printer, c *config.Config) string {
			b := c.Bars[key[:strings.Index(key, ".")]]
			if regenField {
				return num(b.HourlyRegen)
			}
			return num(b.Max)
		},
		set: func(p i18n.Printer, c *config.Config, s string) error {
			v, err := parseFloat(p, s)
			if err != nil {
				return err
			}
			if v <= 0 {
				return errors.New(p.T("err.gt_zero"))
			}
			name := key[:strings.Index(key, ".")]
			b := c.Bars[name]
			if regenField {
				b.HourlyRegen = v
			} else {
				b.Max = v
				// Die Regen-Rate hängt am Maximum (max/10). Wer das Maximum von
				// Hand ändert, will fast sicher auch die passende Rate.
				b.HourlyRegen = v / 10
			}
			c.Bars[name] = b
			return nil
		},
	}
}

// targetModes ist die Reihenfolge, in der der Schalter die Zielzeit-Quellen
// durchläuft.
var targetModes = []string{
	config.TargetModeClock,
	config.TargetModeDebuff,
	config.TargetModeDebuffHour,
}

func nextTargetMode(cur string) string {
	for i, mode := range targetModes {
		if mode == cur {
			return targetModes[(i+1)%len(targetModes)]
		}
	}
	// Unbekannter Wert verhält sich wie der Standard, also geht es von dort
	// aus weiter — nicht auf ihn zurück.
	return targetModes[1%len(targetModes)]
}

// onOff ist die Anzeige eines Schalters.
func onOff(p i18n.Printer, v bool) string {
	if v {
		return p.T("menu.v.on")
	}
	return p.T("menu.v.off")
}

// languageChoices sind die wählbaren Sprachwerte: erst „automatisch" (leerer
// Config-Wert), dann jede registrierte Sprache. Eine neue Sprachdatei taucht
// hier von selbst auf, ohne dass am Menü etwas zu ändern ist.
func languageChoices() []string {
	return append([]string{""}, i18n.Codes()...)
}

// languageField schaltet die Sprache durch. Angezeigt wird der Eigenname, bei
// „automatisch" zusätzlich die Sprache, die dabei herauskommt.
func languageField() field {
	return field{
		key: "language", sectionID: "menu.s.display", kind: fieldToggle,
		labelID: "menu.f.language", helpID: "menu.f.language.help",
		get: func(p i18n.Printer, c *config.Config) string {
			if c.Language == "" {
				return p.T("menu.v.auto", i18n.Name(i18n.Detect()))
			}
			return i18n.Name(c.Language)
		},
		toggle: func(c *config.Config) {
			choices := languageChoices()
			at := 0
			for i, code := range choices {
				if code == c.Language {
					at = i
					break
				}
			}
			c.Language = choices[(at+1)%len(choices)]
		},
	}
}

// menuFields ist die Liste der Menüzeilen in Anzeigereihenfolge. Gruppiert
// wird nach der Frage, wann eine Einstellung überhaupt gilt: die Zielzeit
// immer, der Abruf nur mit Spielername, die eigenen Werte nur ohne.
func menuFields() []field {
	return []field{
		{
			key: "target_mode", sectionID: "menu.s.target", kind: fieldToggle,
			labelID: "menu.f.target_mode", helpID: "menu.f.target_mode.help",
			get: func(p i18n.Printer, c *config.Config) string {
				switch c.TargetMode {
				case config.TargetModeDebuff:
					return p.T("menu.v.target_debuff")
				case config.TargetModeDebuffHour:
					return p.T("menu.v.target_debuff_hour")
				}
				return p.T("menu.v.target_clock")
			},
			toggle: func(c *config.Config) { c.TargetMode = nextTargetMode(c.TargetMode) },
		},
		{
			key: "target_time", sectionID: "menu.s.target", kind: fieldText,
			labelID: "menu.f.target_time", helpID: "menu.f.target_time.help",
			// Im Debuff-Modus ist die Uhrzeit der Rückfall, nicht die Regel —
			// editierbar bleibt sie deshalb.
			get: func(_ i18n.Printer, c *config.Config) string { return c.TargetTime },
			set: func(p i18n.Printer, c *config.Config, s string) error {
				// Der Fehler aus ParseClock ist technisch; die Meldung für den
				// Nutzer entsteht hier, in seiner Sprache.
				if _, _, err := regen.ParseClock(s); err != nil {
					return errors.New(p.T("err.clock"))
				}
				c.TargetTime = strings.TrimSpace(s)
				return nil
			},
		},
		{
			key: "base_mode", sectionID: "menu.s.target", kind: fieldToggle,
			labelID: "menu.f.base_mode", helpID: "menu.f.base_mode.help",
			get: func(p i18n.Printer, c *config.Config) string {
				if c.BaseMode == config.BaseModeFixed {
					return p.T("menu.v.fixed")
				}
				return p.T("menu.v.now")
			},
			toggle: func(c *config.Config) {
				if c.BaseMode == config.BaseModeFixed {
					c.BaseMode = config.BaseModeNow
				} else {
					c.BaseMode = config.BaseModeFixed
				}
			},
		},
		{
			key: "base_time", sectionID: "menu.s.target", kind: fieldText,
			labelID: "menu.f.base_time", helpID: "menu.f.base_time.help",
			disabled: func(c *config.Config) bool { return c.BaseMode != config.BaseModeFixed },
			get:      func(_ i18n.Printer, c *config.Config) string { return c.BaseTime },
			set: func(p i18n.Printer, c *config.Config, s string) error {
				if _, _, err := regen.ParseClock(s); err != nil {
					return errors.New(p.T("err.clock"))
				}
				c.BaseTime = strings.TrimSpace(s)
				return nil
			},
		},
		{
			key: "timezone", sectionID: "menu.s.target", kind: fieldText,
			labelID: "menu.f.timezone", helpID: "menu.f.timezone.help",
			get: func(p i18n.Printer, c *config.Config) string {
				if c.Timezone == "" {
					name, _ := time.Now().In(c.Location()).Zone()
					return p.T("menu.v.system", name)
				}
				return c.Timezone
			},
			set: func(p i18n.Printer, c *config.Config, s string) error {
				s = strings.TrimSpace(s)
				if s == "" {
					c.Timezone = ""
					return nil
				}
				probe := config.Config{Timezone: s}
				if probe.Location().String() != s {
					return errors.New(p.T("err.timezone", s))
				}
				c.Timezone = s
				return nil
			},
		},
		{
			key: "api_enabled", sectionID: "menu.s.api", kind: fieldToggle,
			labelID: "menu.f.api", helpID: "menu.f.api.help",
			get: func(p i18n.Printer, c *config.Config) string {
				return onOff(p, c.API.Enabled)
			},
			toggle: func(c *config.Config) { c.API.Enabled = !c.API.Enabled },
		},

		{
			key: "username", sectionID: "menu.s.api", kind: fieldText,
			labelID: "menu.f.username", helpID: "menu.f.username.help",
			get: func(_ i18n.Printer, c *config.Config) string { return c.Username },
			set: func(_ i18n.Printer, c *config.Config, s string) error {
				s = strings.TrimSpace(s)
				if s != c.Username {
					// Anderer Name, andere ID — den Cache verwerfen.
					c.UserID = ""
				}
				c.Username = s
				return nil
			},
		},
		{
			key: "fetch", sectionID: "menu.s.api", kind: fieldAction,
			labelID: "menu.f.fetch", helpID: "menu.f.fetch.help", action: actionFetch,
			disabled: func(c *config.Config) bool { return !APIMode(*c) },
		},
		barField("health.max", "menu.f.health_max", "menu.help.manual", false),
		barField("health.regen", "menu.f.health_regen", "menu.help.regen", true),
		barField("hunger.max", "menu.f.hunger_max", "menu.help.manual", false),
		barField("hunger.regen", "menu.f.hunger_regen", "menu.help.regen", true),
		languageField(),
		{
			key: "hint_window", sectionID: "menu.s.display", kind: fieldText,
			labelID: "menu.f.hint_window", helpID: "menu.f.hint_window.help",
			get: func(_ i18n.Printer, c *config.Config) string {
				return strconv.Itoa(c.HintWindowMinutes)
			},
			set: func(p i18n.Printer, c *config.Config, s string) error {
				v, err := strconv.Atoi(strings.TrimSpace(s))
				if err != nil || v < 0 || v > 59 {
					return errors.New(p.T("err.minutes"))
				}
				c.HintWindowMinutes = v
				return nil
			},
		},
		{
			key: "show_intro", sectionID: "menu.s.display", kind: fieldToggle,
			labelID: "menu.f.show_intro", helpID: "menu.f.show_intro.help",
			get: func(p i18n.Printer, c *config.Config) string {
				return onOff(p, c.ShowIntroOnStart)
			},
			toggle: func(c *config.Config) { c.ShowIntroOnStart = !c.ShowIntroOnStart },
		},
		{
			key: "save", sectionID: "menu.s.config", kind: fieldAction,
			labelID: "menu.f.save", helpID: "menu.f.save.help", action: actionSave,
		},
		{
			key: "reset", sectionID: "menu.s.config", kind: fieldAction,
			labelID: "menu.f.reset", helpID: "menu.f.reset.help",
			action: actionReset,
		},
	}
}

// menuModel hält den Zustand des Einstellungsmenüs. Die Config wird bewusst
// nicht als Zeiger festgehalten: bubbletea kopiert das Model bei jedem Update,
// ein gemerkter Zeiger würde auf eine veraltete Kopie zeigen.
type menuModel struct {
	fields  []field
	cursor  int
	editing bool
	input   textinput.Model
	err     string

	// confirm hält die Aktion, die auf ihre Bestätigung wartet. Löschen ist
	// ein Tastendruck weit weg, deshalb braucht es zwei.
	confirm string
}

func newMenu() menuModel {
	ti := textinput.New()
	ti.Prompt = ""
	ti.CharLimit = 64
	return menuModel{fields: menuFields(), input: ti}
}

// syncFromConfig bricht eine laufende Bearbeitung ab, damit ein Hintergrund-
// Abruf keinen halb getippten Wert überschreibt.
func (mm *menuModel) syncFromConfig() {
	mm.editing = false
	mm.input.Blur()
	mm.confirm = ""
}

func (mm menuModel) current() field { return mm.fields[mm.cursor] }

// focus stellt den Cursor auf eine Zeile. Gibt es sie nicht, bleibt er stehen.
func (mm *menuModel) focus(key string) {
	for i, f := range mm.fields {
		if f.key == key {
			mm.cursor = i
			return
		}
	}
}

// moveCursor springt über deaktivierte Zeilen hinweg.
func (mm *menuModel) moveCursor(cfg *config.Config, delta int) {
	n := len(mm.fields)
	// Ein Cursorwechsel verwirft eine offene Bestätigung: was bestätigt wird,
	// soll immer die Zeile sein, auf der der Cursor steht.
	mm.confirm = ""
	for i := 0; i < n; i++ {
		mm.cursor = (mm.cursor + delta + n) % n
		f := mm.fields[mm.cursor]
		if f.disabled == nil || !f.disabled(cfg) {
			return
		}
	}
}

func (m Model) updateMenu(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	mm := &m.menu

	if mm.editing {
		switch msg.String() {
		case "esc":
			mm.editing = false
			mm.err = ""
			mm.input.Blur()
			return m, nil
		case "enter":
			f := mm.current()
			if err := f.set(m.p, &m.cfg, mm.input.Value()); err != nil {
				mm.err = err.Error()
				return m, nil
			}
			m.cfg.Normalize()
			mm.editing = false
			mm.err = ""
			mm.input.Blur()
			m.setStatus(m.t("status.changed"), false)
			return m, nil
		}
		var cmd tea.Cmd
		mm.input, cmd = mm.input.Update(msg)
		return m, cmd
	}

	switch msg.String() {
	case "ctrl+c":
		m.quitting = true
		return m, tea.Quit

	case "esc", "m", "q":
		if mm.confirm != "" && msg.String() == "esc" {
			mm.confirm = ""
			m.setStatus(m.t("status.cancelled"), false)
			return m, nil
		}
		mm.confirm = ""
		m.screen = screenDashboard
		mm.err = ""
		return m, nil

	case "up", "k":
		mm.moveCursor(&m.cfg, -1)
		return m, nil

	case "down", "j":
		mm.moveCursor(&m.cfg, 1)
		return m, nil

	case "i":
		return m.toggleOverlay(screenIntro), nil

	case "?", "h":
		return m.toggleOverlay(screenHelp), nil

	case "enter", " ", "right", "l":
		return m.activate()
	}
	return m, nil
}

// activate führt die Zeile unter dem Cursor aus.
func (m Model) activate() (tea.Model, tea.Cmd) {
	mm := &m.menu
	f := mm.current()
	if f.disabled != nil && f.disabled(&m.cfg) {
		return m, nil
	}

	switch f.kind {
	case fieldToggle:
		f.toggle(&m.cfg)
		m.cfg.Normalize()
		// Der Sprachschalter wirkt sofort: der Printer wird neu aufgelöst,
		// bevor die Statuszeile geschrieben wird — sonst stünde die Meldung
		// noch in der alten Sprache.
		m.p = i18n.For(m.cfg.Language)
		m.setStatus(m.t("status.changed"), false)
		return m, nil

	case fieldText:
		mm.editing = true
		mm.err = ""
		mm.input.SetValue(rawValue(m.p, f, &m.cfg))
		mm.input.CursorEnd()
		mm.input.Focus()
		return m, nil

	case fieldAction:
		switch f.action {
		case actionFetch:
			mm.confirm = ""
			m.api = apiLoading
			m.setStatus("", false)
			return m, m.fetchCmd()
		case actionSave:
			mm.confirm = ""
			if err := m.cfg.Save(); err != nil {
				m.setStatus(err.Error(), true)
				return m, nil
			}
			m.setStatus(m.t("status.saved", m.cfg.Path()), false)
			return m, nil

		case actionReset:
			if mm.confirm != actionReset {
				mm.confirm = actionReset
				m.setStatus(m.t("status.confirm_reset"), true)
				return m, nil
			}
			return m.resetConfig(), nil
		}
	}
	return m, nil
}

// resetConfig löscht die Config-Datei und setzt alle Werte auf Standard
// zurück. Der Pfad bleibt erhalten, damit „Speichern" danach wieder dorthin
// schreibt; ohne Datei zeigt der nächste Start wieder die Erklärung.
func (m Model) resetConfig() Model {
	mm := &m.menu
	mm.confirm = ""

	path := m.cfg.Path()
	if err := m.cfg.Delete(); err != nil {
		m.setStatus(err.Error(), true)
		return m
	}

	m.cfg = config.Default()
	m.cfg.SetPath(path)

	// Ohne Spielername gibt es nichts abzurufen, und die alten API-Werte
	// gehören nicht mehr zu dieser Config.
	m.snap = nil
	m.api = apiOff
	mm.cursor = 0
	mm.err = ""
	// Auch die Sprache steht danach auf Standard, der Printer muss mit.
	m.p = i18n.For(m.cfg.Language)
	m.setStatus(m.t("status.reset"), false)
	return m
}

// debuffDrivesTarget sagt, ob gerade ein laufender Pillen-Debuff die Zielzeit
// bestimmt — dann ist die eingetragene Uhrzeit nur der Rückfall.
func (m Model) debuffDrivesTarget() bool {
	return m.cfg.TargetMode != config.TargetModeClock &&
		!debuffEnd(m.snap, m.now).IsZero()
}

// apiBarValue liefert zu einer Leisten-Zeile („health.max") den Wert aus dem
// letzten Abruf. ok ist false, wenn es keinen gibt — dann ist der Abruf noch
// unterwegs oder fehlgeschlagen.
func (m Model) apiBarValue(key string) (string, bool) {
	name, part, found := strings.Cut(key, ".")
	if !found {
		return "", false
	}
	sk, ok := skillFor(m.snap, name)
	if !ok || sk.Total <= 0 {
		return "", false
	}
	if part == "regen" {
		return num(sk.HourlyBarRegen), true
	}
	return num(sk.Total), true
}

// rawValue liefert den editierbaren Rohwert. Die Zeitzone zeigt im Menü
// „(System: …)“ an; das soll beim Bearbeiten nicht im Eingabefeld landen.
func rawValue(p i18n.Printer, f field, c *config.Config) string {
	if f.key == "timezone" {
		return c.Timezone
	}
	return f.get(p, c)
}

func (m Model) viewMenu() string {
	w := m.contentWidth()
	mm := m.menu
	cfg := m.cfg

	labelW := 0
	for _, f := range mm.fields {
		if n := len([]rune(m.t(f.labelID))); n > labelW {
			labelW = n
		}
	}

	// Erst alle Zeilen bauen, dann zuschneiden: mit Abschnitten ist das Menü
	// länger als ein kleines Terminal, und die Cursor-Zeile muss sichtbar
	// bleiben.
	var rows []string
	cursorRow := 0
	section := ""

	for i, f := range mm.fields {
		if f.sectionID != section {
			section = f.sectionID
			if len(rows) > 0 {
				rows = append(rows, "")
			}
			rows = append(rows, m.sectionTitle(f.sectionID))
		}

		disabled := f.disabled != nil && f.disabled(&cfg)
		cursor := "  "
		if i == mm.cursor {
			cursor = stySel.Render("▸ ")
		}

		label := pad(m.t(f.labelID), labelW)
		switch {
		case disabled:
			label = styMuted.Render(label)
		case i == mm.cursor:
			label = stySel.Render(label)
		default:
			label = styText.Render(label)
		}

		var value string
		switch {
		case mm.editing && i == mm.cursor:
			value = styEdit.Render(mm.input.View())
		case f.kind == fieldAction && mm.confirm == f.action && f.action != "":
			value = styErr.Render(m.t("menu.v.confirm"))
		case f.kind == fieldAction && disabled:
			value = styMuted.Render("—")
		case f.kind == fieldAction:
			value = styMuted.Render("↵")
		case disabled:
			// Gesperrte Leisten-Zeilen zeigen den Wert, mit dem tatsächlich
			// gerechnet wird — sonst stünde hier eine Zahl, die gerade nicht
			// gilt, und der Nutzer hielte sie für die aktive.
			if v, ok := m.apiBarValue(f.key); ok {
				value = styMuted.Render(v + "   " + m.t("menu.v.from_api"))
			} else {
				value = styMuted.Render(f.get(m.p, &cfg) + "   " + m.t("menu.v.unused"))
			}
		default:
			value = styText.Render(f.get(m.p, &cfg))
			// Solange ein Debuff die Zielzeit setzt, ist die eingetragene
			// Uhrzeit nur der Rückfall — sonst hielte man sie für die aktive.
			if f.key == "target_time" && m.debuffDrivesTarget() {
				value += styMuted.Render("   " + m.t("menu.v.fallback"))
			}
		}

		if i == mm.cursor {
			cursorRow = len(rows)
		}
		rows = append(rows, cursor+label+"  "+value)

		if i == mm.cursor && f.helpID != "" {
			indent := "    " + strings.Repeat(" ", labelW)
			for _, line := range wrap(m.t(f.helpID), w-len([]rune(indent))) {
				rows = append(rows, indent+styMuted.Render(line))
			}
		}
	}

	var b strings.Builder
	b.WriteString(styTitle.Render(m.t("menu.title")))
	b.WriteString(styMuted.Render("   " + cfg.Path()))
	b.WriteString("\n\n")
	b.WriteString(strings.Join(m.windowRows(rows, cursorRow), "\n"))
	b.WriteString("\n\n")

	if mm.err != "" {
		b.WriteString(styErr.Render(mm.err) + "\n\n")
	} else if s := m.statusLine(); s != "" {
		b.WriteString(s + "\n\n")
	}

	if mm.editing {
		b.WriteString(m.footer(
			[2]string{"↵", m.t("key.apply")},
			[2]string{"esc", m.t("key.cancel")},
		))
	} else {
		b.WriteString(m.footer(
			[2]string{"↑↓", m.t("key.select")},
			[2]string{"↵", m.t("key.change")},
			[2]string{"esc", m.t("key.back")},
			[2]string{"i", m.t("key.guide")},
			[2]string{"?", m.t("key.keys")},
		))
	}
	return lipgloss.NewStyle().Padding(1, 1).Render(b.String())
}

// sectionTitle ist die Überschrift eines Abschnitts. Die eigenen Werte tragen
// einen Vermerk, wenn gerade der Abruf gilt — sonst stellt man dort Zahlen
// ein, die niemand benutzt.
func (m Model) sectionTitle(id string) string {
	title := styTitle.Render(m.t(id))
	switch {
	case id == "menu.s.manual" && APIMode(m.cfg):
		return title + styMuted.Render("   "+m.t("menu.s.manual.unused"))
	case id == "menu.s.api" && !APIMode(m.cfg):
		return title + styMuted.Render("   "+m.t("menu.s.api.off"))
	}
	return title
}

// windowRows schneidet die Zeilenliste auf die Terminalhöhe zu und hält die
// Cursor-Zeile im Bild. Ist die Höhe unbekannt (Tests, Pipes), bleibt alles
// stehen.
func (m Model) windowRows(rows []string, cursor int) []string {
	// Kopf, Statuszeile, Fußzeile und Rahmen brauchen ebenfalls Platz.
	const chrome = 8
	limit := m.height - chrome
	if m.height <= 0 || limit >= len(rows) || limit < 4 {
		return rows
	}

	start := cursor - limit/2
	if start < 0 {
		start = 0
	}
	if start+limit > len(rows) {
		start = len(rows) - limit
	}

	out := make([]string, 0, limit)
	if start > 0 {
		out = append(out, styMuted.Render(m.t("menu.more_above", start)))
	}
	end := start + limit
	if rest := len(rows) - end; rest > 0 {
		end--
	}
	out = append(out, rows[start:end]...)
	if rest := len(rows) - end; rest > 0 {
		out = append(out, styMuted.Render(m.t("menu.more_below", rest)))
	}
	return out
}
