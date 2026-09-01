// Command barkeeper — angezeigt als "War Era - Barkeeper" — berechnet, wie weit
// Health und Hunger in WarEra leergespielt werden dürfen, damit sie zu einer
// Zielzeit wieder voll sind.
package main

import (
	"flag"
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/yourname/warera-barkeeper/terminal_app/internal/config"
	"github.com/yourname/warera-barkeeper/terminal_app/internal/i18n"
	"github.com/yourname/warera-barkeeper/terminal_app/internal/ui"
)

// version wird beim Build über -ldflags gesetzt; ohne Git-Tag bleibt der hier
// gepflegte Wert stehen, damit im Kopf nie ein nacktes "dev" steht.
var version = "0.1.0"

func main() {
	if err := run(); err != nil {
		// Die Sprache der Config ist hier noch nicht bekannt — für die paar
		// Zeilen vor dem Start gilt deshalb die Umgebung.
		fmt.Fprintln(os.Stderr, i18n.For("").T("cli.error"), err)
		os.Exit(1)
	}
}

func run() error {
	var (
		cfgPath     string
		once        bool
		showVersion bool
	)
	// Die Flag-Beschreibungen werden vor dem Laden der Config gebraucht,
	// also in der Sprache der Umgebung.
	env := i18n.For("")
	flag.StringVar(&cfgPath, "config", "", env.T("cli.flag.config"))
	flag.BoolVar(&once, "once", false, env.T("cli.flag.once"))
	flag.BoolVar(&showVersion, "version", false, env.T("cli.flag.version"))
	flag.Parse()

	if showVersion {
		fmt.Println(ui.AppName, version)
		return nil
	}

	if cfgPath == "" {
		p, err := config.DefaultPath()
		if err != nil {
			return err
		}
		cfgPath = p
	}

	cfg, exists, err := config.Load(cfgPath)
	if err != nil {
		return err
	}

	if once {
		fmt.Print(ui.RenderOnce(cfg))
		return nil
	}

	// Beim ersten Start wird die Config gleich angelegt, damit der Nutzer eine
	// kommentierte Datei zum Nachschauen hat — auch wenn er nichts ändert.
	if !exists {
		if err := cfg.Save(); err != nil {
			fmt.Fprintln(os.Stderr, i18n.For(cfg.Language).T("cli.config_warn", err))
		}
	}

	p := tea.NewProgram(ui.New(cfg, version, !exists), tea.WithAltScreen())
	final, err := p.Run()
	if err != nil {
		return err
	}

	// Die im Menü aufgelöste userId ist ein reiner Cache — die schreiben wir
	// beim Beenden still zurück, damit der nächste Start schneller ist.
	if m, ok := final.(ui.Model); ok {
		saveUserIDCache(cfgPath, cfg, m.Config())
	}
	return nil
}

func saveUserIDCache(path string, before, after config.Config) {
	if after.UserID == "" || after.UserID == before.UserID {
		return
	}
	// Nur den Cache übernehmen, nicht ungespeicherte Menü-Änderungen.
	before.UserID = after.UserID
	before.SetPath(path)
	_ = before.Save()
}
