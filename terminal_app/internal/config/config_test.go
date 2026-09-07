package config

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Die Defaults müssen durch Normalize unverändert durchgehen. Fehlt ein Feld
// in Default, repariert Normalize es stillschweigend auf einen anderen Wert —
// und die Anwendung startet mit etwas anderem als dokumentiert.
func TestDefaultIstNormalisiert(t *testing.T) {
	want := Default()
	got := Default()
	got.Normalize()

	if !reflect.DeepEqual(got, want) {
		t.Errorf("Normalize verändert die Defaults:\n got  %+v\n want %+v", got, want)
	}
	if want.TargetMode != TargetModeDebuff {
		t.Errorf("TargetMode = %q, want %q", want.TargetMode, TargetModeDebuff)
	}
	if want.BaseMode != BaseModeNow {
		t.Errorf("BaseMode = %q, want %q", want.BaseMode, BaseModeNow)
	}
}

// Normalize muss unsinnige Werte aus einer von Hand editierten Datei fangen.
func TestNormalizeRepariert(t *testing.T) {
	c := Config{
		TargetMode:        "unfug",
		BaseMode:          "unfug",
		HintWindowMinutes: -5,
		Language:          "  DE  ",
		Username:          "  Name  ",
		Bars: map[string]Bar{
			BarHealth: {Max: 200},                // Regen fehlt → max/10
			BarHunger: {Max: -1, HourlyRegen: 3}, // unsinnig → Default
		},
		API: API{TimeoutSeconds: 0, CacheMinutes: -1},
	}
	c.Normalize()

	if c.TargetMode != TargetModeClock || c.BaseMode != BaseModeNow {
		t.Errorf("Modi nicht repariert: %q / %q", c.TargetMode, c.BaseMode)
	}
	if c.HintWindowMinutes != 0 || c.API.CacheMinutes != 0 {
		t.Errorf("negative Werte nicht repariert: %d / %d", c.HintWindowMinutes, c.API.CacheMinutes)
	}
	if c.API.TimeoutSeconds != Default().API.TimeoutSeconds || c.API.BaseURL == "" {
		t.Errorf("API nicht aufgefüllt: %+v", c.API)
	}
	if c.Language != "de" || c.Username != "Name" {
		t.Errorf("Strings nicht getrimmt: %q / %q", c.Language, c.Username)
	}
	if got := c.Bars[BarHealth]; got.HourlyRegen != 20 {
		t.Errorf("Regen-Rate soll max/10 sein, ist %v", got.HourlyRegen)
	}
	if got := c.Bars[BarHunger]; got != Default().Bars[BarHunger] {
		t.Errorf("kaputte Leiste soll auf Default stehen, ist %+v", got)
	}
}

// Speichern und Laden müssen denselben Zustand ergeben.
func TestSaveLoadRunde(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.toml")

	want := Default()
	want.Username = "Beispiel"
	want.TargetMode = TargetModeDebuffHour
	want.Language = "en"
	want.SetPath(path)
	if err := want.Save(); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, exists, err := Load(path)
	if err != nil || !exists {
		t.Fatalf("Load: %v (exists=%v)", err, exists)
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Runde verändert die Config:\n got  %+v\n want %+v", got, want)
	}

	// Eine unbekannte Datei ist kein Fehler, sondern der erste Start.
	if _, exists, err := Load(filepath.Join(t.TempDir(), "fehlt.toml")); err != nil || exists {
		t.Errorf("fehlende Datei: err=%v exists=%v", err, exists)
	}

	// Löschen ist idempotent.
	if err := got.Delete(); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("Datei sollte weg sein: %v", err)
	}
	if err := got.Delete(); err != nil {
		t.Errorf("zweites Delete soll kein Fehler sein: %v", err)
	}
}
