import type { Lang } from './index'

/**
 * Englisch ist die Referenzsprache: Was hier steht, springt ein, wenn in einer
 * anderen Sprache eine ID fehlt. Wer eine Sprache hinzufügt, kopiert diese
 * Datei, ersetzt Code und Name und übersetzt die rechte Seite.
 *
 * Die IDs sind dieselben wie in `terminal_app/internal/i18n`, soweit die Texte
 * dieselben sind — was nur die Webapp braucht, steht unter `web.` bzw.
 * `explain.`.
 */
export const en: Lang = {
  code: 'en',
  name: 'English',
  msg: {
    'app.tagline': 'health and hunger calculator',

    'badge.stale': 'not loaded',
    'badge.api': 'API',
    'badge.loading': 'loading …',
    'badge.offline': 'offline',
    'badge.manual': 'manual',

    'head.player': 'player',
    'head.target': 'target',
    'head.left': 'left',
    'head.base': 'base',
    'head.base_now': 'now',
    'head.base_fixed': 'fixed',
    'head.next_tick': 'next tick',
    'head.in': '(in {0})',
    'head.target_after_debuff': 'target after debuff',
    'head.debuff_end': 'debuff ends',
    'head.no_debuff': '(no debuff active)',
    'head.tomorrow': 'target is tomorrow',

    'bar.max': 'max {0}',
    'bar.per_tick': '{0}/tick',
    'bar.spend': 'spend',
    'bar.down_to': 'down to',
    'bar.ticks': '{0} ticks',
    'bar.capped': 'there is time for a complete refill — the bar may be played empty',
    'bar.not_full': 'not full at target time',
    'bar.full_at': '100% only at',
    'bar.missing': 'missing',
    'bar.later': 'later',

    'dash.debuff': 'pill debuff ends at {0}, {1} left',
    'dash.debuff_basis': 'pill debuff, {0} left — sets the target time',
    'dash.debuff_hour': 'pill debuff ends at {0}, {1} left — target: the tick after',

    'legend.keep': 'must stay',
    'legend.spendable': 'spendable',
    'legend.missing': 'missing',
    'legend.used': 'used up',

    'hint.title': 'Tip',
    'hint.on_tick': 'The target time {0} falls exactly on an hourly tick and therefore does not count.',
    'hint.near_tick': 'Just {0} after the target time the next hourly tick arrives at {1}.',
    'hint.body': '{0} Set to {1} it counts reliably: {2} extra budget.',
    'hint.apply': 'Set target time to {0}',

    'menu.title': 'Settings',
    'menu.show': 'Settings',
    'menu.hide': 'Close settings',
    'menu.s.target': 'Target time',
    'menu.s.api': 'WarEra fetch',
    'menu.s.api.off': 'off — your own values apply',
    'menu.s.manual': 'Your own values',
    'menu.s.manual.unused': 'unused while fetching is on',
    'menu.s.display': 'Display',
    'menu.s.storage': 'Stored in this browser',
    'menu.s.storage.note':
      'Settings stay in this browser only. Nothing is sent anywhere except the read-only requests to WarEra.',

    'menu.more': 'More settings',
    'menu.more.note': 'time base, time zone, your own values, tip window, language',
    'menu.less': 'Show less',
    'menu.f.target_mode': 'Target from',
    'menu.f.target_mode.help': 'the debuff variants need a player name; “next hour” lifts the end to the tick after it',
    'menu.v.target_clock': 'fixed time',
    'menu.v.target_debuff': 'pill debuff',
    'menu.v.target_debuff_hour': 'debuff, next hour',
    'menu.f.target_time': 'Target time',
    'menu.f.target_time.help': 'HH:MM — when everything should be back at 100%',
    'menu.f.base_mode': 'Time base',
    'menu.f.base_mode.help': 'count from now or from a fixed time',
    'menu.v.now': 'now',
    'menu.v.fixed': 'fixed time',
    'menu.f.base_time': 'Fixed base time',
    'menu.f.base_time.help': 'HH:MM — only with time base “fixed time”',
    'menu.f.base_time.warn':
      'With a player name, a base in the past counts ticks that the fetched current level already contains — the number then comes out too generous.',
    'menu.f.timezone': 'Time zone',
    'menu.f.timezone.help': 'IANA zone such as Europe/Berlin, empty = this browser',
    'menu.f.load': 'Load values',
    'menu.f.load.help': 'Enter your player name and load — “Fetch values” up top keeps the numbers current afterwards',
    'menu.f.username': 'Player name',
    'menu.f.username.help': 'empty = manual use without the API',
    'menu.f.username.searching': 'searching …',
    'menu.f.username.no_hits': 'no player found',
    'menu.f.username.level': 'level {0}',
    'menu.f.username.pick': 'pick a suggestion — it loads the values right away',
    'menu.f.api': 'API fetch',
    'menu.f.api.help': 'on = values from WarEra, off = manual mode with your own max values',
    'menu.f.fetch': 'Fetch values',
    'menu.f.fetch.help': 'fetch maximum, regen rate and current level again now',
    'menu.f.fetch.at': 'fetched {0}',
    'menu.f.fetch.wait': 'in {0} s',
    'menu.s.timing': 'Time base and zone',
    'menu.f.max.help': 'WarEra credits max / 10 per tick — {0} here',
    'menu.f.health_max': 'Max health',
    'menu.f.hunger_max': 'Max hunger',
    'menu.help.manual': 'only used in manual mode — without a player name, or with fetching switched off',
    'menu.f.notify': 'Notify',
    'menu.f.notify.help': 'A message when a bar is back at 100% or the pill debuff ends — only while this page is open',
    'menu.f.notify.denied': 'blocked by the browser — allow it again for this page there',
    'alert.full': '{0} is back at 100%',
    'alert.debuff': 'The pill debuff has ended',
    'menu.f.hint_window': 'Tip before the tick (minutes)',
    'menu.f.hint_window.help':
      'If the target time sits that close before an hourly tick, moving it is suggested: 14:00 becomes 14:05 and the tick counts. 0 switches the tip off.',
    'menu.f.language': 'Language',
    'menu.f.language.help': 'German and English, or automatically from the browser',
    'menu.f.reset': 'Reset',
    'menu.f.reset.help': 'forget the stored settings and put every value back to its default',

    'menu.v.on': 'on',
    'menu.v.off': 'off',
    'menu.v.auto': 'automatic ({0})',
    'menu.v.from_api': 'from WarEra',
    'menu.v.system': 'this browser: {0}',
    'menu.v.fallback': 'fallback',
    'menu.v.unused': 'unused',
    'menu.v.confirm': 'Really reset?',
    'menu.v.confirm_yes': 'Yes, reset',
    'menu.v.confirm_no': 'Keep',

    'status.fetch_failed': 'Fetch failed: {0}',
    'status.no_fetch': 'Cannot fetch: the API is off or no player name is set.',
    'status.reset': 'Settings reset to their defaults.',
    'status.stale': 'Player name changed — press “Load values”.',
    'status.first_run': 'Enter your player name — max values and regen rate then come from WarEra.',
    'status.hint_applied': 'Target time set to {0}.',
    'status.saved_locally': 'Saved in this browser.',

    'err.not_a_number': '“{0}” is not a number',
    'err.gt_zero': 'must be greater than 0',
    'err.clock': 'expected a time as HH:MM, e.g. 14:05',
    'err.timezone': 'unknown time zone “{0}”',
    'err.minutes': 'expected minutes between 0 and 59',
    'err.no_username': 'no player name set',
    'err.no_player': 'no player named “{0}” found',
    'err.ambiguous': '“{0}” is ambiguous — no exact name match',

    'disclaimer.short': 'unofficial fan project',
    'disclaimer.title': 'Not an official WarEra service',
    'disclaimer.full': 'This is an independent fan project. It is not part of WarEra, not affiliated with the developers of the game, and neither endorsed nor reviewed by them. Game values are read through the public, read-only interface; game mechanics can change at any time — and then the numbers here stop matching.',

    'explain.title': 'How this works',
    'explain.text': `Health and hunger regenerate by 10% of the maximum per hour in WarEra. The credit does not arrive gradually but as a jump on the hour — an hourly tick of max/10. Between two ticks the bar stands still. At 100% it stops: whatever would be credited beyond that is lost. Carrying full bars around therefore wastes a whole tick every hour.

This tool works the other way round. You set a time at which the bars should be back at 100%; it shows how much of the current level can be spent until then without missing that target. The typical case is war skilling: taking pills at a fixed time needs full bars, and the hours before them should not go to waste.

If too much has been spent already, the tool says so as well — including the time at which the bar is back at 100%.

With a player name only the values from WarEra count: maximum, regen rate and current level. Without a player name only the values you entered count, and the bars are assumed to be full right now. Nothing is mixed.

Counted are only ticks strictly before the target time. A tick exactly on the target time is left out: it may arrive a second late, and then the credit is missing.`,

    'explain.bar.title': 'The bar',
    'help.bar.range': 'runs from 0 to the maximum',
    'help.bar.keep': 'must stay so the target time holds',
    'help.bar.spend': 'may be spent until the target time',
    'help.bar.missing': 'is missing up to the target value — the target time cannot be kept',
    'help.bar.used': 'has been used up already',

    'explain.values.title': 'Values',
    'explain.values.api': 'WarEra, player {0}',
    'explain.values.manual': 'your own values — no player name, or fetching switched off',
    'explain.values.source': 'source',
    'explain.values.userid': 'userId',
    'explain.values.none': 'none yet',
    'explain.values.fetched': 'fetched',
    'explain.privacy':
      'Three public, read-only WarEra endpoints are used: the player search, the public profile and the game clock. No API key, no login, nothing is written, and the requests go straight from this browser to WarEra.',
    'explain.terminal': 'The same calculation as a terminal app, plus the source code:',
  },
}
