/* MTC Ladder Leagues web app. Needs ladder-core.js loaded first. */

/* ---------- settings: edit these ---------- */
const CONFIG = {
  // The Web app URL from Apps Script (Deploy > Manage deployments). Ends in /exec.
  API_URL: "https://script.google.com/macros/s/AKfycbxP-QY-0Yq7GTOBNEUfGrRClag7v_Uwk_do0eNTtuzjKzYZtH329VNmVKWcjCY9Z1IB/exec",
  CLUB_EMAIL: "tennisatmenheniot@gmail.com",
  CLUB_URL: "https://clubspark.lta.org.uk/MenheniotTennisClub",
  // Court booking pages. Leave "" to fall back to CLUB_URL.
  BOOKING_URLS: { Menheniot: "", Liskeard: "" },
  REFRESH_SECONDS: 60
};

/* ---------- helpers ---------- */
const C = LadderCore;
const S = { data: null, league: C.LEAGUES[0], me: null, loading: false };
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => C.ymd(new Date());
const fmt = s => s ? new Date(s + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "";
const fmtDT = d => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const slug = s => s.toLowerCase().replace(/[^a-z]+/g, "");
const waShare = text => "https://wa.me/?text=" + encodeURIComponent(text);
function waTo(mobile, text) {
  let n = String(mobile || "").replace(/[^\d+]/g, "");
  if (!n) return "";
  if (n[0] === "+") n = n.slice(1); else if (n.indexOf("00") === 0) n = n.slice(2); else if (n[0] === "0") n = "44" + n.slice(1);
  return "https://wa.me/" + n + "?text=" + encodeURIComponent(text);
}
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function recall(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function toast(text, bad) {
  const t = $("toast"); t.textContent = text; t.className = "toast" + (bad ? " err" : ""); t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 4500);
}
const isMine = (m, key) => !!S.me && C.members(m.nameOf(key)).indexOf(C.norm(S.me.name)) >= 0;

/* ---------- talking to the Google Sheet ---------- */
async function load() {
  if (CONFIG.API_URL.indexOf("http") !== 0) { $("status").textContent = "Set API_URL in app.js to your Apps Script web app address."; render(); return; }
  try {
    const r = await fetch(CONFIG.API_URL + "?t=" + Date.now(), { cache: "no-store" });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Couldn't load the leagues.");
    S.data = j;
    $("status").textContent = "Live from the club sheet · checked " + fmtDT(new Date());
  } catch (e) {
    $("status").textContent = "Couldn't reach the club sheet just now. Showing the last results loaded.";
  }
  render();
}
async function api(action, payload) {
  if (S.loading) return null;
  S.loading = true; document.body.classList.add("loading");
  try {
    const body = Object.assign({ action: action, name: S.me && S.me.name, pin: S.me && S.me.pin }, payload || {});
    // text/plain avoids a CORS preflight, which Apps Script can't answer.
    const r = await fetch(CONFIG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Something went wrong.");
    if (j.message) toast(j.message);
    return j;
  } catch (e) {
    toast(e.message || "Couldn't save. Check your connection and try again.", true);
    return null;
  } finally {
    S.loading = false; document.body.classList.remove("loading");
  }
}

/* ---------- keep typed values when the page refreshes ---------- */
function keepForm() {
  const k = {}, f = document.activeElement && document.activeElement.id;
  document.querySelectorAll("input[id],select[id]").forEach(e => { if (e.id === "avFrom" || e.id === "avTo") return; k[e.id] = e.type === "checkbox" ? e.checked : e.value; });
  return { k: k, f: f };
}
function restoreForm(s) {
  Object.keys(s.k).forEach(id => {
    const e = $(id); if (!e) return;
    if (e.type === "checkbox") e.checked = s.k[id];
    else if (e.tagName !== "SELECT" || Array.prototype.some.call(e.options, o => o.value === s.k[id])) e.value = s.k[id];
  });
  if (s.f && $(s.f)) $(s.f).focus();
}

/* ---------- render ---------- */
function render() {
  const kept = keepForm(), t = today();
  if (t < C.SEASON_START) { $("sDays").textContent = C.daysBetween(t, C.SEASON_START); $("sDaysLbl").textContent = "Days to start"; }
  else if (t <= C.SEASON_END) { $("sDays").textContent = C.daysBetween(t, C.SEASON_END); $("sDaysLbl").textContent = "Days left"; }
  else { $("sDays").textContent = "0"; $("sDaysLbl").textContent = "Season over"; }

  const all = C.LEAGUES.map(l => ({ l: l, m: C.model(S.data, l) }));
  $("sPlayers").textContent = all.reduce((a, x) => a + x.m.order.length, 0);
  $("sPlayed").textContent = all.reduce((a, x) => a + x.m.events.length, 0);
  $("tabs").innerHTML = all.map(x => `<button class="tab" role="tab" data-league="${esc(x.l)}" aria-selected="${x.l === S.league}">${esc(x.l)}<small>${x.m.order.length}</small></button>`).join("");

  const M = all.filter(x => x.l === S.league)[0].m;
  renderWho();
  renderStandings(M);
  renderMine(M);
  renderOpen(M);
  renderAway();
  renderResults(M);
  renderBadges(M);
  $("footer").innerHTML = `<span>Court bookings and questions: <a href="${esc(CONFIG.CLUB_URL)}" target="_blank" rel="noopener">Menheniot Tennis Club</a></span><span style="user-select:all">${esc(CONFIG.CLUB_EMAIL)}</span>`;
  restoreForm(kept);
}

function renderWho() {
  const w = $("whobar");
  if (S.me) { w.innerHTML = `<span>Signed in as <strong>${esc(S.me.name)}</strong></span><button class="small" data-act="signout">Sign out</button>`; return; }
  const names = ((S.data && S.data.players) || []).slice().sort((a, b) => a.localeCompare(b));
  w.innerHTML = `<form class="signin" data-form="signin">
    <label for="siName">Your name<select id="siName"><option value="">Choose your name</option>${names.map(n => `<option>${esc(n)}</option>`).join("")}</select></label>
    <label for="siPin">PIN<input id="siPin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8"></label>
    <button class="primary" type="submit">Sign in</button>
    <span class="note">Sign in to challenge, reply, enter scores and log holidays. Your PIN comes from the organiser.</span></form>`;
}

function renderStandings(M) {
  const t = today(), from = $("avFrom").value || t, to = $("avTo").value || C.addDays(t, 14), doubles = /doubles/i.test(S.league);
  const cur = M.gs.filter(g => g.current)[0];
  const icons = k => {
    const s = M.st[k] || {}; let h = "";
    if (s.streak >= 3) h += `<span title="${s.streak} wins in a row">🔥</span>`;
    if (cur && cur.who.indexOf(k) >= 0) h += `<span title="Giant Slayer this month: up ${cur.climb}">🗡️</span>`;
    if (M.ww && M.ww.who.indexOf(k) >= 0) h += `<span title="Weekend Warrior">⚡</span>`;
    if (M.iw && M.iw.who.indexOf(k) >= 0) h += `<span title="Iron Wall">🧱</span>`;
    const ms = C.milestone(s.played || 0); if (ms) h += `<span class="pill" title="${s.played} matches played">🎾${ms}</span>`;
    if (M.byKey[k] && M.byKey[k].wcUsed) h += `<span class="pill" title="Wild card used">WC used</span>`;
    return h;
  };
  if (!M.order.length) {
    $("standings").innerHTML = `<div class="empty"><strong>No ${doubles ? "pairs" : "players"} yet</strong>The organiser adds entries on the Ladders tab of the club sheet.</div>`;
  } else {
    $("standings").innerHTML = `<table><thead><tr><th class="num">Pos</th><th>${doubles ? "Pair" : "Player"}</th><th>Status</th><th class="num">W</th><th class="num">L</th><th class="num">Played</th><th class="num">High</th><th class="num">Low</th><th class="num">Avg</th></tr></thead><tbody>` +
      M.order.map((k, i) => {
        const s = M.st[k], aw = C.awayFor(S.data, M.nameOf(k), from, to), b = C.openFor(M, k);
        const status = aw ? `<span class="chip away">Away ${esc(fmt(aw.from))}–${esc(fmt(aw.to))}</span>` : b ? `<span class="chip open">${b.accepted ? "Match arranged" : "Challenged"}</span>` : `<span class="chip free">Available</span>`;
        return `<tr class="${i === 0 ? "top " : ""}${aw ? "out " : ""}${isMine(M, k) ? "me" : ""}"><td class="rank">${i + 1}</td><td><div class="name"><strong>${esc(M.nameOf(k))}</strong>${icons(k)}</div></td><td>${status}</td><td class="num">${s.w}</td><td class="num">${s.l}</td><td class="num">${s.played}</td><td class="num">${s.hi}</td><td class="num">${s.lo}</td><td class="num">${s.avg == null ? "–" : s.avg.toFixed(1)}</td></tr>`;
      }).join("") + `</tbody></table>`;
  }
  $("legend").innerHTML = `<span>🔥 3+ wins in a row</span><span>🗡️ Giant Slayer: biggest climb this month</span><span>⚡ Weekend Warrior</span><span>🧱 Iron Wall</span><span>🎾 Matches played (1, 3, 5, 10, 15…)</span><span>Status shows availability ${esc(fmt(from))} to ${esc(fmt(to))}</span>`;
}

function renderMine(M) {
  const box = $("mine"), t = today();
  if (!S.me) { box.innerHTML = `<p class="note">Sign in at the top to make challenges, reply, enter scores and log when you're away.</p>`; return; }
  const mine = M.order.filter(k => isMine(M, k));
  let h = "";
  if (!mine.length) h += `<p class="note">You're not in the ${esc(S.league)} league. Pick another tab, or ask the organiser to add you.</p>`;
  mine.forEach(k => {
    const pos = M.order.indexOf(k) + 1, o = C.openFor(M, k), wcLeft = !(M.byKey[k] && M.byKey[k].wcUsed);
    h += `<h3>${esc(M.nameOf(k))} · position ${pos}</h3>`;
    if (o) h += myMatch(M, o, k);
    else if (pos === 1) h += `<p class="note">You're top of the ladder. Defend your place!</p>`;
    else if (t < C.SEASON_START) h += `<p class="note">Challenges open on Sunday 1 November.</p>`;
    else if (t > C.SEASON_END) h += `<p class="note">The season has finished.</p>`;
    else {
      const wcId = "wc-" + slug(k), useWc = $(wcId) ? $(wcId).checked && wcLeft : false;
      const opts = [];
      for (let j = 0; j < pos - 1; j++) {
        const d = M.order[j];
        if (!useWc && pos - 1 - j > C.MAX_PLACES_UP) continue;
        const v = C.checkChallenge(S.data, S.league, k, d, useWc);
        opts.push(`<option value="${esc(d)}" ${v.ok ? "" : "disabled"}>${j + 1}. ${esc(M.nameOf(d))}${v.ok ? "" : " (" + esc(v.reason.replace(/\.$/, "")) + ")"}</option>`);
      }
      h += `<div class="row"><label for="ch-${slug(k)}">Challenge<select id="ch-${slug(k)}"><option value="">Choose opponent</option>${opts.join("")}</select></label>
        <button class="primary" data-act="challenge" data-entry="${esc(k)}">Send challenge</button></div>
        <label class="inline" for="${wcId}"><input type="checkbox" id="${wcId}" data-act="rerender" ${wcLeft ? "" : "disabled"}> Use my wild card (challenge anyone above) ${wcLeft ? "" : "· already used"}</label>`;
    }
  });
  // availability
  const myAway = C.rows(S.data, "availability").map(x => ({ row: x.row, key: C.norm(x.r[0]), from: C.pDate(x.r[1]), to: C.pDate(x.r[2]), why: String(x.r[3] || "") }))
    .filter(a => a.key === C.norm(S.me.name) && a.to && a.to >= t);
  h += `<h3>When I'm away</h3><div class="list panel">${myAway.length ? myAway.map(a => `<div><span><strong>${esc(fmt(a.from))} – ${esc(fmt(a.to))}</strong> · ${esc(a.why || "Away")}</span><button class="small danger" data-act="removeAway" data-row="${a.row}">Remove</button></div>`).join("") : `<div><span class="note">No dates logged.</span></div>`}</div>
    <div class="row"><label for="awFrom">Away from<input type="date" id="awFrom" min="${t}"></label><label for="awTo">Back on<input type="date" id="awTo" min="${t}"></label>
    <label for="awWhy">Reason<select id="awWhy"><option>Holiday</option><option>Injury</option><option>Other</option></select></label><button class="primary" data-act="away">Add dates</button></div>`;
  box.innerHTML = h;
}

function myMatch(M, o, k) {
  const t = today(), meC = o.c === k, opp = meC ? o.d : o.c, C1 = M.nameOf(o.c), D1 = M.nameOf(o.d);
  let h = `<div class="panel card mine"><div class="vs"><strong>${esc(C1)}</strong><span class="note">challenged</span><strong>${esc(D1)}</strong>${o.wc ? '<span class="pill">Wild card</span>' : ""}</div>`;
  if (!o.accepted) {
    h += `<div class="due">Reply by <b>${esc(fmtDT(o.replyBy))}</b></div>`;
    if (!meC) {
      h += `<div class="row"><label for="ad-${o.row}">Match date<input type="date" id="ad-${o.row}" min="${t}" value="${C.addDays(t, 3)}"></label>
        <label for="at-${o.row}">Time<input type="time" id="at-${o.row}" value="18:00"></label>
        <label for="av-${o.row}">Venue<select id="av-${o.row}">${C.VENUES.map(v => `<option>${esc(v)}</option>`).join("")}</select></label>
        <button class="primary" data-act="accept" data-row="${o.row}">Accept challenge</button></div>`;
    } else h += `<p class="note">Waiting for ${esc(D1)} to reply.</p><div><button class="link small" data-act="withdraw" data-row="${o.row}">Withdraw challenge</button></div>`;
  } else {
    const link = CONFIG.BOOKING_URLS[o.venue] || CONFIG.CLUB_URL;
    h += `<div class="due">${esc(fmt(o.matchDate))}${o.matchTime ? " at " + esc(o.matchTime) : ""} · ${esc(o.venue)}</div>
      <div class="copyline"><a class="btn" href="${esc(link)}" target="_blank" rel="noopener">Book the court</a></div>`;
    if (meC && o.matchDate && o.matchDate <= t) h += scoreForm(o, C1, D1);
    else if (meC) h += `<p class="note">The score form opens here on match day.</p>`;
    else if (o.matchDate <= t) h += `<p class="note">Waiting for ${esc(C1)} to enter the score.</p>`;
  }
  h += `<div class="copyline"><button class="small" data-act="contact" data-row="${o.row}">Message ${esc(M.nameOf(opp))} on WhatsApp</button><span id="ct-${o.row}"></span></div></div>`;
  return h;
}

function scoreForm(o, C1, D1) {
  const opt = `<option value="">–</option>` + [0, 1, 2, 3, 4].map(n => `<option>${n}</option>`).join("");
  let rows = `<span></span><span class="hd">${esc(C1)}</span><span class="hd">${esc(D1)}</span>`;
  for (let i = 0; i < 3; i++) rows += `<span>Set ${i + 1}</span><select id="sc-${o.row}-${i}-c" aria-label="Set ${i + 1} ${esc(C1)}">${opt}</select><select id="sc-${o.row}-${i}-d" aria-label="Set ${i + 1} ${esc(D1)}">${opt}</select>`;
  return `<div class="msg good">Match day has arrived. Please enter the score.</div><div class="sets">${rows}</div>
    <p class="note">Fast4: a set ends 4–0, 4–1, 4–2, or 4–3 after the tie-break. Leave set 3 blank if it wasn't needed.</p>
    <div class="row"><label for="sp-${o.row}">Played on<input type="date" id="sp-${o.row}" value="${o.matchDate <= today() ? o.matchDate : today()}" max="${today()}"></label>
    <button class="primary" data-act="score" data-row="${o.row}">Save score</button></div>`;
}

function renderOpen(M) {
  const now = new Date(), t = today();
  $("openList").innerHTML = M.open.length ? M.open.map(o => {
    const C1 = M.nameOf(o.c), D1 = M.nameOf(o.d); let body;
    if (!o.accepted) {
      const hrs = Math.max(1, Math.ceil((o.replyBy - now) / 36e5));
      body = `<div class="due">Challenged ${esc(fmtDT(o.issued))} · reply by <b>${esc(fmtDT(o.replyBy))}</b> · ${hrs} hours left</div>
        <div class="copyline"><a class="btn wa" href="${esc(waShare("MTC " + S.league + " ladder: " + C1 + " has challenged " + D1 + ". " + D1 + ", please accept and pick a date by " + fmtDT(o.replyBy) + ", or " + C1 + " gets the win."))}" target="_blank" rel="noopener">Share reminder on WhatsApp</a></div>`;
    } else {
      body = `<div class="due">${o.matchDate ? esc(fmt(o.matchDate)) : "Date to be fixed"}${o.matchTime ? " at " + esc(o.matchTime) : ""}${o.venue ? " · " + esc(o.venue) : ""}</div>` +
        (o.matchDate && o.matchDate <= t ? `<div class="note">Waiting for ${esc(C1)} to enter the score.</div>` : "");
    }
    return `<div class="card ${isMine(M, o.c) || isMine(M, o.d) ? "mine" : ""}"><div class="vs"><strong>${esc(C1)}</strong><span class="note">challenged</span><strong>${esc(D1)}</strong>${o.wc ? '<span class="pill">Wild card</span>' : ""}</div>${body}</div>`;
  }).join("") : `<div class="empty"><strong>No matches in progress</strong>New challenges appear here.</div>`;
}

function renderAway() {
  const t = today();
  const aw = C.rows(S.data, "availability").map(x => ({ name: String(x.r[0] || "").trim(), from: C.pDate(x.r[1]), to: C.pDate(x.r[2]), why: String(x.r[3] || "").trim() }))
    .filter(a => a.name && a.to && a.to >= t).sort((a, b) => a.from < b.from ? -1 : 1);
  $("awayList").innerHTML = aw.length ? `<div class="list">${aw.map(a => `<div><strong>${esc(a.name)}</strong><span class="note">${esc(fmt(a.from))} – ${esc(fmt(a.to))}${a.why ? " · " + esc(a.why) : ""}</span></div>`).join("")}</div>` : `<div class="empty"><strong>Everyone's available</strong>Holidays and injuries show here.</div>`;
}

function renderResults(M) {
  const ev = M.events.slice().reverse();
  $("results").innerHTML = ev.length ? `<table><thead><tr><th>Played</th><th>Winner</th><th>Beat</th><th>Score</th><th>Ladder</th></tr></thead><tbody>` + ev.map(e => {
    const lo = e.winner === e.c ? e.d : e.c;
    const score = e.wo ? (e.auto ? "Walkover (no reply in 72h)" : "Walkover") : e.sets.map(s => e.winner === e.c ? s[0] + "–" + s[1] : s[1] + "–" + s[0]).join(", ");
    const moved = e.winner === e.c ? (e.newRank ? esc(M.nameOf(e.winner)) + " up to " + e.newRank : "No change") : "Defended";
    return `<tr><td>${esc(fmt(e.date))}</td><td>${esc(M.nameOf(e.winner))}</td><td>${esc(M.nameOf(lo))}</td><td>${esc(score)}</td><td>${moved}</td></tr>`;
  }).join("") + `</tbody></table>` : `<div class="empty"><strong>No results yet</strong>Results appear here once the challenger enters the score.</div>`;
}

function renderBadges(M) {
  const names = w => w.map(k => esc(M.nameOf(k))).join(", "), cur = M.gs.filter(g => g.current)[0], past = M.gs.filter(g => !g.current);
  const hot = Object.keys(M.st).filter(k => M.st[k].streak >= 3);
  $("badges").innerHTML = `
  <div class="badge"><div class="ic">🗡️</div><div><b>Giant Slayer${cur ? " · " + cur.label : ""}</b><p>${cur && cur.who.length ? names(cur.who) + ", up " + cur.climb + " place" + (cur.climb > 1 ? "s" : "") : "Biggest climb of the month. Awarded from November."}</p>${past.length ? `<p>${past.map(g => g.label + ": " + (g.who.length ? names(g.who) + " (+" + g.climb + ")" : "none")).join(" · ")}</p>` : ""}</div></div>
  <div class="badge"><div class="ic">⚡</div><div><b>Weekend Warrior</b><p>${M.ww ? names(M.ww.who) + ", " + M.ww.n + " matches in one weekend" : "Most matches played in a single weekend (at least two)."}</p></div></div>
  <div class="badge"><div class="ic">🧱</div><div><b>Iron Wall</b><p>${M.iw ? names(M.iw.who) + ", " + M.iw.n + " successful defence" + (M.iw.n > 1 ? "s" : "") : "Most challenges successfully defended."}</p></div></div>
  <div class="badge"><div class="ic">🔥</div><div><b>On fire</b><p>${hot.length ? hot.map(k => esc(M.nameOf(k)) + " (" + M.st[k].streak + ")").join(", ") : "Win three matches in a row."}</p></div></div>
  <div class="badge"><div class="ic">🎾</div><div><b>Matches played</b><p>Milestones at 1, 3, 5, 10, 15, 20 and every five after. Walkovers don't count.</p></div></div>`;
}

/* ---------- actions ---------- */
async function afterSave(j) { if (j) await load(); }
const actions = {
  signout: () => { S.me = null; store("me", null); render(); },
  rerender: () => render(),
  challenge: async el => {
    const k = el.dataset.entry, d = $("ch-" + slug(k)).value, wcEl = $("wc-" + slug(k));
    if (!d) return toast("Choose who to challenge.", true);
    afterSave(await api("challenge", { league: S.league, challenger: k, defender: d, wildcard: !!(wcEl && wcEl.checked) }));
  },
  accept: async el => {
    const r = el.dataset.row;
    afterSave(await api("accept", { league: S.league, row: +r, matchDate: $("ad-" + r).value, matchTime: $("at-" + r).value, venue: $("av-" + r).value }));
  },
  withdraw: async el => afterSave(await api("withdraw", { league: S.league, row: +el.dataset.row })),
  score: async el => {
    const r = el.dataset.row, sets = [0, 1, 2].map(i => [$(`sc-${r}-${i}-c`).value, $(`sc-${r}-${i}-d`).value]);
    const chk = C.readSets(sets); if (chk.error) return toast(chk.error, true);
    afterSave(await api("score", { league: S.league, row: +r, sets: sets, playedOn: $("sp-" + r).value }));
  },
  away: async () => {
    const f = $("awFrom").value, t = $("awTo").value;
    if (!f || !t) return toast("Choose both dates.", true);
    if (t < f) return toast("The return date is before the start date.", true);
    afterSave(await api("away", { from: f, to: t, reason: $("awWhy").value }));
  },
  removeAway: async el => afterSave(await api("removeAway", { row: +el.dataset.row })),
  contact: async el => {
    const r = el.dataset.row, j = await api("contact", { league: S.league, row: +r });
    if (!j) return;
    const slot = $("ct-" + r);
    slot.innerHTML = (j.contacts || []).map(c => c.mobile ? `<a class="btn wa" href="${esc(waTo(c.mobile, "Hi " + c.name.split(" ")[0] + ", it's " + S.me.name + " about our MTC ladder match."))}" target="_blank" rel="noopener">WhatsApp ${esc(c.name)}</a> <span class="note" style="user-select:all">${esc(c.mobile)}</span>` : `<span class="note">No number saved for ${esc(c.name)}.</span>`).join(" ") || `<span class="note">No numbers saved.</span>`;
  }
};
document.addEventListener("click", e => {
  const tab = e.target.closest("[data-league]");
  if (tab) { S.league = tab.dataset.league; try { history.replaceState(null, "", "#" + slug(S.league)); } catch (x) {} render(); return; }
  const b = e.target.closest("button[data-act]");
  if (b && actions[b.dataset.act]) { e.preventDefault(); actions[b.dataset.act](b); }
});
document.addEventListener("change", e => { if (e.target.dataset && e.target.dataset.act === "rerender") actions.rerender(e.target); });
document.addEventListener("submit", async e => {
  if (e.target.dataset.form !== "signin") return;
  e.preventDefault();
  const name = $("siName").value, pin = $("siPin").value.trim();
  if (!name || !pin) return toast("Choose your name and enter your PIN.", true);
  S.me = { name: name, pin: pin };
  const j = await api("login", {});
  if (j) { S.me = { name: j.name, pin: pin }; store("me", S.me); toast("Welcome, " + j.name.split(" ")[0] + "!"); }
  else S.me = null;
  render();
});
$("avFrom").addEventListener("change", render);
$("avTo").addEventListener("change", render);

/* ---------- start ---------- */
(function start() {
  const t = today(); $("avFrom").value = t; $("avTo").value = C.addDays(t, 14);
  const h = (location.hash || "").slice(1), hit = C.LEAGUES.filter(l => slug(l) === h)[0];
  if (hit) S.league = hit;
  S.me = recall("me");
  render();
  load();
  setInterval(() => { if (!document.hidden && !S.loading) load(); }, CONFIG.REFRESH_SECONDS * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
