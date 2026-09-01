# War Era - Barkeeper

**Health and hunger calculator for [WarEra](https://warera.io).**

How much can I spend right now and still be back at 100% at 14:05? A small terminal tool that answers exactly that — to the minute, with the real values of your account. Useful for war skilling, where pills are taken at a fixed time and full bars are needed for them.

![Go](https://img.shields.io/badge/Go-1.26%2B-00ADD8?logo=go&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)
![Platforms](https://img.shields.io/badge/Platforms-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)
![Languages](https://img.shields.io/badge/UI-English%20%7C%20Deutsch-lightgrey)

```
╭────────────────────────────────────────────────────────────────────╮
│ War Era - Barkeeper  v0.1.0                          player c0re   │
│ target 14:00   left 2h 48m 00s   base now 11:12                    │
│ next tick 12:00 (in 48m 00s)   ● API                               │
╰────────────────────────────────────────────────────────────────────╯

  HEALTH                                       117.5 / 140   14/tick
  █████████████████████████████████████████████████████░░···········
  spend 5.5   down to 112 (80%)   2 ticks

  HUNGER                                          6.1 / 7   0.7/tick
  █████████████████████████████████████████████████████░░░░░········
  spend 0.5   down to 5.6 (80%)   2 ticks

  ███ must stay   ░░░ spendable   ··· used up

╭────────────────────────────────────────────────────────────────────╮
│ Tip                                                                │
│ The target time 14:00 falls exactly on an hourly tick and          │
│ therefore does not count. Set to 14:05 it counts reliably:         │
│ HEALTH +14, HUNGER +0.7 extra budget.                              │
╰────────────────────────────────────────────────────────────────────╯

  m settings   r reload   i guide   ? keys   q quit
```

The bar runs from 0 to the maximum. `███` must stay so the target time holds, `░░░` may be spent until then, `···` has been used up already, and `▒▒▒` is missing up to the target value. The legend lists only the zones currently on screen.

---

## The problem

Health and hunger regenerate by **10% of the maximum per hour**, and they cap at 100%. Anything that would be credited beyond that is lost.

So whoever needs full bars at 14:00 for pills, and therefore touches nothing all morning, wastes **a full tick every hour**. Spend too much in the morning and the bars are not full at 14:00. There is exactly one right number in between, and this tool computes it.

## The hourly tick

This is the part that is not obvious from "10% per hour":

> **WarEra does not regenerate continuously. It regenerates in jumps, on the hour.**

The bar does not creep up minute by minute — it stands still and then jumps by `max/10`. That has an uncomfortable consequence: a tick that falls exactly on the target time is a coin toss. If it arrives a second late, the bar is not full.

Only ticks **strictly before** the target time are counted, therefore. A tick exactly on the target time is left out — the number shown should hold, not hope.

Which leads to the actual trick: **do not set the target time to 14:00, set it to 14:05.** The same tick then counts reliably and a whole regeneration hour comes for free. When the target time sits on or shortly before a full hour, the tool points this out on its own.

## An example

It is **11:12**, the bars should be full again at **14:05**, max health is **140** — so 14 per tick.

Until 14:05 the ticks at 12:00, 13:00 and 14:00 arrive: **three ticks, 42 HP of regeneration.** The target value is therefore 98 HP (70%) — that is how far the bar may go down. Standing at 117.5 HP right now, 19.5 HP are left to spend; that is the number the tool reports.

## Two operating modes

Nothing is mixed — either one or the other applies:

| | **with a player name** | **without a player name** |
|---|---|---|
| maximum and regen rate | from `user.getUserLite` | from `[bars]` in the config |
| current level | real value from the API | assumed to be full |
| the number shown | what can be spent **from now on** | the full regeneration budget |
| `[bars]` in the config | ignored, never overwritten | authoritative, editable in the menu |

In the settings the max values are therefore locked while a player name is set and fetching is on; the value from WarEra is shown there instead. To calculate manually, switch **API fetch** off or clear the player name.

If fetching is on but the API does not answer, the config values remain — without a current level, and with `⚠ offline` in the header. Nothing is invented.

**When too much has been spent already**, the tool says so instead of showing a number, including the time at which the bar is back at 100%:

```
  HEALTH                                          80 / 140   14/tick
  ██████████████████████████████████████▒▒▒▒▒▒▒▒····················
  not full at target time   100% only at 16:00   missing 18
```

## Installation

### Prebuilt binaries

Download the file for your system from the [latest release](https://github.com/YOURNAME/warera-barkeeper/releases/latest):

| System | File |
|---|---|
| Linux (Intel/AMD) | `barkeeper_linux_amd64` |
| Linux (ARM) | `barkeeper_linux_arm64` |
| macOS (Apple Silicon) | `barkeeper_darwin_arm64` |
| macOS (Intel) | `barkeeper_darwin_amd64` |
| Windows | `barkeeper_windows_amd64.exe` |

**Linux and macOS** — make it executable and put it on your path:

```sh
chmod +x barkeeper_*
mv barkeeper_* ~/.local/bin/barkeeper    # or /usr/local/bin/barkeeper
barkeeper
```

On **macOS** the binary is not signed, so Gatekeeper blocks the first start. Either allow it once under *System Settings → Privacy & Security*, or remove the quarantine flag yourself:

```sh
xattr -d com.apple.quarantine ~/.local/bin/barkeeper
```

On **Windows**, run `barkeeper_windows_amd64.exe` from PowerShell or the terminal. SmartScreen warns about unknown publishers; *More info → Run anyway* starts it.

To verify a download, compare it against `SHA256SUMS` from the same release:

```sh
sha256sum -c SHA256SUMS --ignore-missing
```

### With Go

```sh
go install github.com/YOURNAME/warera-barkeeper/terminal_app@latest
```

The binary is named `terminal_app` this way; rename it to `barkeeper` if you like.

### From source

```sh
git clone https://github.com/YOURNAME/warera-barkeeper.git
cd warera-barkeeper/terminal_app
make build          # binary for your own system
make build-all      # all five platforms into dist/
```

Pure Go, no cgo, no runtime dependencies. Go 1.26 or newer is required.

## Usage

Start it:

```sh
barkeeper
```

On the **very first** start a short explanation appears, followed directly by the settings: enter your player name there, the tool fetches the rest itself. Every later start goes straight to the calculation.

| Key | Effect |
|---|---|
| `m` | open and close the settings |
| `r` | fetch the values from WarEra again |
| `i` | show the explanation |
| `?` `h` | show the key list |
| `q` | quit |
| `↑` `↓` | move through the settings |
| `↵` | change a value or flip a switch |
| `esc` | cancel editing, otherwise go back |

The header shows the player name whose values are being used; in manual mode it stays empty. One line below, the badge says where the numbers come from: `● API`, `○ manual` for your own values, `⚠ offline` when the fetch did not get through. Player name, cached `userId` and the time of the last fetch are spelled out in the key list (`?`).

For status bars and scripts there is a one-shot output without the TUI:

```sh
barkeeper --once
```

Further flags: `--config <path>`, `--version`.

## Languages

The interface is available in **English and German**. Switch it in the settings under *Language*, or directly in the config:

```toml
language = "en"   # "de", or empty for automatic
```

Empty means: from `$LC_ALL`, `$LANG` or `$LANGUAGE` — and if none of those name a translated language, English. The menu then shows what that resolves to: `automatic (English)`.

**Adding a language** takes one file and no other change:

1. Copy `terminal_app/internal/i18n/en.go` to `fr.go`.
2. Change `Code` and `Name` (`"fr"`, `"Français"`) and translate the right-hand side.
3. Run `make check` — a test reports every message ID that is missing or extra, and checks that the placeholders (`%s`, `%d`) match.

The new language then appears in the menu and in the automatic detection on its own. If an ID is missing, the English text steps in rather than leaving a gap.

One rule for catalog texts: a percent sign that means percent is written **doubled** (`100%%`), otherwise `fmt.Sprintf` treats it as a placeholder. A test checks that too.

Not translated: the bar names (`HEALTH`, `HUNGER`, which is what the game calls them) and technical error messages from the API client — those address someone who is meant to fix something.

## Configuration

The settings live in a TOML file, editable in the menu or in an editor:

| System | Path |
|---|---|
| Linux | `~/.config/barkeeper/config.toml` |
| macOS | `~/Library/Application Support/barkeeper/config.toml` |
| Windows | `%AppData%\barkeeper\config.toml` |

Overridable with `--config` or the environment variable `BARKEEPER_CONFIG`. The path is also shown in the key list (`?`). **Delete config** in the settings removes the file and resets every value to its default — two key presses, because `↵` asks first.

```toml
username    = "YourName"   # for the API; empty = purely manual operation
user_id     = ""           # cached automatically after the first lookup

target_time = "14:05"      # HH:MM local — when everything should be full again
timezone    = ""           # IANA zone such as "Europe/Berlin", empty = system
language    = ""           # "en", "de", … — empty = from $LANG, else English

base_mode   = "now"        # "now" counts from now, "fixed" from base_time
base_time   = "07:00"      # only with base_mode = "fixed"

hint_window_minutes = 15     # how early the tick tip appears
show_intro_on_start = false  # explanation on every start; the very first
                             # start shows it regardless

[bars.health]              # manual operation only — see "Two operating modes"
max          = 140
hourly_regen = 14.0

[bars.hunger]
max          = 7
hourly_regen = 0.7

[api]
enabled         = true
base_url        = "https://api2.warera.io/trpc"
timeout_seconds = 8
cache_minutes   = 10
```

Two things deserve an explanation:

**`base_mode`** — normally the tool counts from the current time. With `"fixed"` it counts from `base_time`, 07:00 for instance. Useful in the evening to know what will be available from seven the next morning.

**`[bars]`** — these values apply *only* in manual operation, that is without a player name or with `enabled = false`. With a player name they are ignored and never overwritten.

## How it is calculated

```
n         = number of ticks in the interval (base, target)   ← a tick on the target time does not count
budget    = min(n · regen per tick, maximum)
target value = maximum − budget
```

The time at which a bar that is too low is back at 100% is the same idea in reverse: `ceil((maximum − current) / regen per tick)` ticks from the next tick onwards.

The tick grid comes from `gameConfig.getDates`; if the API cannot be reached, the tool falls back to "the full hour, UTC". Everything is calculated with absolute points in time so that time zones and daylight saving changes cannot distort the result.

**What the tool deliberately does not do:** it does not convert the health budget into a number of hits. Damage per hit depends on gear and dodging is random — any hit count would be a guess. What you get is the value you may go down to; how many blows that is, a player knows better than any tool.

## Game mechanics

All values are verified against the live WarEra API, not collected from forums:

| What | Value | Source |
|---|---|---|
| regeneration rate | `max / 10` per hour | `gameConfig.getGameConfig` → `user.regenDividedBy: 10` |
| regeneration time | hourly tick on the full hour UTC | `gameConfig.getDates` → `nextRegenAt` |
| cap | 100%, the surplus is lost | game behaviour |
| max health | 100 (skill level 0) … 200 (level 10), +10 per level | `gameConfig` → `skills.health.levels` |
| max hunger | 4 (level 0) … 14 (level 10), +1 per level | `gameConfig` → `skills.hunger.levels` |
| your current and max values | `currentBarValue`, `total`, `hourlyBarRegen` | `user.getUserLite` → `skills.*` |

Two things that surprise:

- **Hunger regenerates fractionally.** At max hunger 4 that is 0.4 per tick. The tool therefore does not round to whole numbers — 2.4 is not the same as 2.
- **The tick time comes from the API**, not from a hard-wired "full hour UTC" assumption. If WarEra shifts the grid, the tool keeps calculating correctly.

## API usage

The tool talks to three endpoints, **all public and read-only**:

| Endpoint | What for |
|---|---|
| `search.searchAnything` | player name → `userId` (once, then cached) |
| `user.getUserLite` | max values, current values and regen rate of your bars |
| `gameConfig.getDates` | `nextRegenAt` as the tick grid |

**No API key is needed**, no credentials are stored or requested, and nothing is written to your game account. Your player name is enough.

If the connection fails, the tool keeps calculating with the values from the config and marks this as `⚠ offline` in the header. It never blocks on the network — the interface is there immediately, the values arrive afterwards.

## Project layout

```
warera-barkeeper/
├── README.md
└── terminal_app/          ← the console application (Go + Bubble Tea)
    ├── main.go
    └── internal/
        ├── regen/         ← the calculation, dependency-free and tested
        ├── config/        ← TOML settings
        ├── warera/        ← API client
        ├── i18n/          ← translations, one file per language
        └── ui/            ← terminal interface
```

The application deliberately lives in a subdirectory: the repository root stays free for a later web variant that maps the same mechanics into the browser.

**Planned:** web app under `web_app/` · energy and entrepreneurship as optional bars (mechanically identical) · a notification when the budget is used up.

Developer notes are in [`terminal_app/README.md`](terminal_app/README.md). Code comments and internal documentation are in German.

## Contributing

Found a bug or have an idea? Issues and pull requests are welcome. For changes to the calculation, please include a test case in `terminal_app/internal/regen/regen_test.go` — that is the heart of the project.

```sh
cd terminal_app
make check    # go vet, tests and a gofmt check
```

## Releases

Releases are built by GitHub Actions from a tag:

```sh
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

The workflow runs `make check`, builds all five platforms, writes `SHA256SUMS` and publishes everything as a GitHub release. The version in the binary (`barkeeper --version`) comes from the tag.

## Disclaimer

Unofficial fan project. Not affiliated with the developers of WarEra, and neither endorsed nor reviewed by them. Game mechanics can change at any time — if the numbers stop matching, an issue is welcome.

## License

[MIT](LICENSE)
