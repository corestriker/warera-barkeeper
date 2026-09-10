// ==UserScript==
// @name         War Era - Barkeeper
// @namespace    https://barkeeper.c0re.ninja/
// @version      0.2.0
// @description  Shades the health and hunger bars by how far you may spend them down.
// @description:de  Färbt die Leisten für Leben und Hunger danach ein, wie weit du sie leerspielen darfst.
// @author       corestriker
// @homepageURL  https://github.com/corestriker/warera-barkeeper
// @supportURL   https://github.com/corestriker/warera-barkeeper/issues
// @downloadURL  https://raw.githubusercontent.com/corestriker/warera-barkeeper/main/tampermonkey/dist/barkeeper.user.js
// @updateURL    https://raw.githubusercontent.com/corestriker/warera-barkeeper/main/tampermonkey/dist/barkeeper.user.js
// @match        https://app.warera.io/*
// @icon         https://app.warera.io/favicon.ico
// @connect      api2.warera.io
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function() {
	//#region ../web_app/src/lib/format.ts
	/** Zahlen- und Dauer-Formatierung, übersetzt aus `internal/ui/format.go`. */
	/**
	* Formatiert Leisten-Werte kompakt: ganze Zahlen ohne Nachkommastelle,
	* gebrochene mit einer. Hunger regeneriert auf niedrigem Skill-Level 0,4 pro
	* Tick — da wäre Runden auf ganze Zahlen irreführend.
	*/
	function num(v) {
		if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
		return v.toFixed(1);
	}
	//#endregion
	//#region ../web_app/src/lib/settings.ts
	/**
	* Die Benutzereinstellungen.
	*
	* Entspricht `internal/config/config.go` der Terminal-App: dieselben Felder,
	* dieselben Standardwerte, dasselbe `normalize`, das von Hand verdrehte Werte
	* repariert. Gespeichert wird im `localStorage` statt in einer TOML-Datei, und
	* jede Änderung wird sofort geschrieben — im Browser erwartet niemand einen
	* Speichern-Knopf.
	*/
	/** Leisten-Keys. */
	var BAR_HEALTH = "health";
	var BAR_HUNGER = "hunger";
	/** Die Gutschrift pro Tick, abgeleitet aus dem Maximum. */
	function regenFor(max) {
		return max / 10;
	}
	var DEFAULT_BASE_URL$1 = "https://api2.warera.io/trpc";
	/** Einstellungen mit sinnvollen Startwerten. */
	function defaults() {
		return {
			username: "",
			userId: "",
			targetMode: "debuff_hour",
			targetTime: "14:05",
			timezone: "",
			language: "",
			baseMode: "now",
			baseTime: "07:00",
			hintWindowMinutes: 15,
			notify: false,
			explainerOpen: false,
			bars: {
				[BAR_HEALTH]: { max: 100 },
				[BAR_HUNGER]: { max: 4 }
			},
			api: {
				enabled: true,
				baseUrl: DEFAULT_BASE_URL$1,
				timeoutSeconds: 8,
				cacheMinutes: 10
			}
		};
	}
	function isTargetMode(v) {
		return v === "clock" || v === "debuff" || v === "debuff_hour";
	}
	/**
	* Repariert leere oder unsinnige Werte, damit die App mit einem von Hand
	* bearbeiteten `localStorage` nicht in einen kaputten Zustand läuft.
	*/
	function normalize(s) {
		const def = defaults();
		const out = {
			...s,
			bars: { ...s.bars },
			api: { ...s.api }
		};
		for (const [key, d] of Object.entries(def.bars)) {
			const bar = out.bars[key];
			if (bar === void 0 || !(bar.max > 0)) {
				out.bars[key] = { ...d };
				continue;
			}
			out.bars[key] = { max: bar.max };
		}
		if (out.baseMode !== "fixed") out.baseMode = "now";
		if (!isTargetMode(out.targetMode)) out.targetMode = "clock";
		if (!(out.hintWindowMinutes >= 0)) out.hintWindowMinutes = 0;
		if (out.api.baseUrl.trim() === "") out.api.baseUrl = def.api.baseUrl;
		if (!(out.api.timeoutSeconds > 0)) out.api.timeoutSeconds = def.api.timeoutSeconds;
		if (!(out.api.cacheMinutes >= 0)) out.api.cacheMinutes = 0;
		out.username = out.username.trim();
		out.userId = out.userId.trim();
		out.timezone = out.timezone.trim();
		out.language = out.language.toLowerCase().trim();
		return out;
	}
	/** Das HTTP-Timeout in Millisekunden. */
	function timeoutMs(s) {
		return s.api.timeoutSeconds * 1e3;
	}
	/** Das Hinweis-Fenster in Millisekunden. */
	function hintWindowMs(s) {
		return s.hintWindowMinutes * 60 * 1e3;
	}
	//#endregion
	//#region ../web_app/src/lib/regen.ts
	/**
	* Berechnet, wie weit eine WarEra-Leiste (Health, Hunger, …) leergespielt
	* werden darf, damit sie zu einem Zielzeitpunkt wieder voll ist.
	*
	* Der entscheidende Punkt: WarEra regeneriert nicht kontinuierlich, sondern in
	* Stunden-Ticks. Zu jedem Tick werden max/10 gutgeschrieben, gedeckelt bei
	* max. Ob ein Tick noch vor die Zielzeit fällt oder knapp dahinter, macht also
	* immer gleich eine ganze Regenerationsstunde Unterschied.
	*
	* Dieses Modul ist die Übersetzung von `internal/regen/regen.go` der
	* Terminal-App und hält sich bewusst an dessen Aufbau: dieselben Funktionen,
	* dieselben Namen, dieselben Testfälle. Wer hier etwas ändert, ändert es dort
	* mit — sonst rechnen die beiden Apps verschieden.
	*
	* Zeitpunkte und Dauern sind Millisekunden (`number`), wo Go `time.Time` und
	* `time.Duration` benutzt.
	*/
	/** Der Abstand zwischen zwei Regen-Ticks. */
	var DEFAULT_TICK_PERIOD = 36e5;
	/** Teilt abrundend Richtung minus unendlich (JS trunkiert Richtung null). */
	function floorDiv(a, b) {
		const q = Math.trunc(a / b);
		if (a % b !== 0 && a < 0 !== b < 0) return q - 1;
		return q;
	}
	/** Teilt aufrundend Richtung plus unendlich. */
	function ceilDiv(a, b) {
		const q = Math.trunc(a / b);
		if (a % b !== 0 && a < 0 === b < 0) return q + 1;
		return q;
	}
	function period(p) {
		return p.tickPeriod > 0 ? p.tickPeriod : DEFAULT_TICK_PERIOD;
	}
	/** Das größte k mit anchor + k*period <= t. */
	function lastTickIndexAtOrBefore(p, t) {
		return floorDiv(t - p.tickAnchor, period(p));
	}
	/** Das größte k mit anchor + k*period < t. */
	function lastTickIndexBefore(p, t) {
		return ceilDiv(t - p.tickAnchor, period(p)) - 1;
	}
	/**
	* Zählt die Regen-Ticks zwischen `base` und `target`.
	*
	* `inclusive = false` zählt das offene Intervall (base, target): ein Tick, der
	* exakt auf der Zielzeit liegt, wird nicht mitgezählt. `inclusive = true`
	* zählt (base, target] und nimmt ihn mit.
	*/
	function countTicks(p, inclusive) {
		if (p.target <= p.base) return 0;
		const from = lastTickIndexAtOrBefore(p, p.base);
		const to = inclusive ? lastTickIndexAtOrBefore(p, p.target) : lastTickIndexBefore(p, p.target);
		if (to <= from) return 0;
		return to - from;
	}
	/** Der erste Tick, der auf oder nach `t` liegt. */
	function tickAtOrAfter(p, t) {
		const k = ceilDiv(t - p.tickAnchor, period(p));
		return p.tickAnchor + k * period(p);
	}
	/** Der erste Tick echt nach `t`. */
	function tickAfter(p, t) {
		const k = floorDiv(t - p.tickAnchor, period(p)) + 1;
		return p.tickAnchor + k * period(p);
	}
	/** Rechnet eine Tick-Anzahl in ein Budget für eine Leiste um. */
	function evaluate(b, ticks) {
		const regen = ticks * b.hourlyRegen;
		let budget = regen;
		let capped = false;
		if (budget >= b.max) {
			budget = b.max;
			capped = true;
		}
		if (budget < 0) budget = 0;
		const floor = b.max - budget;
		return {
			ticks,
			regen,
			budget,
			floor,
			floorPct: b.max > 0 ? floor / b.max * 100 : 0,
			capped
		};
	}
	/**
	* Zählt die Ticks, bis eine Leiste von `current` aus wieder bei `max` steht.
	* 0 heißt: schon voll (oder es gibt keine Regeneration).
	*/
	function ticksToFull(b, current) {
		const missing = b.max - current;
		if (missing <= 0 || b.hourlyRegen <= 0) return 0;
		return Math.ceil(missing / b.hourlyRegen);
	}
	/**
	* Der Zeitpunkt, zu dem die Leiste von `current` aus wieder voll ist, oder
	* `null`, wenn sie das schon ist oder nicht regeneriert.
	*
	* Gezählt wird ab dem ersten Tick echt nach `base` — genau die Ticks, die auch
	* `countTicks` zählt, damit beide Zahlen dieselbe Wirklichkeit beschreiben.
	*/
	function fullAt(p, b, current) {
		const n = ticksToFull(b, current);
		if (n === 0) return null;
		return {
			at: tickAfter(p, p.base) + (n - 1) * period(p),
			ticks: n
		};
	}
	/**
	* Berechnet für jede Leiste, wie weit sie leergespielt werden darf.
	*
	* `current` ordnet Leisten-Keys ihren echten Ist-Wert zu und darf leer sein.
	* Ohne Ist-Werte gilt die Annahme, dass zum Zeitpunkt `base` alles voll ist.
	*/
	function compute(p, bars, current) {
		const safeTicks = countTicks(p, false);
		const riskyTicks = countTicks(p, true);
		return {
			params: p,
			bars: bars.map((b) => {
				const safe = evaluate(b, safeTicks);
				const risky = evaluate(b, riskyTicks);
				const br = {
					bar: b,
					safe,
					risky,
					hasCurrent: false,
					current: 0,
					leftSafe: 0,
					leftRisky: 0,
					deficitSafe: 0,
					deficitRisky: 0,
					fullAt: null,
					ticksToFull: 0
				};
				const cur = current === void 0 ? void 0 : current[b.key];
				if (cur !== void 0) {
					br.hasCurrent = true;
					br.current = cur;
					br.leftSafe = Math.max(0, cur - safe.floor);
					br.leftRisky = Math.max(0, cur - risky.floor);
					br.deficitSafe = Math.max(0, safe.floor - cur);
					br.deficitRisky = Math.max(0, risky.floor - cur);
					const full = fullAt(p, b, cur);
					if (full !== null) {
						br.fullAt = full.at;
						br.ticksToFull = full.ticks;
					}
				}
				return br;
			})
		};
	}
	//#endregion
	//#region ../web_app/src/lib/hint.ts
	/**
	* Der Hinweis auf eine minimal verschobene Zielzeit.
	*
	* Übersetzung von `internal/regen/hint.go`.
	*/
	/** Der Sicherheitsabstand, um den der Vorschlag hinter dem Tick liegt. */
	var HINT_OFFSET = 3e5;
	/**
	* Eine Zielzeit, die den Tick um `t` herum verlässlich mitnimmt: den ersten
	* Tick auf oder nach `t`, plus `HINT_OFFSET`.
	*
	* Gedacht für eine Zielzeit, die aus einem Ereignis kommt (Ende des
	* Pillen-Debuffs) und auf das Tick-Raster gehoben werden soll. Der Zuschlag
	* ist nicht Kosmetik: genau auf dem Tick wäre die Gutschrift ein Münzwurf.
	*/
	function targetAfterTick(p, t) {
		return tickAtOrAfter(p, t) + HINT_OFFSET;
	}
	/**
	* Prüft, ob die Zielzeit dicht an einem Tick liegt, und beziffert den Gewinn
	* einer Verschiebung. Liefert `null`, wenn nichts zu holen ist.
	*/
	function computeHint(p, bars, windowMs) {
		if (windowMs <= 0 || p.target <= p.base) return null;
		const tick = tickAtOrAfter(p, p.target);
		const gap = tick - p.target;
		if (gap > windowMs) return null;
		const hint = {
			kind: gap === 0 ? "onTick" : "nearTick",
			tick,
			suggested: tick + HINT_OFFSET,
			gap,
			extra: {}
		};
		const now = countTicks(p, false);
		const then = countTicks({
			...p,
			target: hint.suggested
		}, false);
		if (then <= now) return null;
		let any = false;
		for (const b of bars) {
			const diff = evaluate(b, then).budget - evaluate(b, now).budget;
			hint.extra[b.key] = diff;
			if (diff > 0) any = true;
		}
		if (!any) return null;
		return hint;
	}
	//#endregion
	//#region ../web_app/src/lib/zone.ts
	var formatters = /* @__PURE__ */ new Map();
	function formatter(zone) {
		let f = formatters.get(zone);
		if (f === void 0) {
			f = new Intl.DateTimeFormat("en-US", {
				timeZone: zone,
				hourCycle: "h23",
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit"
			});
			formatters.set(zone, f);
		}
		return f;
	}
	/** Die Zone des Browsers — der Standard, wenn nichts eingestellt ist. */
	function browserZone() {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
		} catch {
			return "UTC";
		}
	}
	/** Prüft eine IANA-Zone. Der leere String gilt als „Systemzone“ und ist gültig. */
	function isValidZone(zone) {
		const z = zone.trim();
		if (z === "") return true;
		try {
			new Intl.DateTimeFormat("en-US", { timeZone: z });
			return true;
		} catch {
			return false;
		}
	}
	/**
	* Löst die eingestellte Zone auf. Leer oder unbekannt fällt auf die Zone des
	* Browsers zurück — wie `config.Location()` auf `time.Local`.
	*/
	function zoneOr(zone) {
		const z = (zone ?? "").trim();
		if (z === "" || !isValidZone(z)) return browserZone();
		return z;
	}
	/** Die Wanduhrzeit eines Zeitpunkts in einer Zone. */
	function wallTime(instant, zone) {
		const parts = formatter(zone).formatToParts(new Date(instant));
		const field = (type) => {
			const part = parts.find((p) => p.type === type);
			return part === void 0 ? 0 : Number(part.value);
		};
		return {
			year: field("year"),
			month: field("month"),
			day: field("day"),
			hour: field("hour"),
			minute: field("minute"),
			second: field("second")
		};
	}
	/**
	* Der Zonen-Offset zu einem Zeitpunkt, in Millisekunden.
	*
	* Getrickst wird über den Umweg „Wanduhrzeit als UTC lesen“: die Differenz zum
	* echten Zeitpunkt ist genau der Offset. Sekundenbruchteile fallen dabei weg,
	* deshalb wird auf die Sekunde abgerundet — Offsets sind ohnehin volle Minuten.
	*/
	function offsetAt(instant, zone) {
		const w = wallTime(instant, zone);
		return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(instant / 1e3) * 1e3;
	}
	/**
	* Baut aus einer Wanduhrzeit einen Zeitpunkt.
	*
	* Zwei Durchgänge, weil der Offset selbst vom Ergebnis abhängt: der erste
	* schätzt mit dem Offset der als UTC gelesenen Zeit, der zweite korrigiert mit
	* dem Offset, der dort tatsächlich gilt. Das ist die Stelle, an der die
	* Zeitumstellung sonst eine Stunde verschluckt.
	*
	* Über- und untergelaufene Felder (Tag 32, Monat 0) normalisiert `Date.UTC`
	* von selbst — genau wie `time.Date` in Go.
	*/
	function instantFromWall(zone, w) {
		const asUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second ?? 0);
		return asUTC - offsetAt(asUTC - offsetAt(asUTC, zone), zone);
	}
	/**
	* Legt eine Uhrzeit auf denselben Kalendertag wie `ref`, in dessen Zone.
	* Entspricht `regen.AtClock`.
	*/
	function atClock(ref, zone, hour, minute) {
		const w = wallTime(ref, zone);
		return instantFromWall(zone, {
			year: w.year,
			month: w.month,
			day: w.day,
			hour,
			minute
		});
	}
	/**
	* Schaltet kalendarisch Tage weiter — nicht 24 Stunden.
	*
	* Das ist der Unterschied, der an einem 23- oder 25-Stunden-Tag zählt: 14:05
	* bleibt 14:05. In Go macht das `AddDate`.
	*/
	function addWallDays(instant, zone, days) {
		const w = wallTime(instant, zone);
		return instantFromWall(zone, {
			...w,
			day: w.day + days
		});
	}
	/** Uhrzeit als `HH:MM` in der angegebenen Zone. */
	function formatClock(instant, zone) {
		const w = wallTime(instant, zone);
		return `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
	}
	//#endregion
	//#region ../web_app/src/lib/schedule.ts
	/**
	* Uhrzeiten lesen und auf das nächste Auftreten legen.
	*
	* Übersetzung von `internal/regen/schedule.go`, mit den Zonen-Helfern aus
	* `zone.ts` an der Stelle, an der Go eine `*time.Location` benutzt.
	*/
	/**
	* Liest eine Uhrzeit im Format „HH:MM“. `null` heißt: nicht lesbar — die
	* Oberfläche meldet das über `err.clock`, deshalb braucht es hier keinen
	* eigenen Fehlertext.
	*/
	function parseClock(s) {
		const parts = s.trim().split(":");
		if (parts.length !== 2) return null;
		const [rawHour, rawMinute] = parts;
		if (!/^\d{1,2}$/.test(rawHour.trim()) || !/^\d{1,2}$/.test(rawMinute.trim())) return null;
		const hour = Number(rawHour.trim());
		const minute = Number(rawMinute.trim());
		if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
		return {
			hour,
			minute
		};
	}
	/**
	* Das nächste Auftreten von `hour:minute` nach `base`. Liegt die Uhrzeit heute
	* schon hinter `base`, wird auf morgen gerollt.
	*
	* Der Tageswechsel läuft kalendarisch, damit über eine Zeitumstellung hinweg
	* die Wanduhrzeit erhalten bleibt: 14:05 bleibt 14:05, auch wenn der Tag 23
	* oder 25 Stunden hat.
	*/
	function nextOccurrence(base, zone, hour, minute) {
		const today = atClock(base, zone, hour, minute);
		if (today > base) return today;
		return atClock(addWallDays(base, zone, 1), zone, hour, minute);
	}
	/**
	* Der Fallback-Tick-Anchor, wenn die API nicht erreichbar ist: WarEra tickt zur
	* vollen Stunde UTC.
	*/
	function nextWholeHourUTC(now) {
		const d = new Date(now);
		return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()) + 36e5;
	}
	//#endregion
	//#region ../web_app/src/lib/state.ts
	/**
	* Setzt Zeitparameter und Leisten-Werte zusammen — die Übersetzung von
	* `internal/ui/state.go`.
	*
	* Entweder-oder: mit Spielername und aktivem Abruf gelten ausschließlich die
	* Werte aus der API — Maximum, Regen-Rate und Ist-Wert. Ohne beides gelten
	* ausschließlich die selbst eingetragenen Werte, und es wird angenommen, dass
	* die Leisten gerade voll sind. Gemischt wird nicht, sonst stünde im Kopf ein
	* Maximum aus den eigenen Werten neben einem Ist-Wert aus dem Spiel.
	*
	* Der eine Sonderfall: im API-Modus ohne Antwort (Netz weg, Name unbekannt)
	* bleiben nur die eigenen Werte. Das Abzeichen im Kopf zeigt dann „⚠ offline“,
	* und ein Ist-Wert wird bewusst nicht erfunden.
	*/
	/** Die Reihenfolge der Anzeige. */
	var BAR_ORDER = [BAR_HEALTH, BAR_HUNGER];
	var BAR_LABELS = {
		[BAR_HEALTH]: "HEALTH",
		[BAR_HUNGER]: "HUNGER"
	};
	/**
	* Sagt, ob mit API-Werten gerechnet wird: dafür braucht es einen Spielernamen
	* und einen eingeschalteten Abruf.
	*/
	function apiMode(s) {
		return s.api.enabled && s.username.trim() !== "";
	}
	/** Das Ende eines noch laufenden Debuffs, sonst `null`. */
	function debuffEnd(snap, now) {
		if (snap === null) return null;
		const end = snap.user.buffs.debuffEndAt;
		if (end !== null && end > now) return end;
		return null;
	}
	function skillFor(snap, key) {
		if (snap === null) return void 0;
		return snap.user.skills[key];
	}
	function buildState(s, snap, now) {
		const zone = zoneOr(s.timezone);
		let base = now;
		if (s.baseMode === "fixed") {
			const c = parseClock(s.baseTime);
			if (c !== null) base = atClock(now, zone, c.hour, c.minute);
		}
		let target = base + 36e5;
		const targetClock = parseClock(s.targetTime);
		if (targetClock !== null) target = nextOccurrence(base, zone, targetClock.hour, targetClock.minute);
		let anchor = nextWholeHourUTC(now);
		if (snap !== null && snap.nextRegenAt !== null) anchor = snap.nextRegenAt;
		const st = {
			params: {
				base,
				target,
				tickAnchor: anchor,
				tickPeriod: DEFAULT_TICK_PERIOD
			},
			bars: [],
			current: {},
			live: false,
			target: "clock",
			debuffEnd: null,
			zone
		};
		const end = debuffEnd(snap, now);
		if (end !== null) {
			st.debuffEnd = end;
			if (s.targetMode === "debuff") {
				st.params.target = end;
				st.target = "debuff";
			} else if (s.targetMode === "debuff_hour") {
				st.params.target = targetAfterTick(st.params, end);
				st.target = "debuffTick";
			}
		}
		const useAPI = apiMode(s) && snap !== null;
		for (const key of BAR_ORDER) {
			const bar = {
				key,
				label: BAR_LABELS[key] ?? key,
				max: 0,
				hourlyRegen: 0
			};
			const skill = skillFor(snap, key);
			if (useAPI && skill !== void 0 && skill.total > 0) {
				bar.max = skill.total;
				bar.hourlyRegen = skill.hourlyBarRegen;
				st.current[key] = skill.currentBarValue;
				st.live = true;
			} else {
				const own = s.bars[key];
				if (own !== void 0) {
					bar.max = own.max;
					bar.hourlyRegen = regenFor(own.max);
				}
			}
			if (bar.hourlyRegen <= 0 && bar.max > 0) bar.hourlyRegen = regenFor(bar.max);
			st.bars.push(bar);
		}
		return st;
	}
	/** Führt die Berechnung inklusive Hinweis aus. */
	function computeState(st, s) {
		return {
			result: compute(st.params, st.bars, st.current),
			hint: computeHint(st.params, st.bars, hintWindowMs(s))
		};
	}
	var WareraError = class extends Error {
		code;
		/** Bei `notFound` und `ambiguous`: der gesuchte Name. */
		username;
		constructor(code, message, username = "") {
			super(message);
			this.name = "WareraError";
			this.code = code;
			this.username = username;
		}
	};
	function emptySkill() {
		return {
			level: 0,
			total: 0,
			currentBarValue: 0,
			hourlyBarRegen: 0
		};
	}
	function numberOr(v, fallback = 0) {
		return typeof v === "number" && Number.isFinite(v) ? v : fallback;
	}
	function parseTime(v) {
		if (typeof v !== "string" || v === "") return null;
		const t = Date.parse(v);
		return Number.isNaN(t) ? null : t;
	}
	function record(v) {
		return typeof v === "object" && v !== null ? v : {};
	}
	function parseSkill(v) {
		const o = record(v);
		return {
			level: numberOr(o["level"]),
			total: numberOr(o["total"]),
			currentBarValue: numberOr(o["currentBarValue"]),
			hourlyBarRegen: numberOr(o["hourlyBarRegen"])
		};
	}
	function parseUser(v) {
		const o = record(v);
		const skills = record(o["skills"]);
		const buffs = record(o["buffs"]);
		const codes = buffs["debuffCodes"];
		const out = {};
		for (const key of Object.keys(skills)) out[key] = parseSkill(skills[key]);
		if (out["health"] === void 0) out["health"] = emptySkill();
		if (out["hunger"] === void 0) out["hunger"] = emptySkill();
		return {
			id: typeof o["_id"] === "string" ? o["_id"] : "",
			username: typeof o["username"] === "string" ? o["username"] : "",
			level: numberOr(record(o["leveling"])["level"]),
			buffs: {
				debuffCodes: Array.isArray(codes) ? codes.filter((c) => typeof c === "string") : [],
				debuffEndAt: parseTime(buffs["debuffEndAt"])
			},
			skills: out
		};
	}
	/**
	* Ruft eine Prozedur auf und liefert `result.data`.
	*
	* Die Aufrufe sind GET, nicht POST — so steht es in der offiziellen Doku
	* („every call is in GET and not POST“); die Eingabe steckt JSON-kodiert im
	* Query-Parameter `input`.
	*/
	async function call(procedure, input, opts) {
		const baseUrl = (opts.baseUrl ?? "https://api2.warera.io/trpc").replace(/\/+$/, "");
		const doFetch = opts.fetchImpl ?? fetch;
		let url = `${baseUrl}/${procedure}`;
		if (input !== void 0) url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
		let response;
		try {
			response = await doFetch(url, {
				method: "GET",
				headers: { Accept: "application/json" },
				signal: AbortSignal.timeout(opts.timeoutMs ?? 8e3)
			});
		} catch (err) {
			throw new WareraError("technical", `${procedure}: ${err instanceof Error ? err.message : String(err)}`);
		}
		const body = await response.text();
		let envelope;
		try {
			envelope = JSON.parse(body);
		} catch {
			throw new WareraError("technical", `${procedure}: response is not JSON (HTTP ${response.status})`);
		}
		if (envelope.error !== void 0) throw new WareraError("technical", `${procedure}: ${envelope.error.message ?? "unknown error"}`);
		if (!response.ok) throw new WareraError("technical", `${procedure}: HTTP ${response.status}`);
		const data = envelope.result?.data;
		if (data === void 0 || data === null) throw new WareraError("technical", `${procedure}: empty response`);
		return data;
	}
	/**
	* Sucht die `userId` zu einem Spielernamen.
	*
	* Die Suche matcht unscharf und liefert bei mehrdeutigen Namen mehrere
	* Treffer, deshalb wird jeder Kandidat geladen und auf exakte Namensgleichheit
	* geprüft.
	*/
	async function resolveUser(username, opts = {}) {
		const name = username.trim();
		if (name === "") throw new WareraError("noUsername", "no player name given");
		const data = record(await call("search.searchAnything", { searchText: name }, opts));
		const ids = Array.isArray(data["userIds"]) ? data["userIds"].filter((id) => typeof id === "string") : [];
		if (ids.length === 0) throw new WareraError("notFound", `player ${name} not found`, name);
		if (ids.length === 1) return ids[0];
		for (const id of ids) try {
			if ((await getUserLite(id, opts)).username.toLowerCase() === name.toLowerCase()) return id;
		} catch {
			continue;
		}
		throw new WareraError("ambiguous", `player name ${name} is ambiguous (${ids.length} matches)`, name);
	}
	/** Lädt das öffentliche Profil samt Leisten-Werten. */
	async function getUserLite(userId, opts = {}) {
		return parseUser(await call("user.getUserLite", { userId }, opts));
	}
	/**
	* Liefert den nächsten Regen-Tick und damit das Tick-Raster.
	*
	* Der Wert kommt bewusst aus der API statt als „volle Stunde UTC“ fest im Code
	* zu stehen: verschiebt WarEra das Raster, rechnet das Tool weiterhin richtig.
	*/
	async function nextRegenAt(opts = {}) {
		const t = parseTime(record(await call("gameConfig.getDates", {}, opts))["nextRegenAt"]);
		if (t === null) throw new WareraError("technical", "gameConfig.getDates: nextRegenAt is missing");
		return t;
	}
	/**
	* Holt in einem Rutsch alles, was für eine Berechnung gebraucht wird.
	*
	* `userId` darf leer sein; dann wird sie aus `username` aufgelöst. Der
	* Aufrufer bekommt die (womöglich neu ermittelte) ID zurück, um sie zu cachen.
	*/
	async function fetchSnapshot(username, userId, opts = {}) {
		let id = userId.trim();
		if (id === "") id = await resolveUser(username, opts);
		const user = await getUserLite(id, opts);
		let anchor = null;
		try {
			anchor = await nextRegenAt(opts);
		} catch {
			anchor = null;
		}
		return {
			snapshot: {
				user,
				nextRegenAt: anchor,
				fetchedAt: Date.now()
			},
			userId: id
		};
	}
	//#endregion
	//#region ../web_app/src/lib/zones.ts
	/**
	* Fehlbetrag und Ausgebbar haben **verschiedene Muster**, nicht nur
	* verschiedene Farben: die Anzeige muss auch ohne Farbe lesbar bleiben.
	*
	* Die Werte sind CSS-Deklarationen, keine React-Typen — so lassen sie sich
	* sowohl in ein `style`-Objekt spreizen als auch in einen Stylesheet-Text
	* schreiben.
	*/
	var ZONE_STYLE = {
		keep: { backgroundColor: "var(--color-keep)" },
		spendable: {
			backgroundColor: "var(--color-safe)",
			backgroundImage: "repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-safe) 100%, transparent) 0 6px, color-mix(in srgb, var(--color-safe) 62%, transparent) 6px 12px)"
		},
		missing: {
			backgroundColor: "var(--color-danger)",
			backgroundImage: "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-danger) 100%, transparent) 0 5px, color-mix(in srgb, var(--color-danger) 55%, transparent) 5px 10px)"
		},
		used: {
			backgroundColor: "var(--color-ground)",
			backgroundImage: "radial-gradient(circle at 3px 3px, color-mix(in srgb, var(--color-line-soft) 100%, transparent) 1px, transparent 1.4px)",
			backgroundSize: "6px 6px"
		}
	};
	/** Die Zonen einer Leiste, in Anteilen von 0 bis 1. */
	function zonesFor(br) {
		const max = br.bar.max;
		if (max <= 0) return [];
		const clamp = (v) => Math.min(1, Math.max(0, v / max));
		const floor = clamp(br.safe.floor);
		if (!br.hasCurrent) return [{
			kind: "keep",
			share: floor
		}, {
			kind: "spendable",
			share: 1 - floor
		}];
		const current = clamp(br.current);
		if (current < floor) return [
			{
				kind: "keep",
				share: current
			},
			{
				kind: "missing",
				share: floor - current
			},
			{
				kind: "used",
				share: 1 - floor
			}
		];
		return [
			{
				kind: "keep",
				share: floor
			},
			{
				kind: "spendable",
				share: current - floor
			},
			{
				kind: "used",
				share: 1 - current
			}
		];
	}
	//#endregion
	//#region src/main.ts
	/**
	* Das Userscript: dieselbe Rechnung wie die Webapp, aber im Spiel.
	*
	* Zwei Eingriffe in `app.warera.io`, beide additiv — es wird nichts entfernt
	* und nichts angeklickt:
	*
	*  1. Ein Knopf neben der Benachrichtigungsglocke öffnet die Einstellungen
	*     (Spielername, Zielzeit, Modus, Zone).
	*  2. Die Leisten für Leben und Hunger in der Kopfzeile bekommen die Zonen der
	*     Webapp übergelegt: behalten, ausgebbar, Fehlbetrag, verbraucht.
	*
	* **Gerechnet wird nicht hier.** `regen`, `state`, `zones` und der API-Client
	* kommen aus `web_app/src/lib` und werden beim Bauen mit hineingezogen. Eine
	* dritte Fassung der Tick-Rechnung wäre eine dritte Stelle, die ausein­ander­-
	* läuft; genau das soll das Projekt vermeiden.
	*/
	/** Eigener Schlüssel: die Webapp liegt auf einer anderen Domain, aber ein
	* gleicher Name wäre trotzdem eine Falle beim Umziehen. */
	var STORE_KEY = "barkeeper.userscript.v1";
	/** Die vier Leisten der Kopfzeile in ihrer Reihenfolge im Spiel. */
	var BAR_SLOTS = [
		BAR_HEALTH,
		BAR_HUNGER,
		"energy",
		"entrepreneurship"
	];
	var TEXTS = {
		de: {
			title: "Barkeeper",
			username: "Spieler",
			detected: "von der Seite übernommen",
			noUser: "Nicht eingeloggt? Auf der Seite wurde kein Spieler gefunden.",
			target: "Zielzeit",
			mode: "Zielzeit-Modus",
			zone: "Zeitzone",
			modeClock: "Uhrzeit",
			modeDebuff: "Debuff-Ende",
			modeDebuffHour: "Debuff, nächste Stunde",
			load: "Werte holen",
			loading: "lädt …",
			spend: "ausgeben",
			fullAt: "voll um",
			notFound: "Spieler nicht gefunden.",
			ambiguous: "Name ist mehrdeutig.",
			offline: "Kein Abruf möglich — es gelten keine Ist-Werte.",
			noBars: "Die Leisten in der Kopfzeile wurden nicht gefunden. Die Zahlen stimmen trotzdem.",
			hint: "Zielzeit",
			close: "Schließen"
		},
		en: {
			title: "Barkeeper",
			username: "Player",
			detected: "taken from the page",
			noUser: "Not signed in? No player found on the page.",
			target: "Target time",
			mode: "Target mode",
			zone: "Time zone",
			modeClock: "Clock",
			modeDebuff: "Debuff end",
			modeDebuffHour: "Debuff, next hour",
			load: "Fetch values",
			loading: "loading …",
			spend: "spend",
			fullAt: "full at",
			notFound: "Player not found.",
			ambiguous: "Name is ambiguous.",
			offline: "No fetch — running without live values.",
			noBars: "Could not find the bars in the top bar. The numbers below still hold.",
			hint: "Target",
			close: "Close"
		}
	};
	var lang = "en";
	var T = (k) => TEXTS[lang][k];
	var settings = load();
	var snap = null;
	var snapFor = "";
	var status = "";
	var busy = false;
	var lastTick = 0;
	function load() {
		try {
			const raw = window.localStorage.getItem(STORE_KEY);
			if (raw === null) return defaults();
			return normalize({
				...defaults(),
				...JSON.parse(raw)
			});
		} catch {
			return defaults();
		}
	}
	function save() {
		try {
			window.localStorage.setItem(STORE_KEY, JSON.stringify(settings));
		} catch {}
	}
	/**
	* Die eigene User-ID aus der Seite.
	*
	* In der Kopfzeile stehen mehrere Links auf das eigene Profil — Avatar, Stufe
	* und das Inventar unter `/user/<id>/inventory`. Die ID ist eine 24-stellige
	* Hex-Zahl; das reicht als Erkennungsmerkmal und kommt ohne Klassennamen aus.
	*
	* Mit der ID braucht es keine Namenssuche mehr: `fetchSnapshot` fragt direkt
	* `user.getUserLite` und liefert den Namen gleich mit.
	*/
	function detectUserId() {
		const scope = topBar() ?? document;
		for (const a of scope.querySelectorAll("a[href^=\"/user/\"]")) {
			const id = /^\/user\/([0-9a-f]{24})(?:[/?#]|$)/.exec(a.getAttribute("href") ?? "")?.[1];
			if (id !== void 0) return id;
		}
		return "";
	}
	function view() {
		const now = Date.now();
		const live = settings.username.trim().toLowerCase() === snapFor ? snap : null;
		const state = buildState(settings, live, now);
		const { result } = computeState(state, settings);
		return {
			now,
			state,
			result
		};
	}
	async function fetchNow() {
		const id = detectUserId();
		if (id === "") {
			status = T("noUser");
			render();
			return;
		}
		busy = true;
		status = "";
		render();
		try {
			const got = await fetchSnapshot("", id, {
				baseUrl: settings.api.baseUrl,
				timeoutMs: timeoutMs(settings)
			});
			snap = got.snapshot;
			snapFor = got.snapshot.user.username.toLowerCase();
			if (settings.username !== got.snapshot.user.username || settings.userId !== id) {
				settings = normalize({
					...settings,
					username: got.snapshot.user.username,
					userId: id
				});
				save();
			}
			status = "";
		} catch (err) {
			snap = null;
			snapFor = "";
			status = err instanceof WareraError ? err.code === "notFound" ? T("notFound") : err.code === "ambiguous" ? T("ambiguous") : T("offline") : T("offline");
		} finally {
			busy = false;
			render();
		}
	}
	/**
	* Die Muster der vier Zonen kommen aus `ZONE_STYLE` — derselben Quelle wie in
	* der Webapp, damit beide gleich aussehen und gleich bleiben. Nur die vier
	* Farbwerte stehen hier noch einmal: `theme.css` der Webapp ist ein
	* Tailwind-`@theme`-Block und lässt sich nicht als Modul einlesen.
	*/
	var TOKENS = `
[data-bk] {
  --color-keep:#35484f; --color-safe:#a2dcb6; --color-danger:#ec8f91;
  --color-ground:#0a0e10; --color-line-soft:#45595f;
  --bk-spendable:${ZONE_STYLE.spendable.backgroundImage};
  --bk-missing:${ZONE_STYLE.missing.backgroundImage};
  --bk-used:${ZONE_STYLE.used.backgroundImage};
}`;
	var CSS = `
/*
 * Umgestylt wird die Leiste des Spiels selbst — kein eigener Balken darüber.
 * Zwei Elemente sind beteiligt: die Bahn (der Hintergrund über die volle
 * Breite) und die Füllung, die das Spiel per transform: scaleX() auf den
 * Ist-Wert staucht.
 *
 * Deshalb "!important" und CSS-Variablen: React schreibt "background" auf der
 * Füllung als inline-Style. Eine Regel aus dem Stylesheet mit !important
 * sticht das, und die veränderlichen Zahlen reicht das Skript als
 * Custom Properties nach — die fasst React nicht an.
 */
[data-bk="track"] {
  background-color: var(--color-ground) !important;
  background-image: var(--bk-missing), var(--bk-used) !important;
  background-size: var(--bk-band-w, 0px) 100%, 6px 6px !important;
  background-position: var(--bk-band-x, 0px) 0, 0 0 !important;
  background-repeat: no-repeat, repeat !important;
}
[data-bk="fill"] {
  background-color: transparent !important;
  background-image:
    linear-gradient(90deg, var(--color-keep) 0 var(--bk-split, 100%), transparent var(--bk-split, 100%)),
    var(--bk-spendable) !important;
  border-color: transparent !important;
}

#bk-button { display:flex; align-items:center; justify-content:center; width:30px; height:30px;
  border:1px solid #33454c; border-radius:4px; background:#0f1517; color:#f4b374; cursor:pointer;
  font:600 15px/1 system-ui, sans-serif; flex-shrink:0; }
#bk-button:hover { border-color:#e18a8c; }
#bk-panel { position:fixed; top:52px; right:10px; z-index:99999; width:270px; max-width:calc(100vw - 20px);
  background:#0f1517; color:#eef5f7; border:1px solid #33454c; border-radius:6px; padding:12px 13px;
  font:400 13px/1.5 'Saira', system-ui, sans-serif; box-shadow:0 8px 26px rgba(0,0,0,.55); }
#bk-panel h2 { margin:0 0 9px; font-size:14px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:#f4b374; }
#bk-panel label { display:block; margin:8px 0 2px; font-size:11px; letter-spacing:.06em;
  text-transform:uppercase; color:#95aeb8; }
#bk-panel input, #bk-panel select { width:100%; box-sizing:border-box; padding:5px 7px; background:#0a0e10;
  color:#eef5f7; border:1px solid #33454c; border-radius:3px; font:inherit; }
#bk-panel button.bk-do { margin-top:11px; width:100%; padding:6px; background:#7a1f20; color:#eef5f7;
  border:1px solid #e18a8c; border-radius:3px; font:inherit; font-weight:600; cursor:pointer; }
#bk-panel button.bk-do[disabled] { opacity:.55; cursor:default; }
.bk-who { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
.bk-who b { color:#eef5f7; }
.bk-who span { color:#95aeb8; font-size:11px; }
.bk-out { margin-top:11px; border-top:1px solid #33454c; padding-top:9px; }
.bk-row { display:flex; justify-content:space-between; gap:8px; padding:2px 0; }
.bk-row b { color:#a2dcb6; font-variant-numeric:tabular-nums; }
.bk-row.bk-short b { color:#ec8f91; }
.bk-note { margin-top:8px; color:#95aeb8; font-size:11.5px; }
.bk-note.bk-bad { color:#ec8f91; }
`;
	function injectCss() {
		if (document.getElementById("bk-css")) return;
		const el = document.createElement("style");
		el.id = "bk-css";
		el.textContent = TOKENS + CSS;
		document.head.appendChild(el);
	}
	function topBar() {
		return document.getElementById("layoutUserMenu");
	}
	/**
	* Die vier Leisten der Kopfzeile.
	*
	* Erkannt werden sie an der Füllung: die trägt ein `transform: scaleX(...)`
	* direkt im `style`-Attribut. Das ist im Aufbau der Seite einzigartig und
	* überlebt einen Wechsel der Klassennamen, den jeder neue Build mitbringt.
	* Genommen wird der **tiefste** Vorfahr, unter dem genau vier davon hängen —
	* die Zeile mit Leben, Hunger, Energie und Unternehmertum. Andere Balken auf
	* der Seite (Stufenfortschritt) sitzen nicht in dieser Vierergruppe.
	*/
	function findFills() {
		const menu = topBar();
		if (menu === null) return null;
		const fills = [...menu.querySelectorAll("[style*=\"scaleX(\"]")];
		if (fills.length < BAR_SLOTS.length) return null;
		const byAncestor = /* @__PURE__ */ new Map();
		for (const fill of fills) for (let el = fill.parentElement; el !== null && el !== menu.parentElement; el = el.parentElement) {
			const list = byAncestor.get(el);
			if (list === void 0) byAncestor.set(el, [fill]);
			else list.push(fill);
		}
		let best = null;
		let bestDepth = -1;
		for (const [el, list] of byAncestor) {
			if (list.length !== BAR_SLOTS.length) continue;
			let depth = 0;
			for (let p = el.parentElement; p !== null; p = p.parentElement) depth++;
			if (depth > bestDepth) {
				bestDepth = depth;
				best = list;
			}
		}
		return best;
	}
	/**
	* Färbt die vorhandenen Leisten um.
	*
	* Nichts wird übergelegt: die Bahn des Spiels bekommt den Hintergrund für
	* „verbraucht“ und — falls die Zeit nicht mehr reicht — das Band für den
	* Fehlbetrag, die Füllung des Spiels bekommt den Verlauf von „behalten“ nach
	* „ausgebbar“. Die Füllung selbst staucht das Spiel weiter per `scaleX`, ihre
	* Breite bleibt also seine Angelegenheit; sie steht ohnehin genau für den
	* Ist-Wert, und der ist auch bei uns die Grenze zwischen ausgebbar und
	* verbraucht.
	*
	* Das Band für den Fehlbetrag wird in Pixeln gesetzt statt in Prozent: eine
	* Hintergrundebene auf einen Ausschnitt zu legen geht mit Prozentangaben nur
	* über eine unangenehme Umrechnung, mit `background-size`/`-position` in Pixeln
	* ist es direkt hingeschrieben. Neu berechnet wird ohnehin jede Sekunde.
	*/
	function paintBars() {
		const fills = findFills();
		if (fills === null) return false;
		const { result } = view();
		for (const [index, key] of BAR_SLOTS.entries()) {
			const fill = fills[index];
			if (fill === void 0) continue;
			const track = fill.parentElement;
			if (track === null) continue;
			const br = result.bars.find((b) => b.bar.key === key);
			if (br === void 0 || br.bar.max <= 0 || !br.hasCurrent) {
				if (fill.dataset.bk !== void 0) {
					delete fill.dataset.bk;
					delete track.dataset.bk;
				}
				continue;
			}
			const zones = zonesFor(br);
			const shareOf = (kind) => zones.find((z) => z.kind === kind)?.share ?? 0;
			const keep = shareOf("keep");
			const spendable = shareOf("spendable");
			const missing = shareOf("missing");
			const filled = keep + spendable;
			const split = filled <= 0 ? 1 : keep / filled;
			const width = track.clientWidth;
			const bandX = keep * width;
			const bandW = missing * width;
			fill.dataset.bk = "fill";
			track.dataset.bk = "track";
			fill.style.setProperty("--bk-split", `${(split * 100).toFixed(3)}%`);
			track.style.setProperty("--bk-band-x", `${bandX.toFixed(2)}px`);
			track.style.setProperty("--bk-band-w", `${bandW.toFixed(2)}px`);
		}
		return true;
	}
	function ensureButton() {
		const menu = topBar();
		if (menu === null || document.getElementById("bk-button") !== null) return;
		const bell = menu.querySelector("a[href=\"/notifications\"], a[href=\"/world\"]");
		const button = document.createElement("button");
		button.id = "bk-button";
		button.type = "button";
		button.title = T("title");
		button.textContent = "⧗";
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			togglePanel();
		});
		if (bell?.parentElement != null) bell.parentElement.insertBefore(button, bell);
		else menu.appendChild(button);
	}
	function togglePanel() {
		const open = document.getElementById("bk-panel");
		if (open !== null) {
			open.remove();
			return;
		}
		const panel = document.createElement("div");
		panel.id = "bk-panel";
		document.body.appendChild(panel);
		render();
		if (snap === null) fetchNow();
	}
	function field(parent, label, value, onCommit, type = "text") {
		const l = document.createElement("label");
		l.textContent = label;
		const i = document.createElement("input");
		i.type = type;
		i.value = value;
		i.addEventListener("change", () => onCommit(i.value));
		i.addEventListener("blur", () => onCommit(i.value));
		l.appendChild(i);
		parent.appendChild(l);
	}
	function render() {
		const panel = document.getElementById("bk-panel");
		if (panel === null) return;
		const active = document.activeElement;
		if (active instanceof HTMLElement && panel.contains(active) && active.tagName === "INPUT") return;
		panel.textContent = "";
		const h = document.createElement("h2");
		h.textContent = T("title");
		panel.appendChild(h);
		const who = document.createElement("div");
		who.className = "bk-who";
		const name = snap?.user.username ?? settings.username;
		who.innerHTML = name === "" ? `<span>—</span>` : `<b>${name}</b><span>${T("detected")}</span>`;
		panel.appendChild(who);
		field(panel, T("target"), settings.targetTime, (v) => {
			settings = normalize({
				...settings,
				targetTime: v
			});
			save();
			render();
			paintBars();
		}, "time");
		const ml = document.createElement("label");
		ml.textContent = T("mode");
		const sel = document.createElement("select");
		for (const [value, text] of [
			["clock", T("modeClock")],
			["debuff", T("modeDebuff")],
			["debuff_hour", T("modeDebuffHour")]
		]) {
			const o = document.createElement("option");
			o.value = value;
			o.textContent = text;
			o.selected = settings.targetMode === value;
			sel.appendChild(o);
		}
		sel.addEventListener("change", () => {
			settings = normalize({
				...settings,
				targetMode: sel.value
			});
			save();
			render();
			paintBars();
		});
		ml.appendChild(sel);
		panel.appendChild(ml);
		const load = document.createElement("button");
		load.className = "bk-do";
		load.type = "button";
		load.textContent = busy ? T("loading") : T("load");
		load.disabled = busy;
		load.addEventListener("click", () => void fetchNow());
		panel.appendChild(load);
		const { now, state, result } = view();
		const out = document.createElement("div");
		out.className = "bk-out";
		const target = document.createElement("div");
		target.className = "bk-row";
		target.innerHTML = `<span>${T("hint")}</span><b>${formatClock(state.params.target, zoneOr(settings.timezone))}</b>`;
		out.appendChild(target);
		for (const br of result.bars) {
			if (br.bar.max <= 0) continue;
			const row = document.createElement("div");
			row.className = "bk-row";
			const label = br.bar.label;
			if (br.hasCurrent && br.current < br.safe.floor) {
				row.classList.add("bk-short");
				const at = br.fullAt === null ? "—" : formatClock(br.fullAt, zoneOr(settings.timezone));
				row.innerHTML = `<span>${label}</span><b>${T("fullAt")} ${at}</b>`;
			} else {
				const value = br.hasCurrent ? br.leftSafe : br.safe.budget;
				row.innerHTML = `<span>${label}</span><b>${T("spend")} ${num(value)}</b>`;
			}
			out.appendChild(row);
		}
		panel.appendChild(out);
		const note = document.createElement("div");
		note.className = "bk-note";
		if (status !== "") {
			note.classList.add("bk-bad");
			note.textContent = status;
		} else if (findFills() === null) note.textContent = T("noBars");
		else note.textContent = `${formatClock(now, zoneOr(settings.timezone))}`;
		panel.appendChild(note);
	}
	function boot() {
		lang = (navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en";
		injectCss();
		new MutationObserver(() => {
			ensureButton();
			paintBars();
		}).observe(document.body, {
			childList: true,
			subtree: true
		});
		window.setInterval(() => {
			ensureButton();
			paintBars();
			const { state, now } = view();
			const period = state.params.tickPeriod;
			const tick = Math.floor((now - state.params.tickAnchor) / period);
			if (lastTick === 0) lastTick = tick;
			else if (tick !== lastTick) {
				lastTick = tick;
				fetchNow();
			}
			render();
		}, 1e3);
		ensureButton();
		fetchNow();
	}
	boot();
	//#endregion
})();
