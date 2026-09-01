package ui

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/yourname/warera-barkeeper/terminal_app/internal/config"
	"github.com/yourname/warera-barkeeper/terminal_app/internal/i18n"
	"github.com/yourname/warera-barkeeper/terminal_app/internal/regen"
	"github.com/yourname/warera-barkeeper/terminal_app/internal/warera"
)

// RenderOnce erzeugt die Berechnung als schmucklosen Text — für Skripte,
// Statusleisten und Aufrufe ohne Terminal.
func RenderOnce(cfg config.Config) string {
	p := i18n.For(cfg.Language)
	now := time.Now()

	var snap *warera.Snapshot
	var apiNote string
	if APIMode(cfg) {
		ctx, cancel := context.WithTimeout(context.Background(), cfg.Timeout())
		defer cancel()
		c := warera.New(cfg.API.BaseURL, cfg.Timeout())
		s, _, err := c.Fetch(ctx, cfg.Username, cfg.UserID)
		if err != nil {
			apiNote = p.T("once.offline", err.Error())
		} else {
			snap = &s
		}
	}

	st := buildState(cfg, snap, now)
	res := st.Compute(cfg)
	loc := cfg.Location()

	var b strings.Builder
	fmt.Fprintf(&b, "%s %s   %s %s   %s %s\n",
		p.T("head.target"), st.Params.Target.In(loc).Format("15:04"),
		p.T("head.left"), fmtDuration(st.Params.Target.Sub(now)),
		p.T("head.base"), st.Params.Base.In(loc).Format("15:04"))
	fmt.Fprintf(&b, "%s %s\n",
		p.T("head.next_tick"), regen.TickAfter(st.Params, now).In(loc).Format("15:04"))
	if APIMode(cfg) {
		fmt.Fprintln(&b, p.T("once.values_api", cfg.Username))
	} else {
		fmt.Fprintln(&b, p.T("once.values_manual"))
	}
	if apiNote != "" {
		fmt.Fprintf(&b, "%s %s\n", p.T("hint.title")+":", apiNote)
	}
	b.WriteString("\n")

	for _, br := range res.Bars {
		if br.HasCurrent {
			fmt.Fprintf(&b, "%s (%s / %s, %s)\n", br.Bar.Label,
				num(br.Current), num(br.Bar.Max), p.T("bar.per_tick", num(br.Bar.HourlyRegen)))
		} else {
			fmt.Fprintf(&b, "%s (%s, %s)\n", br.Bar.Label,
				p.T("bar.max", num(br.Bar.Max)), p.T("bar.per_tick", num(br.Bar.HourlyRegen)))
		}

		spend := br.Safe.Budget
		if br.HasCurrent {
			spend = br.LeftSafe
		}
		if br.HasCurrent && br.DeficitSafe > 0 {
			full := p.T("bar.later")
			if !br.FullAt.IsZero() {
				full = br.FullAt.In(loc).Format("15:04")
			}
			fmt.Fprintf(&b, "  %s\n", p.T("once.not_full", full, num(br.DeficitSafe)))
		} else {
			fmt.Fprintf(&b, "  %s %s   %s %s (%s)   %s\n",
				p.T("bar.spend"), num(spend),
				p.T("bar.down_to"), num(br.Safe.Floor), pct(br.Safe.FloorPct),
				p.T("bar.ticks", br.Safe.Ticks))
		}
		b.WriteString("\n")
	}

	if h := res.Hint; h != nil {
		var gains []string
		for _, br := range res.Bars {
			if extra := h.Extra[br.Bar.Key]; extra > 0 {
				gains = append(gains, fmt.Sprintf("%s +%s", br.Bar.Label, num(extra)))
			}
		}
		fmt.Fprintln(&b, p.T("hint.once",
			h.Suggested.In(loc).Format("15:04"),
			h.Tick.In(loc).Format("15:04"),
			strings.Join(gains, ", ")))
	}

	return b.String()
}
