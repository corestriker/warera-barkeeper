// Package config lädt und speichert die Benutzereinstellungen als TOML.
package config

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pelletier/go-toml/v2"
)

// EnvPath erlaubt es, den Config-Pfad per Umgebungsvariable zu setzen.
const EnvPath = "BARKEEPER_CONFIG"

const appDir = "barkeeper"

// Bar sind die Fallback-Werte einer Leiste, falls die API nicht erreichbar ist.
type Bar struct {
	Max         float64 `toml:"max"`
	HourlyRegen float64 `toml:"hourly_regen"`
}

// API steuert den Zugriff auf die öffentliche WarEra-Schnittstelle.
type API struct {
	Enabled        bool   `toml:"enabled"`
	BaseURL        string `toml:"base_url"`
	TimeoutSeconds int    `toml:"timeout_seconds"`
	CacheMinutes   int    `toml:"cache_minutes"`
}

// Config ist der komplette Satz Benutzereinstellungen.
type Config struct {
	Username string `toml:"username"`
	UserID   string `toml:"user_id"`

	TargetTime string `toml:"target_time"`
	Timezone   string `toml:"timezone"`
	Language   string `toml:"language"`

	BaseMode string `toml:"base_mode"`
	BaseTime string `toml:"base_time"`

	HintWindowMinutes int  `toml:"hint_window_minutes"`
	ShowIntroOnStart  bool `toml:"show_intro_on_start"`

	Bars map[string]Bar `toml:"bars"`
	API  API            `toml:"api"`

	// path merkt sich, woher die Config kam, damit Save dorthin zurückschreibt.
	path string
}

// BaseMode-Werte.
const (
	BaseModeNow   = "now"
	BaseModeFixed = "fixed"
)

// Leisten-Keys.
const (
	BarHealth = "health"
	BarHunger = "hunger"
)

// Default liefert eine Config mit sinnvollen Startwerten.
func Default() Config {
	return Config{
		TargetTime:        "14:05",
		BaseMode:          BaseModeNow,
		BaseTime:          "07:00",
		HintWindowMinutes: 15,
		// Aus: der Erklärscreen kommt beim allerersten Start ohnehin, danach
		// soll sofort die Berechnung dastehen. Wer ihn dauerhaft will, schaltet
		// ihn im Menü an.
		ShowIntroOnStart: false,
		Bars: map[string]Bar{
			// Level 0 der jeweiligen Skills — nur für den manuellen Betrieb;
			// mit Spielername kommen die echten Werte aus der API.
			BarHealth: {Max: 100, HourlyRegen: 10},
			BarHunger: {Max: 4, HourlyRegen: 0.4},
		},
		API: API{
			Enabled:        true,
			BaseURL:        "https://api2.warera.io/trpc",
			TimeoutSeconds: 8,
			CacheMinutes:   10,
		},
	}
}

// DefaultPath ist der plattformübliche Ort der Config-Datei.
func DefaultPath() (string, error) {
	if p := strings.TrimSpace(os.Getenv(EnvPath)); p != "" {
		return p, nil
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine the config directory: %w", err)
	}
	return filepath.Join(dir, appDir, "config.toml"), nil
}

// Path liefert den Pfad, aus dem diese Config geladen wurde.
func (c Config) Path() string { return c.path }

// SetPath legt fest, wohin Save schreibt.
func (c *Config) SetPath(p string) { c.path = p }

// Load liest die Config von path. Existiert die Datei nicht, kommen die
// Defaults zurück und exists ist false — das ist kein Fehler, sondern der
// erste Programmstart.
func Load(path string) (cfg Config, exists bool, err error) {
	cfg = Default()
	cfg.path = path

	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return cfg, false, nil
		}
		return cfg, false, fmt.Errorf("reading config %s: %w", path, err)
	}

	// Auf die Defaults draufparsen, damit neue Felder in alten Dateien
	// automatisch ihren Standardwert behalten.
	if err := toml.Unmarshal(data, &cfg); err != nil {
		return cfg, true, fmt.Errorf("config %s is not valid TOML: %w", path, err)
	}
	cfg.path = path
	cfg.Normalize()
	return cfg, true, nil
}

// Normalize repariert leere oder unsinnige Werte, damit das Programm mit einer
// von Hand editierten Datei nicht in einen kaputten Zustand läuft.
func (c *Config) Normalize() {
	if c.Bars == nil {
		c.Bars = map[string]Bar{}
	}
	def := Default()
	for key, d := range def.Bars {
		b, ok := c.Bars[key]
		if !ok || b.Max <= 0 {
			c.Bars[key] = d
			continue
		}
		if b.HourlyRegen <= 0 {
			// WarEra regeneriert max/10 pro Stunde (gameConfig: regenDividedBy).
			b.HourlyRegen = b.Max / 10
			c.Bars[key] = b
		}
	}
	if c.BaseMode != BaseModeFixed {
		c.BaseMode = BaseModeNow
	}
	if c.HintWindowMinutes < 0 {
		c.HintWindowMinutes = 0
	}
	if c.API.BaseURL == "" {
		c.API.BaseURL = def.API.BaseURL
	}
	if c.API.TimeoutSeconds <= 0 {
		c.API.TimeoutSeconds = def.API.TimeoutSeconds
	}
	if c.API.CacheMinutes < 0 {
		c.API.CacheMinutes = 0
	}
	c.Username = strings.TrimSpace(c.Username)
	c.UserID = strings.TrimSpace(c.UserID)
	c.Timezone = strings.TrimSpace(c.Timezone)
	// Eine unbekannte Sprache wird nicht stillschweigend korrigiert: i18n
	// fällt beim Anzeigen auf Englisch zurück, der Wert bleibt aber stehen,
	// damit ein Tippfehler in der Datei nicht unbemerkt verschwindet.
	c.Language = strings.ToLower(strings.TrimSpace(c.Language))
}

// Location löst die konfigurierte Zeitzone auf. Ohne Angabe gilt die
// Systemzeitzone; eine unbekannte Zone fällt ebenfalls auf sie zurück.
func (c Config) Location() *time.Location {
	if c.Timezone == "" {
		return time.Local
	}
	loc, err := time.LoadLocation(c.Timezone)
	if err != nil {
		return time.Local
	}
	return loc
}

// Timeout ist das HTTP-Timeout als Dauer.
func (c Config) Timeout() time.Duration {
	return time.Duration(c.API.TimeoutSeconds) * time.Second
}

// HintWindow ist das Hinweis-Fenster als Dauer.
func (c Config) HintWindow() time.Duration {
	return time.Duration(c.HintWindowMinutes) * time.Minute
}

// Save schreibt die Config atomar zurück: erst in eine Nachbardatei, dann
// umbenennen. So bleibt bei einem Absturz mitten im Schreiben die alte Datei
// intakt statt halb überschrieben zu sein.
func (c Config) Save() error {
	if c.path == "" {
		return errors.New("no config path set")
	}
	if err := os.MkdirAll(filepath.Dir(c.path), 0o755); err != nil {
		return fmt.Errorf("creating the config directory: %w", err)
	}

	body, err := toml.Marshal(c)
	if err != nil {
		return fmt.Errorf("serialising the config: %w", err)
	}

	tmp := c.path + ".tmp"
	if err := os.WriteFile(tmp, append([]byte(header), body...), 0o644); err != nil {
		return fmt.Errorf("writing the config: %w", err)
	}
	if err := os.Rename(tmp, c.path); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("replacing the config: %w", err)
	}
	return nil
}

// Delete entfernt die Config-Datei. Fehlt sie bereits, ist das kein Fehler —
// gewollt ist der Zustand „keine Config", nicht der Löschvorgang selbst.
func (c Config) Delete() error {
	if c.path == "" {
		return errors.New("no config path set")
	}
	if err := os.Remove(c.path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("deleting config %s: %w", c.path, err)
	}
	return nil
}

const header = `# War Era - Barkeeper — Health- und Hunger-Rechner fuer WarEra
#
# username            Spielername; wird einmalig zu einer user_id aufgeloest.
#                     Leer lassen fuer den rein manuellen Betrieb.
# target_time         HH:MM lokal, Zeitpunkt an dem alles wieder voll sein soll.
#                     Fuenf Minuten nach einer vollen Stunde ist fast immer die
#                     bessere Wahl als die volle Stunde selbst.
# timezone            IANA-Zone wie "Europe/Berlin". Leer = Systemzeitzone.
# language            "de", "en", … — leer heisst: aus $LANG, sonst Englisch.
#                     Eine neue Sprache braucht nur eine Datei in
#                     internal/i18n; die Auswahl hier erkennt sie automatisch.
# base_mode           "now"   rechnet ab der aktuellen Uhrzeit
#                     "fixed" rechnet ab base_time
# show_intro_on_start Erklaerscreen bei jedem Start zeigen. Beim allerersten
#                     Start kommt er unabhaengig davon.
# [bars]              Werte fuer den manuellen Betrieb: sie gelten, solange
#                     kein Spielername gesetzt oder der Abruf aus ist. Mit
#                     Spielername zaehlen ausschliesslich die API-Werte, diese
#                     hier werden dann ignoriert und nie ueberschrieben.
#                     hourly_regen ist normalerweise max / 10.

`
