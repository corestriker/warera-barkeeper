package ui

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/yourname/warera-barkeeper/terminal_app/internal/config"
	"github.com/yourname/warera-barkeeper/terminal_app/internal/i18n"
	"github.com/yourname/warera-barkeeper/terminal_app/internal/regen"
	"github.com/yourname/warera-barkeeper/terminal_app/internal/warera"
)

// testCfg ist die Standard-Config mit festgelegter Sprache: die Tests prüfen
// deutsche Texte, und die Sprache soll nicht von $LANG des Rechners abhängen,
// auf dem die Tests laufen.
func testCfg() config.Config {
	cfg := config.Default()
	cfg.Language = "de"
	return cfg
}

func press(m Model, key tea.KeyMsg) Model {
	next, _ := m.Update(key)
	return next.(Model)
}

func typeKey(m Model, r rune) Model {
	return press(m, tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{r}})
}

var (
	enter = tea.KeyMsg{Type: tea.KeyEnter}
	esc   = tea.KeyMsg{Type: tea.KeyEsc}
)

// Beim allerersten Start soll die Erklärung kommen und danach direkt die
// Einstellungen — ohne Spielername und Zielzeit wäre die Berechnung geraten.
func TestErststartFuehrtVonIntroInsMenu(t *testing.T) {
	m := New(testCfg(), "0.1.0", true)
	if m.screen != screenIntro {
		t.Fatalf("Erststart soll mit dem Intro beginnen, ist aber %v", m.screen)
	}

	m = press(m, enter)
	if m.screen != screenMenu {
		t.Fatalf("nach dem Intro sollen die Einstellungen kommen, ist aber %v", m.screen)
	}
	if m.firstRun {
		t.Error("firstRun soll nach dem ersten Verlassen des Intros zurückgesetzt sein")
	}

	// Ab hier führt die Erklärung nicht mehr ins Menü, sondern zurück
	// dorthin, von wo sie aufgerufen wurde.
	if m = typeKey(m, 'i'); m.screen != screenIntro {
		t.Fatalf("i soll die Erklärung öffnen, ist aber %v", m.screen)
	}
	if m = press(m, enter); m.screen != screenMenu {
		t.Fatalf("Erklärung soll zum Menü zurückkehren, ist aber %v", m.screen)
	}
}

// i und ? sind zwei verschiedene Seiten und beide von überall erreichbar.
func TestErklaerungUndTastenhilfe(t *testing.T) {
	m := New(testCfg(), "0.1.0", false)

	if m = typeKey(m, 'i'); m.screen != screenIntro {
		t.Fatalf("i vom Dashboard soll die Erklärung öffnen, ist aber %v", m.screen)
	}
	// Dieselbe Taste schließt wieder.
	if m = typeKey(m, 'i'); m.screen != screenDashboard {
		t.Fatalf("i soll die Erklärung wieder schließen, ist aber %v", m.screen)
	}

	if m = typeKey(m, '?'); m.screen != screenHelp {
		t.Fatalf("? soll die Tastenhilfe öffnen, ist aber %v", m.screen)
	}
	// Aus der einen Seite direkt in die andere.
	if m = typeKey(m, 'i'); m.screen != screenIntro {
		t.Fatalf("i soll von der Tastenhilfe zur Erklärung wechseln, ist aber %v", m.screen)
	}
	if m = press(m, esc); m.screen != screenDashboard {
		t.Fatalf("esc soll zum Dashboard zurückführen, ist aber %v", m.screen)
	}

	if m = typeKey(m, 'h'); m.screen != screenHelp {
		t.Fatalf("h soll die Tastenhilfe öffnen, ist aber %v", m.screen)
	}
}

// Löschen braucht zwei Tastendrücke, und esc dazwischen bricht es ab.
func TestConfigLoeschenBrauchtBestaetigung(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.toml")

	cfg := testCfg()
	cfg.Username = "Beispiel"
	cfg.SetPath(path)
	if err := cfg.Save(); err != nil {
		t.Fatalf("Config anlegen: %v", err)
	}

	m := New(cfg, "0.1.0", false)
	m = typeKey(m, 'm')
	m.menu.cursor = menuIndex(t, m, "reset")

	// Erster Druck bewaffnet nur.
	m = press(m, enter)
	if m.menu.confirm != actionReset {
		t.Fatal("erster ↵ soll die Bestätigung anfordern, nicht löschen")
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("Config darf noch nicht gelöscht sein: %v", err)
	}

	// esc bricht ab.
	m = press(m, esc)
	if m.menu.confirm != "" {
		t.Error("esc soll die Bestätigung verwerfen")
	}
	if m.screen != screenMenu {
		t.Errorf("esc soll bei offener Bestätigung im Menü bleiben, ist aber %v", m.screen)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("nach dem Abbruch muss die Config noch da sein: %v", err)
	}

	// Erneut anfordern und diesmal bestätigen.
	m = press(m, enter)
	m = press(m, enter)
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("Config sollte gelöscht sein, Stat-Fehler: %v", err)
	}
	if m.Config().Username != "" {
		t.Errorf("Werte sollen auf Standard stehen, Username ist %q", m.Config().Username)
	}
	if m.Config().Path() != path {
		t.Errorf("Pfad soll erhalten bleiben, ist %q", m.Config().Path())
	}
	if m.api != apiOff {
		t.Errorf("ohne Spielername soll der Abruf aus sein, ist %v", m.api)
	}
}

// Die Statuszeile darf nach einem Abruf nicht auf „wird abgerufen" stehen
// bleiben — und ein Fehlschlag muss seinen Grund zeigen.
func TestStatusNachAbruf(t *testing.T) {
	cfg := testCfg()
	cfg.Username = "Beispiel"

	m := New(cfg, "0.1.0", false)
	m = typeKey(m, 'r')
	if m.api != apiLoading {
		t.Fatalf("r soll den Abruf starten, api ist %v", m.api)
	}
	if m.status != "" {
		t.Errorf("beim Start des Abrufs soll keine alte Meldung stehen, steht %q", m.status)
	}

	var snap warera.Snapshot
	snap.User.Skills.Health = warera.Skill{Total: 140, CurrentBar: 140, HourlyBarRegen: 14}
	m = press2(m, apiMsg{snap: snap, userID: "abc"})
	if m.api != apiOK {
		t.Fatalf("nach dem Abruf soll api OK sein, ist %v", m.api)
	}
	if m.status == "" || m.stErr {
		t.Errorf("Erfolg soll eine kurze Meldung setzen, ist %q (Fehler=%v)", m.status, m.stErr)
	}

	// Nach statusTTL räumt der Sekundentakt die Meldung weg, ohne dass etwas
	// gedrückt werden muss.
	m.statusAt = time.Now().Add(-2 * statusTTL)
	m = press2(m, tickMsg(time.Now()))
	if m.status != "" {
		t.Errorf("Erfolgsmeldung soll auslaufen, steht noch %q", m.status)
	}

	// Ein Fehlschlag nennt den Grund und bleibt stehen.
	m = press2(m, apiMsg{err: errors.New("kein Spieler namens \"Beispiel\" gefunden")})
	if m.api != apiFailed {
		t.Fatalf("nach einem Fehler soll api failed sein, ist %v", m.api)
	}
	if !m.stErr || !strings.Contains(m.status, "kein Spieler") {
		t.Errorf("Fehlergrund soll in der Statuszeile stehen, steht %q", m.status)
	}
	m.statusAt = time.Now().Add(-2 * statusTTL)
	if m = press2(m, tickMsg(time.Now())); m.status == "" {
		t.Error("Fehlermeldungen sollen nicht auslaufen")
	}
}

// Die Anzeige muss vom echten Füllstand ausgehen, nicht von „jetzt voll":
// die Zahlen aus dem Spiel-Screenshot (117.5/140 um 11:12, Ziel 14:05).
func TestAnzeigeRechnetMitIstWert(t *testing.T) {
	cfg := testCfg()
	cfg.Username = "Beispiel"

	snap := &warera.Snapshot{}
	snap.User.Skills.Health = warera.Skill{Total: 140, CurrentBar: 117.5, HourlyBarRegen: 14}
	snap.User.Skills.Hunger = warera.Skill{Total: 7, CurrentBar: 6.1, HourlyBarRegen: 0.7}

	m := New(cfg, "0.1.0", false)
	m.width = 74
	m.now = time.Date(2026, 9, 1, 11, 12, 0, 0, time.Local)
	m.snap = snap
	m.api = apiOK

	view := m.viewDashboard()
	// Drei Ticks (12, 13, 14 Uhr) × 14 = 42 Regeneration, Zielwert also 98 —
	// und von 117.5 aus sind das 19.5 zum Ausgeben, nicht 42.
	for _, want := range []string{"117.5 / 140", "ausgeben 19.5", "runter bis 98", "3 Ticks"} {
		if !strings.Contains(view, want) {
			t.Errorf("Anzeige enthält %q nicht:\n%s", want, view)
		}
	}
	if strings.Contains(view, "ausgeben 42") {
		t.Error("ohne Ist-Wert gerechnet: 42 ist das Budget einer vollen Leiste")
	}

	// Steht der Ist-Wert unter dem Zielwert, ist die Leiste nicht mehr
	// rechtzeitig voll — das muss dastehen statt „ausgeben 0".
	// 80 von 140: es fehlen 18 bis zum Zielwert 98, und voll ist die Leiste
	// erst fünf Ticks später — um 16:00.
	snap.User.Skills.Health = warera.Skill{Total: 140, CurrentBar: 80, HourlyBarRegen: 14}
	m.snap = snap
	view = m.viewDashboard()
	for _, want := range []string{"zur Zielzeit nicht voll", "100% erst", "16:00", "es fehlen 18"} {
		if !strings.Contains(view, want) {
			t.Errorf("Fehlbetrag-Meldung enthält %q nicht:\n%s", want, view)
		}
	}
}

// Der Kopf muss zeigen, wessen Werte dastehen — und im manuellen Betrieb
// keinen Spieler behaupten.
func TestKopfZeigtSpielernamen(t *testing.T) {
	cfg := testCfg()
	cfg.Username = "c0re"

	m := New(cfg, "0.1.0", false)
	m.width, m.api = 78, apiOK
	if view := m.viewDashboard(); !strings.Contains(view, "Spieler c0re") {
		t.Errorf("Spielername fehlt im Kopf:\n%s", view)
	}

	// Auch offline: der Name sagt, für wen der Abruf gedacht war.
	m.api = apiFailed
	if view := m.viewDashboard(); !strings.Contains(view, "Spieler c0re") {
		t.Error("offline soll der Spielername stehen bleiben")
	}

	// Langer Name in schmaler Anzeige: eigene Zeile statt Umbruch im Wort.
	long := testCfg()
	long.Username = "EinSehrLangerSpielername"
	ml := New(long, "0.1.0", false)
	ml.width, ml.api = minWidth, apiOK
	if view := ml.viewDashboard(); !strings.Contains(view, "Spieler EinSehrLangerSpielername") {
		t.Errorf("langer Name soll ungebrochen stehen:\n%s", view)
	}

	// Manueller Betrieb: kein Spieler.
	mm := New(testCfg(), "0.1.0", false)
	mm.width = 78
	if view := mm.viewDashboard(); strings.Contains(view, "Spieler") {
		t.Errorf("ohne API-Modus soll kein Spieler stehen:\n%s", view)
	}
}

// Die Legende soll nur erklären, was gerade zu sehen ist.
func TestLegendePasstSichAn(t *testing.T) {
	full := regen.Result{Bars: []regen.BarResult{{HasCurrent: true, Current: 117.5}}}
	deficit := regen.Result{Bars: []regen.BarResult{{HasCurrent: true, Current: 80, DeficitSafe: 18}}}
	manual := regen.Result{Bars: []regen.BarResult{{}}}

	labels := func(res regen.Result) []string {
		var out []string
		for _, e := range legendFor(i18n.For("de"), res) {
			out = append(out, e.label)
		}
		return out
	}

	if got := strings.Join(labels(manual), ","); got != "muss stehen bleiben,ausgebbar" {
		t.Errorf("ohne Ist-Wert soll es kein verbraucht-Feld geben: %s", got)
	}
	if got := strings.Join(labels(full), ","); !strings.Contains(got, "verbraucht") || strings.Contains(got, "fehlt") {
		t.Errorf("mit Ist-Wert ohne Fehlbetrag: %s", got)
	}
	if got := strings.Join(labels(deficit), ","); !strings.Contains(got, "fehlt") {
		t.Errorf("mit Fehlbetrag soll fehlt dabei sein: %s", got)
	}

	// Schmales Terminal: die Legende bricht um statt über den Rand zu laufen.
	m := New(testCfg(), "0.1.0", false)
	m.width = minWidth
	if lines := strings.Count(strings.TrimRight(m.renderLegend(deficit, m.contentWidth()), "\n"), "\n"); lines < 1 {
		t.Error("bei schmaler Anzeige soll die Legende auf zwei Zeilen umbrechen")
	}
}

// press2 schickt eine beliebige Nachricht durch Update.
func press2(m Model, msg tea.Msg) Model {
	next, _ := m.Update(msg)
	return next.(Model)
}

// menuIndex findet die Menüzeile mit dem gesuchten Key.
func menuIndex(t *testing.T, m Model, key string) int {
	t.Helper()
	for i, f := range m.menu.fields {
		if f.key == key {
			return i
		}
	}
	t.Fatalf("Menüzeile %q nicht gefunden", key)
	return 0
}

// Ab dem zweiten Start steht sofort die Berechnung da.
func TestZweiterStartZeigtDirektDieBerechnung(t *testing.T) {
	cfg := testCfg()
	if cfg.ShowIntroOnStart {
		t.Fatal("show_intro_on_start soll standardmäßig aus sein")
	}
	if m := New(cfg, "0.1.0", false); m.screen != screenDashboard {
		t.Fatalf("zweiter Start soll direkt rechnen, ist aber %v", m.screen)
	}
}

// Wer das Intro dauerhaft will, bekommt es — aber ohne den Umweg ins Menü.
func TestIntroPerConfigFuehrtAufsDashboard(t *testing.T) {
	cfg := testCfg()
	cfg.ShowIntroOnStart = true

	m := New(cfg, "0.1.0", false)
	if m.screen != screenIntro {
		t.Fatalf("show_intro_on_start soll das Intro zeigen, ist aber %v", m.screen)
	}
	if m = press(m, enter); m.screen != screenDashboard {
		t.Fatalf("danach soll die Berechnung kommen, ist aber %v", m.screen)
	}
}
