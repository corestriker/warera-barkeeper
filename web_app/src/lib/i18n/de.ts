import type { Lang } from './index'

/**
 * Deutsch. Die Texte sind die aus der Terminal-App übernommenen; `en.ts` ist
 * die Referenz für die Message-IDs.
 */
export const de: Lang = {
  code: 'de',
  name: 'Deutsch',
  msg: {
    'app.tagline': 'Health- und Hunger-Rechner',

    'badge.stale': 'nicht geladen',
    'badge.api': 'API',
    'badge.loading': 'lädt …',
    'badge.offline': 'offline',
    'badge.manual': 'manuell',

    'head.player': 'Spieler',
    'head.target': 'Ziel',
    'head.left': 'noch',
    'head.base': 'Basis',
    'head.base_now': 'jetzt',
    'head.base_fixed': 'fest',
    'head.next_tick': 'nächster Tick',
    'head.in': '(in {0})',
    'head.target_after_debuff': 'Ziel nach Debuff',
    'head.debuff_end': 'Debuff-Ende',
    'head.no_debuff': '(kein Debuff aktiv)',
    'head.tomorrow': 'Ziel ist morgen',

    'bar.max': 'max {0}',
    'bar.per_tick': '{0}/Tick',
    'bar.spend': 'ausgeben',
    'bar.down_to': 'runter bis',
    'bar.ticks': '{0} Ticks',
    'bar.capped': 'die Zeit reicht für eine komplette Füllung — die Leiste darf leer gespielt werden',
    'bar.not_full': 'zur Zielzeit nicht voll',
    'bar.full_at': '100 % erst',
    'bar.missing': 'es fehlen',
    'bar.later': 'später',

    'dash.debuff': 'Pillen-Debuff endet {0}, noch {1}',
    'dash.debuff_basis': 'Pillen-Debuff, noch {0} — Grundlage der Zielzeit',
    'dash.debuff_hour': 'Pillen-Debuff endet {0}, noch {1} — Ziel: Tick danach',

    'legend.keep': 'muss stehen bleiben',
    'legend.spendable': 'ausgebbar',
    'legend.missing': 'fehlt',
    'legend.used': 'verbraucht',

    'hint.title': 'Hinweis',
    'hint.on_tick': 'Die Zielzeit {0} liegt exakt auf einem Stunden-Tick und zählt deshalb nicht mit.',
    'hint.near_tick': 'Nur {0} nach der Zielzeit kommt um {1} der nächste Stunden-Tick.',
    'hint.body': '{0} Auf {1} gesetzt, zählt er verlässlich mit: {2} Budget zusätzlich.',
    'hint.apply': 'Zielzeit auf {0} setzen',

    'menu.title': 'Einstellungen',
    'menu.show': 'Einstellungen',
    'menu.hide': 'Einstellungen schließen',
    'menu.s.target': 'Zielzeit',
    'menu.s.api': 'WarEra-Abruf',
    'menu.s.api.off': 'aus — es gelten die eigenen Werte',
    'menu.s.manual': 'Eigene Werte',
    'menu.s.manual.unused': 'ungenutzt, solange der Abruf an ist',
    'menu.s.display': 'Anzeige',
    'menu.s.storage': 'In diesem Browser gespeichert',
    'menu.s.storage.note':
      'Die Einstellungen bleiben in diesem Browser. Nach außen geht nichts außer den lesenden Abfragen an WarEra.',

    'menu.more': 'Mehr einstellen',
    'menu.more.note': 'Zeitbasis, Zeitzone, eigene Werte, Hinweis-Fenster, Sprache',
    'menu.less': 'Weniger anzeigen',
    'menu.f.target_mode': 'Zielzeit aus',
    'menu.f.target_mode.help': 'die Debuff-Varianten brauchen einen Spielernamen; „nächste Stunde“ hebt das Ende auf den Tick danach',
    'menu.v.target_clock': 'feste Uhrzeit',
    'menu.v.target_debuff': 'Pillen-Debuff',
    'menu.v.target_debuff_hour': 'Debuff, nächste Stunde',
    'menu.f.target_time': 'Zielzeit',
    'menu.f.target_time.help': 'HH:MM — wann alles wieder bei 100 % sein soll',
    'menu.f.base_mode': 'Zeitbasis',
    'menu.f.base_mode.help': 'ab jetzt oder ab einer festen Uhrzeit rechnen',
    'menu.v.now': 'jetzt',
    'menu.v.fixed': 'feste Uhrzeit',
    'menu.f.base_time': 'feste Basiszeit',
    'menu.f.base_time.help': 'HH:MM — nur bei Zeitbasis „feste Uhrzeit“',
    'menu.f.base_time.warn':
      'Mit Spielername zählt eine Basis in der Vergangenheit Ticks mit, die im abgerufenen Ist-Wert schon stecken — die Zahl fällt dann zu großzügig aus.',
    'menu.f.timezone': 'Zeitzone',
    'menu.f.timezone.help': 'IANA-Zone wie Europe/Berlin, leer = dieser Browser',
    'menu.f.load': 'Werte laden',
    'menu.f.load.help': 'Spielername eintragen und laden — danach halten „Werte holen“ oben die Zahlen aktuell',
    'menu.f.username': 'Spielername',
    'menu.f.username.help': 'leer = manueller Betrieb ohne API',
    'menu.f.api': 'API-Abruf',
    'menu.f.api.help': 'an = Werte aus WarEra, aus = manueller Betrieb mit den eigenen Max-Werten',
    'menu.f.fetch': 'Werte holen',
    'menu.f.fetch.help': 'Maximum, Regen-Rate und Füllstand jetzt neu holen',
    'menu.s.timing': 'Zeitbasis und Zone',
    'menu.f.max.help': 'WarEra schreibt pro Tick Max / 10 gut — hier {0}',
    'menu.f.health_max': 'Max Health',
    'menu.f.hunger_max': 'Max Hunger',
    'menu.help.manual': 'gilt nur im manuellen Betrieb — ohne Spielername oder mit ausgeschaltetem Abruf',
    'menu.f.hint_window': 'Tipp vor dem Tick (Minuten)',
    'menu.f.hint_window.help':
      'Liegt die Zielzeit so kurz vor einem Stunden-Tick, wird sie zum Verschieben vorgeschlagen: 14:00 wird zu 14:05, und der Tick zählt mit. 0 schaltet den Tipp aus.',
    'menu.f.language': 'Sprache',
    'menu.f.language.help': 'Deutsch und Englisch, oder automatisch aus dem Browser',
    'menu.f.reset': 'Zurücksetzen',
    'menu.f.reset.help': 'gespeicherte Einstellungen verwerfen und alle Werte auf Standard setzen',

    'menu.v.on': 'an',
    'menu.v.off': 'aus',
    'menu.v.auto': 'automatisch ({0})',
    'menu.v.from_api': 'aus WarEra',
    'menu.v.system': 'dieser Browser: {0}',
    'menu.v.fallback': 'Rückfall',
    'menu.v.unused': 'ungenutzt',
    'menu.v.confirm': 'Wirklich zurücksetzen?',
    'menu.v.confirm_yes': 'Ja, zurücksetzen',
    'menu.v.confirm_no': 'Behalten',

    'status.fetched': 'Werte aktualisiert {0}.',
    'status.fetch_failed': 'Abruf fehlgeschlagen: {0}',
    'status.no_fetch': 'Kein Abruf möglich: API ist aus oder kein Spielername gesetzt.',
    'status.reset': 'Einstellungen auf Standard zurückgesetzt.',
    'status.stale': 'Spielername geändert — auf „Werte laden“ klicken.',
    'status.first_run': 'Spielername eintragen — Max-Werte und Regen-Rate kommen dann aus WarEra.',
    'status.hint_applied': 'Zielzeit auf {0} gesetzt.',
    'status.saved_locally': 'In diesem Browser gespeichert.',

    'err.not_a_number': '„{0}“ ist keine Zahl',
    'err.gt_zero': 'muss größer als 0 sein',
    'err.clock': 'Uhrzeit im Format HH:MM erwartet, etwa 14:05',
    'err.timezone': 'Zeitzone „{0}“ ist unbekannt',
    'err.minutes': 'Minuten zwischen 0 und 59 erwartet',
    'err.no_username': 'kein Spielername gesetzt',
    'err.no_player': 'kein Spieler namens „{0}“ gefunden',
    'err.ambiguous': '„{0}“ ist mehrdeutig — kein exakter Namenstreffer',

    'disclaimer.short': 'unabhängiges Fan-Projekt',
    'disclaimer.title': 'Kein offizielles WarEra-Angebot',
    'disclaimer.full': 'Dies ist ein unabhängiges Fan-Projekt. Es gehört nicht zu WarEra, ist nicht mit den Entwicklern des Spiels verbunden und wurde von ihnen weder unterstützt noch geprüft. Die Spielwerte werden über die öffentliche, lesende Schnittstelle abgefragt; die Spielmechanik kann sich jederzeit ändern — dann stimmen auch die Zahlen hier nicht mehr.',

    'explain.title': 'Wie das funktioniert',
    'explain.text': `Health und Hunger regenerieren in WarEra um 10 % des Maximums pro Stunde. Die Gutschrift kommt aber nicht gleichmäßig, sondern als Sprung zur vollen Stunde — ein Stunden-Tick über max/10. Zwischen zwei Ticks steht die Leiste still. Bei 100 % ist Schluss — was darüber hinaus gutgeschrieben würde, verfällt. Volle Leisten stehen zu lassen verschenkt also stündlich einen kompletten Tick.

Dieses Werkzeug rechnet die Gegenrichtung. Vorgegeben wird eine Uhrzeit, zu der die Leisten wieder auf 100 % stehen sollen; angezeigt wird, wie viel vom aktuellen Füllstand bis dahin ausgegeben werden kann, ohne das Ziel zu verfehlen. Typischer Fall ist die War-Skillung: Pillen zu einer festen Uhrzeit einnehmen, dafür volle Leisten brauchen und die Stunden davor trotzdem nicht ungenutzt lassen.

Ist schon zu viel ausgegeben, sagt das Werkzeug das ebenfalls — samt der Uhrzeit, zu der die Leiste wieder bei 100 % steht.

Mit Spielernamen gelten ausschließlich die Werte aus WarEra: Maximum, Regen-Rate und Füllstand. Ohne Spielernamen gelten ausschließlich die selbst eingetragenen Werte, und es wird angenommen, dass die Leisten gerade voll sind. Vermischt wird nichts.

Gezählt werden nur Ticks, die echt vor der Zielzeit liegen. Ein Tick genau auf der Zielzeit bleibt außen vor: er kann eine Sekunde zu spät kommen, und dann fehlt die Gutschrift.`,

    'explain.bar.title': 'Die Leiste',
    'help.bar.range': 'läuft von 0 bis zum Maximum',
    'help.bar.keep': 'muss stehen bleiben, damit die Zielzeit hält',
    'help.bar.spend': 'darf bis zur Zielzeit ausgegeben werden',
    'help.bar.missing': 'fehlt bis zum Zielwert — die Zielzeit ist nicht zu halten',
    'help.bar.used': 'ist schon verbraucht',

    'explain.values.title': 'Werte',
    'explain.values.api': 'WarEra, Spieler {0}',
    'explain.values.manual': 'eigene Werte — kein Spielername oder Abruf aus',
    'explain.values.source': 'Quelle',
    'explain.values.userid': 'userId',
    'explain.values.none': 'noch keine',
    'explain.values.fetched': 'geholt',
    'explain.privacy':
      'Benutzt werden drei öffentliche, lesende WarEra-Endpunkte: die Spielersuche, das öffentliche Profil und die Spieluhr. Kein API-Key, kein Login, es wird nichts geschrieben, und die Abfragen gehen direkt von diesem Browser zu WarEra.',
    'explain.terminal': 'Dieselbe Rechnung als Terminal-App, dazu der Quellcode:',
  },
}
