/* MTC Ladder Leagues: shared ladder rules.
   This exact file is used twice:
   1. by the web app in the browser (ladder-core.js), and
   2. by the Google Apps Script back end (pasted into a script file called Core.gs).
   Keep both copies identical. Change season dates and rules here only. */
var LadderCore = (function () {
  const SEASON_START = "2026-10-24"; // TEST ONLY: put back to "2026-11-01" before the season
  const SEASON_END = "2027-03-31";
  const LEAGUES = ["Competitive Mixed", "Competitive Ladies", "Social", "Doubles", "Walking Tennis Doubles"];
  const VENUES = ["Menheniot", "Liskeard"];
  const MONTHS = [["2026-11", "November"], ["2026-12", "December"], ["2027-01", "January"], ["2027-02", "February"], ["2027-03", "March"]];
  const REPLY_HOURS = 72;     // time the challenged player has to accept
  const MAX_PLACES_UP = 3;    // how far up you can challenge without a wild card
  const REMATCH_DAYS = 14;    // wait before re-challenging someone who beat you

  const pad = n => String(n).padStart(2, "0");
  const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
  const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
  const norm = s => String(s == null ? "" : s).trim().replace(/\s+/g, " ").toLowerCase();
  const isY = v => String(v == null ? "" : v).trim().toUpperCase() === "Y";
  const num = v => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };

  // Sheet dates arrive as displayed text, e.g. "01/11/2026" (en_GB) or "2026-11-01".
  function pDate(v) {
    v = String(v == null ? "" : v).trim();
    let m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + "-" + pad(m[2]) + "-" + pad(m[1]);
    m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : null;
  }
  function pTime(v) { const m = String(v == null ? "" : v).match(/(\d{1,2}):(\d{2})/); return m ? [+m[1], +m[2]] : [0, 0]; }
  function dt(dateStr, time) {
    if (!dateStr) return null;
    const p = dateStr.split("-").map(Number), t = pTime(time);
    return new Date(p[0], p[1] - 1, p[2], t[0], t[1]);
  }
  // Rows of one tab, skipping the header and blank rows. `row` is the real sheet row number.
  function rows(data, k) {
    const v = (data && data[k]) || [], out = [];
    for (let i = 1; i < v.length; i++) {
      const r = v[i] || [];
      if (r.some(c => String(c == null ? "" : c).trim() !== "")) out.push({ r: r, row: i + 1 });
    }
    return out;
  }
  // "Ian H & Zoe H" -> ["ian h", "zoe h"]
  function members(name) { return String(name == null ? "" : name).split(/\s*&\s*/).map(norm).filter(Boolean); }
  function milestone(n) { if (n < 1) return 0; if (n < 3) return 1; if (n < 5) return 3; if (n < 10) return 5; return Math.floor(n / 5) * 5; }

  // Fast4 score check. raw = [[c,d],[c,d],[c,d]] (challenger games, challenged games), blanks allowed for set 3.
  function readSets(raw) {
    const sets = []; let c = 0, d = 0;
    for (let i = 0; i < 3; i++) {
      const pair = (raw && raw[i]) || ["", ""];
      const a = String(pair[0] == null ? "" : pair[0]).trim(), b = String(pair[1] == null ? "" : pair[1]).trim();
      if (a === "" && b === "") continue;
      if (a === "" || b === "") return { error: "Set " + (i + 1) + " needs both scores." };
      const x = +a, y = +b;
      if (!((x === 4 && y >= 0 && y <= 3) || (y === 4 && x >= 0 && x <= 3))) return { error: "Set " + (i + 1) + " isn't a Fast4 score. One side needs 4 games and the other 0 to 3." };
      if (c === 2 || d === 2) return { error: "The match was already won in two sets, so leave set 3 blank." };
      sets.push([x, y]); if (x > y) c++; else d++;
    }
    if (c < 2 && d < 2) return { error: sets.length < 2 ? "Enter at least two sets." : "Enter the deciding third set." };
    return { sets: sets, winner: c === 2 ? "c" : "d" };
  }

  // Everything about one league, worked out from the sheet rows.
  function model(data, league, now) {
    now = now || new Date();
    const t = ymd(now), L = norm(league);
    const entries = rows(data, "ladders").filter(x => norm(x.r[0]) === L && String(x.r[2] || "").trim())
      .map((x, i) => ({ name: String(x.r[2]).trim(), key: norm(x.r[2]), pos: num(x.r[1]) || 999, joined: pDate(x.r[3]), i: i }));
    const byKey = {}; entries.forEach(e => { byKey[e.key] = e; });
    const res = rows(data, "results").filter(x => norm(x.r[1]) === L);
    const ch = rows(data, "challenges").filter(x => norm(x.r[2]) === L);
    const events = [];

    res.forEach((x, i) => {
      const r = x.r, c = norm(r[2]), d = norm(r[3]);
      if (!byKey[c] || !byKey[d]) return;
      const sets = [[r[4], r[5]], [r[6], r[7]], [r[8], r[9]]].map(s => [num(s[0]), num(s[1])]).filter(s => s[0] != null && s[1] != null);
      const wo = String(r[10] || "").trim();
      let winner = null;
      if (wo) winner = norm(wo);
      else { let a = 0, b = 0; sets.forEach(s => { if (s[0] > s[1]) a++; else if (s[1] > s[0]) b++; }); if (a >= 2) winner = c; else if (b >= 2) winner = d; }
      if (winner !== c && winner !== d) return;
      events.push({ date: pDate(r[0]) || t, c: c, d: d, winner: winner, sets: sets, wo: !!wo, order: i, row: x.row, sheet: "results" });
    });

    const open = [];
    ch.forEach((x, i) => {
      const r = x.r, c = norm(r[3]), d = norm(r[4]);
      if (!byKey[c] || !byKey[d]) return;
      const issued = pDate(r[0]); if (!issued) return;
      if (isY(r[10])) return; // withdrawn
      const after = res.filter(y => norm(y.r[2]) === c && norm(y.r[3]) === d && (pDate(y.r[0]) || "") >= issued).length;
      const later = ch.filter(y => norm(y.r[3]) === c && norm(y.r[4]) === d && (pDate(y.r[0]) || "") > issued).length;
      if (after > later) return; // already played
      const iss = dt(issued, r[1]), by = new Date(iss.getTime() + REPLY_HOURS * 36e5), acc = pDate(r[6]);
      const item = { row: x.row, c: c, d: d, issued: iss, replyBy: by, accepted: acc, matchDate: pDate(r[7]), matchTime: String(r[8] || "").trim(), venue: String(r[9] || "").trim(), wc: isY(r[5]) };
      if (!acc && now > by) events.push({ date: ymd(by), c: c, d: d, winner: c, sets: [], wo: true, auto: true, order: 1e6 + i, row: x.row, sheet: "challenges" });
      else open.push(item);
    });
    ch.forEach(x => { if (isY(x.r[5]) && !isY(x.r[10]) && byKey[norm(x.r[3])]) byKey[norm(x.r[3])].wcUsed = true; });
    events.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order);

    // Replay the season day by day so we know everyone's position on every date.
    const start = entries.filter(e => !e.joined || e.joined <= SEASON_START).sort((a, b) => a.pos - b.pos || a.i - b.i).map(e => e.key);
    const late = entries.filter(e => e.joined && e.joined > SEASON_START).sort((a, b) => a.joined < b.joined ? -1 : a.joined > b.joined ? 1 : a.pos - b.pos);
    let order = start.slice();
    const hist = {}, endD = t < SEASON_START ? SEASON_START : (t > SEASON_END ? SEASON_END : t);
    let ei = 0, li = 0;
    const apply = ev => {
      ev.newRank = null;
      if (ev.winner !== ev.c) return;
      const di = order.indexOf(ev.d), ci = order.indexOf(ev.c);
      if (di < 0 || ci < 0 || ci < di) return;
      order.splice(ci, 1); order.splice(di, 0, ev.c); ev.newRank = di + 1;
    };
    for (let day = SEASON_START; day <= endD; day = addDays(day, 1)) {
      while (li < late.length && late[li].joined <= day) { if (order.indexOf(late[li].key) < 0) order.push(late[li].key); li++; }
      while (ei < events.length && events[ei].date <= day) { apply(events[ei]); ei++; }
      hist[day] = order.slice();
    }
    if (t < SEASON_START) late.forEach(e => { if (e.joined <= t && order.indexOf(e.key) < 0) order.push(e.key); });

    const st = {};
    entries.forEach(e => { st[e.key] = { w: 0, l: 0, played: 0, streak: 0, def: 0, weekend: {}, hi: null, lo: null, avg: null }; });
    events.forEach(ev => {
      const lo = ev.winner === ev.c ? ev.d : ev.c, W = st[ev.winner], Lo = st[lo];
      W.w++; Lo.l++; W.streak++; Lo.streak = 0;
      if (!ev.wo) {
        W.played++; Lo.played++;
        if (ev.winner === ev.d) W.def++;
        const dw = new Date(ev.date + "T12:00:00").getDay();
        if (dw === 6 || dw === 0) { const k = dw === 6 ? ev.date : addDays(ev.date, -1); [W, Lo].forEach(s => { s.weekend[k] = (s.weekend[k] || 0) + 1; }); }
      }
    });
    const posOn = (k, day) => { const o = hist[day]; if (!o) return null; const i = o.indexOf(k); return i < 0 ? null : i + 1; };
    order.forEach(k => {
      const s = st[k], cur = order.indexOf(k) + 1;
      if (t < SEASON_START) { s.hi = s.lo = s.avg = cur; return; }
      let sum = 0, n = 0;
      Object.keys(hist).forEach(day => { const p = posOn(k, day); if (p == null) return; sum += p; n++; s.hi = s.hi == null ? p : Math.min(s.hi, p); s.lo = s.lo == null ? p : Math.max(s.lo, p); });
      s.avg = n ? sum / n : cur; if (s.hi == null) s.hi = s.lo = cur;
    });

    // Giant Slayer: biggest climb in each month.
    const gs = [];
    MONTHS.forEach(mo => {
      const ms = mo[0] + "-01"; if (t < ms) return;
      const me = addDays(addDays(ms, 32).slice(0, 7) + "-01", -1), end = t < me ? t : me;
      let best = 0, who = [];
      order.forEach(k => {
        let a = ms === SEASON_START ? null : posOn(k, addDays(ms, -1));
        if (a == null) { for (let d = ms; d <= end; d = addDays(d, 1)) { a = posOn(k, d); if (a != null) break; } }
        const b = posOn(k, end); if (a == null || b == null) return;
        const climb = a - b;
        if (climb > best) { best = climb; who = [k]; } else if (climb === best && climb > 0) who.push(k);
      });
      gs.push({ label: mo[1], current: t <= me, climb: best, who: who });
    });

    let ww = 0, wwWho = [], iw = 0, iwWho = [];
    Object.keys(st).forEach(k => {
      const s = st[k], m = Math.max.apply(null, [0].concat(Object.keys(s.weekend).map(x => s.weekend[x])));
      if (m > ww) { ww = m; wwWho = [k]; } else if (m === ww && m > 0) wwWho.push(k);
      if (s.def > iw) { iw = s.def; iwWho = [k]; } else if (s.def === iw && s.def > 0) iwWho.push(k);
    });
    const nameOf = k => (byKey[k] && byKey[k].name) || k;
    return { league: league, today: t, order: order, byKey: byKey, st: st, events: events, open: open, gs: gs, nameOf: nameOf,
      ww: ww >= 2 ? { n: ww, who: wwWho } : null, iw: iw > 0 ? { n: iw, who: iwWho } : null };
  }

  // Is anyone in this entry (player or pair) away at any point between from and to?
  function awayFor(data, name, from, to) {
    const ms = members(name).concat([norm(name)]);
    const list = rows(data, "availability").map(x => ({ row: x.row, key: norm(x.r[0]), name: String(x.r[0] || "").trim(), from: pDate(x.r[1]), to: pDate(x.r[2]), why: String(x.r[3] || "").trim() }));
    for (let i = 0; i < list.length; i++) { const a = list[i]; if (a.from && a.to && ms.indexOf(a.key) >= 0 && a.from <= to && a.to >= from) return a; }
    return null;
  }
  function openFor(m, key) { for (let i = 0; i < m.open.length; i++) { if (m.open[i].c === key || m.open[i].d === key) return m.open[i]; } return null; }

  // Can entry cKey challenge entry dKey right now?
  function checkChallenge(data, league, cKey, dKey, useWildcard, now) {
    const m = model(data, league, now), t = m.today;
    if (t < SEASON_START) return { ok: false, reason: "Challenges open on 1 November." };
    if (t > SEASON_END) return { ok: false, reason: "The season has finished." };
    const ci = m.order.indexOf(cKey), di = m.order.indexOf(dKey);
    if (ci < 0 || di < 0) return { ok: false, reason: "Both of you need to be on this ladder." };
    if (di >= ci) return { ok: false, reason: "You can only challenge someone above you." };
    if (useWildcard && m.byKey[cKey].wcUsed) return { ok: false, reason: "Your wild card for this league has already been used." };
    if (!useWildcard && ci - di > MAX_PLACES_UP) return { ok: false, reason: "Without a wild card you can challenge up to " + MAX_PLACES_UP + " places above you." };
    if (openFor(m, cKey)) return { ok: false, reason: "You're already in a match. Finish it first." };
    if (openFor(m, dKey)) return { ok: false, reason: m.nameOf(dKey) + " is already in a match." };
    const aw = awayFor(data, m.nameOf(dKey), t, addDays(t, 3));
    if (aw) return { ok: false, reason: m.nameOf(dKey) + " is away until " + aw.to + "." };
    for (let i = m.events.length - 1; i >= 0; i--) {
      const e = m.events[i];
      if (!e.wo && e.c === cKey && e.d === dKey && e.winner === dKey && daysBetween(e.date, t) < REMATCH_DAYS)
        return { ok: false, reason: "You can challenge " + m.nameOf(dKey) + " again from " + addDays(e.date, REMATCH_DAYS) + "." };
    }
    return { ok: true, model: m };
  }

  return { SEASON_START: SEASON_START, SEASON_END: SEASON_END, LEAGUES: LEAGUES, VENUES: VENUES, REPLY_HOURS: REPLY_HOURS, MAX_PLACES_UP: MAX_PLACES_UP,
    ymd: ymd, addDays: addDays, daysBetween: daysBetween, norm: norm, pDate: pDate, rows: rows, members: members, milestone: milestone,
    readSets: readSets, model: model, awayFor: awayFor, openFor: openFor, checkChallenge: checkChallenge };
})();
if (typeof module !== "undefined" && module.exports) module.exports = LadderCore;
