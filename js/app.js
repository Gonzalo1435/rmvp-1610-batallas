import { t, getLang, setLang } from "./i18n.js";
import { ALLIANCE } from "./config.js";
import { store, db, initStore, onAuthChange, signInGoogle, signOutUser, claimFirstAdmin, saveAdmins } from "./store.js";
import { EVENT_TYPES, suggestRole } from "./eventTypes.js";
import { SEED_MEMBERS } from "./seed.js";
import { CANYON_STRATEGY } from "./strategy.js";

/* ---------------- state & helpers ---------------- */
const S = {
  ready: false,
  members: [], events: [], maps: {}, players: {}, playersEventId: null, unsubPlayers: null,
  admins: [],
  ui: { mapTeam: "all", selObj: null, rolesContact: "", onlyPending: false, memberSearch: "",
        showNewEvent: false, editMember: null, showAllPool: false },
};
const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const L = (o) => (o ? o[getLang()] || o.es || o.name || "" : "");
const fmtP = (p) => (Number(p) || 0).toFixed(1) + "M";
const byPower = (a, b) => (b.power || 0) - (a.power || 0);
const isAdmin = () => store.isAdmin;
const memberById = (id) => S.members.find((m) => m.id === id);
const pl = (id) => S.players[id] || {};
const slug = (s) => (s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "m") + "-" + Math.random().toString(36).slice(2, 6);

function toast(msg, bad = false) {
  const el = document.createElement("div");
  el.className = "toast" + (bad ? " bad" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
async function safe(fn) {
  try { await fn(); } catch (e) { console.error(e); toast(t("saveError") + ": " + (e.message || e), true); }
}

/* ---------------- routing ---------------- */
function route() {
  const h = location.hash.replace(/^#\/?/, "").split("/");
  if (h[0] === "members") return { page: "members" };
  if (h[0] === "event" && h[1]) return { page: "event", id: decodeURIComponent(h[1]), tab: h[2] || "signup" };
  return { page: "events" };
}
window.addEventListener("hashchange", () => { S.ui.selObj = null; ensurePlayers(); render(true); });

function ensurePlayers() {
  const r = route();
  const id = r.page === "event" ? r.id : null;
  if (id === S.playersEventId) return;
  S.unsubPlayers?.(); S.unsubPlayers = null; S.players = {}; S.playersEventId = id;
  if (id) {
    S.unsubPlayers = db.subscribe(`events/${id}/players`, (docs) => {
      S.players = Object.fromEntries(docs.map((d) => [d.id, d]));
      render();
    });
  }
}

/* ---------------- render ---------------- */
let pending = false;
function render(force = false) {
  const ae = document.activeElement;
  if (!force && ae && app.contains(ae) && ae.matches("[data-keep]")) { pending = true; return; }
  pending = false;
  const r = route();
  let main = "";
  if (!S.ready) main = `<div class="loading">…</div>`;
  else if (r.page === "members") main = viewMembers();
  else if (r.page === "event") main = viewEvent(r);
  else main = viewEvents();
  app.innerHTML = viewHeader(r) + (store.mode === "demo" ? viewDemoBanner() : "") +
    (store.error ? `<div class="banner bad">${esc(store.error)}</div>` : "") + `<main>${main}</main>`;
  if (r.page === "event" && r.tab === "map") { applyMapBg(r.id); attachMapDrag(r.id); }
}
app.addEventListener("focusout", () => setTimeout(() => { if (pending) render(); }, 0));

function viewHeader(r) {
  const nav = (href, label, on) => `<a href="${href}" class="${on ? "on" : ""}">${label}</a>`;
  let auth = "";
  if (store.mode === "demo") auth = `<span class="badge gold">Demo · ${t("admin")}</span>`;
  else if (!store.user || store.user.anonymous) auth = `<button class="btn sm" data-action="login">${t("loginR4")}</button>`;
  else {
    auth = `<span class="who">${esc(store.user.name)}</span>
      <span class="badge ${isAdmin() ? "gold" : ""}">${isAdmin() ? t("admin") : t("viewer")}</span>
      ${!isAdmin() && !store.adminsExist ? `<button class="btn sm gold" data-action="claim">${t("claimAdmin")}</button>` : ""}
      <button class="btn sm ghost" data-action="logout">${t("logout")}</button>`;
  }
  return `<header>
    <div class="brand"><span class="logo">⚔️</span><div><b>${esc(ALLIANCE.name)} · ${esc(ALLIANCE.server)}</b><small>${t("appTitle")}</small></div></div>
    <nav>${nav("#/events", t("events"), r.page !== "members")}${nav("#/members", t("members"), r.page === "members")}</nav>
    <div class="hdr-right"><button class="btn sm ghost" data-action="lang">${getLang() === "es" ? "EN" : "ES"}</button>${auth}</div>
  </header>`;
}
function viewDemoBanner() {
  return `<div class="banner">${t("demoBanner")} <button class="btn sm ghost" data-action="resetDemo">${t("resetDemo")}</button></div>`;
}

/* ---------------- events list ---------------- */
function viewEvents() {
  const evs = [...S.events].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
  const form = S.ui.showNewEvent ? `
    <form class="card form" data-submit="createEvent">
      <div class="grid2">
        <label>${t("type")}<select name="type" data-change="newType">
          ${Object.keys(EVENT_TYPES).map((k) => `<option value="${k}">${EVENT_TYPES[k].icon} ${t("t_" + k)}</option>`).join("")}
        </select></label>
        <label>${t("title")}<input name="title" data-keep required value="${esc(t("t_svs"))}"></label>
        <label>${t("date")}<input type="date" name="date" data-keep></label>
        <label>${t("time")}<input type="time" name="time" data-keep></label>
        <label>${t("enemy")}<input name="enemy" data-keep></label>
      </div>
      <div class="grid2 canyon-only" hidden>${factionFields()}</div>
      <div class="row"><button class="btn gold">${t("create")}</button><button type="button" class="btn ghost" data-action="toggleNewEvent">${t("cancel")}</button></div>
    </form>` : "";
  return `
    <div class="pagehead"><h1>${t("events")}</h1>
      ${isAdmin() && !S.ui.showNewEvent ? `<button class="btn gold" data-action="toggleNewEvent">+ ${t("newEvent")}</button>` : ""}</div>
    ${form}
    ${isAdmin() && !S.members.length ? `<div class="card"><button class="btn gold" data-action="seed">${t("seed")}</button></div>` : ""}
    <div class="cards">
      ${evs.length ? evs.map((e) => `
        <a class="card event-card t-${esc(e.type)}" href="#/event/${encodeURIComponent(e.id)}/signup">
          <div class="ev-icon">${EVENT_TYPES[e.type]?.icon || "📅"}</div>
          <div><div class="ev-type">${t("t_" + e.type)}</div><h3>${esc(e.title)}</h3>
          <div class="muted">${esc(e.date || "")} ${esc(e.time || "")}${e.enemy ? " · vs " + esc(e.enemy) : ""}</div>${factionChip(e)}</div>
        </a>`).join("") : `<p class="muted">${t("noEvents")}</p>`}
    </div>`;
}

/* ---------------- event page ---------------- */
function currentEvent(id) { return S.events.find((e) => e.id === id); }
function viewEvent(r) {
  const ev = currentEvent(r.id);
  if (!ev) return `<p class="muted">…</p><a href="#/events">${t("back")}</a>`;
  const tabs = [["signup", t("signup")]];
  if ((ev.teams || []).length) tabs.push(["teams", t("teams")]);
  tabs.push(["map", t("map")]);
  if (ev.type === "svs") tabs.push(["roles", t("roles")]);
  if (ev.type === "canyon") tabs.push(["strategy", t("strategy")]);
  if (isAdmin()) tabs.push(["settings", t("settings")]);
  const tab = tabs.some(([k]) => k === r.tab) ? r.tab : "signup";
  const body = { signup: viewSignup, teams: viewTeams, map: viewMap, roles: viewRoles, strategy: viewStrategy, settings: viewSettings }[tab](ev);
  return `
    <div class="pagehead"><a class="back" href="#/events">← ${t("events")}</a></div>
    <div class="event-hero t-${esc(ev.type)}">
      <div class="ev-icon big">${EVENT_TYPES[ev.type]?.icon || "📅"}</div>
      <div><div class="ev-type">${t("t_" + ev.type)}</div><h1>${esc(ev.title)}</h1>
      <div class="muted">${esc(ev.date || "")} ${esc(ev.time || "")}${ev.enemy ? " · vs " + esc(ev.enemy) : ""}</div>
      ${factionChip(ev) ? `<div class="hero-chips">${factionChip(ev)}</div>` : ""}
      ${ev.notes ? `<p class="notes">${esc(ev.notes)}</p>` : ""}</div>
    </div>
    <div class="tabs">${tabs.map(([k, l]) => `<a href="#/event/${encodeURIComponent(ev.id)}/${k}" class="${k === tab ? "on" : ""}">${l}</a>`).join("")}</div>
    ${body}`;
}

const factionChip = (ev) => {
  if (ev.type !== "canyon" || !ev.faction) return "";
  const f = ev.faction === "rule" ? "rule" : "dawn";
  const allies = ev.ally || (ev.teams || []).filter((tm) => tm.ally).map((tm) => `${tm.ally} (${tm.id})`).join(" · ");
  const extra = f === "dawn" && allies ? ` · ${t("with")} ${esc(allies)}` : "";
  return `<span class="chip f-${f}" title="${esc(t("f_" + f + "_help"))}">${f === "rule" ? "👑" : "🌅"} ${t("f_" + f)}${extra}</span>`;
};
const factionFields = (ev = {}) => `
  <label>${t("faction")}<select name="faction">
    <option value="dawn" ${ev.faction !== "rule" ? "selected" : ""}>🌅 ${t("f_dawn")} — ${t("f_dawn_help")}</option>
    <option value="rule" ${ev.faction === "rule" ? "selected" : ""}>👑 ${t("f_rule")} — ${t("f_rule_help")}</option>
  </select></label>
  <label>${t("ally")}<input name="ally" data-keep value="${esc(ev.ally || "")}" placeholder="${t("allyHint")}"></label>`;
const statusChip = (s) => s ? `<span class="chip s-${s}">${t(s)}</span>` : `<span class="chip s-none">${t("noAnswer")}</span>`;
function prefLabel(ev, p) {
  if (!p || p === "any") return p === "any" ? t("pref_any") : "";
  if (p === "barro" || p === "guarnicion") return t("pref_" + p);
  const tm = (ev.teams || []).find((x) => x.id === p);
  return tm ? L(tm) : p;
}
function prefOptions(ev, sel) {
  const opts = ev.type === "svs"
    ? [["barro", t("pref_barro")], ["guarnicion", t("pref_guarnicion")], ["any", t("pref_any")]]
    : [...(ev.teams || []).map((tm) => [tm.id, L(tm) + (tm.time ? ` (${tm.time})` : "")]), ["any", t("pref_any")]];
  return opts.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(l)}</option>`).join("");
}

/* --- signup --- */
function viewSignup(ev) {
  const meId = localStorage.getItem("lw-me");
  const me = memberById(meId);
  const mine = me ? pl(me.id) : {};
  const counts = { yes: 0, maybe: 0, no: 0 };
  S.members.forEach((m) => { const s = pl(m.id).status; if (counts[s] != null) counts[s]++; });
  const none = S.members.length - counts.yes - counts.maybe - counts.no;
  const rows = S.members.filter((m) => pl(m.id).status)
    .sort((a, b) => ["yes", "maybe", "no"].indexOf(pl(a.id).status) - ["yes", "maybe", "no"].indexOf(pl(b.id).status) || byPower(a, b));
  return `
    <form class="card form" data-submit="saveSignup">
      <label>${t("whoAreYou")}<input name="name" list="memberlist" data-keep data-change="pickMe" placeholder="${t("pickName")}" value="${esc(me?.name || "")}" autocomplete="off" required></label>
      <datalist id="memberlist">${S.members.map((m) => `<option value="${esc(m.name)}">`).join("")}</datalist>
      <div class="lbl">${t("willYouBe")}</div>
      <div class="seg">${["yes", "maybe", "no"].map((s) => `<label class="s-${s}"><input type="radio" name="status" value="${s}" ${mine.status === s ? "checked" : ""} required><span>${t(s)}</span></label>`).join("")}</div>
      <label>${t("preference")}<select name="pref">${prefOptions(ev, mine.pref || "any")}</select></label>
      ${ev.type === "svs" ? `<p class="hint">⚔️ ${t("roleBarroHelp")}<br>🛡️ ${t("roleGuarnHelp")}</p>` : ""}
      <label>${t("note")}<input name="note" data-keep value="${esc(mine.note || "")}" maxlength="140"></label>
      <button class="btn gold">${t("saveSignup")}</button>
    </form>
    <div class="chips-row">
      <span class="chip s-yes">${t("yes")}: ${counts.yes}</span><span class="chip s-maybe">${t("maybe")}: ${counts.maybe}</span>
      <span class="chip s-no">${t("no")}: ${counts.no}</span><span class="chip s-none">${t("noAnswer")}: ${none}</span>
    </div>
    <div class="card list">
      <table><thead><tr><th>${t("name")}</th><th class="num">${t("power")}</th><th>${t("vote")}</th><th>${t("preference")}</th><th>${t("note")}</th></tr></thead>
      <tbody>${rows.map((m) => { const p = pl(m.id); return `<tr><td>${esc(m.name)} <small class="muted">${esc(m.rank)}</small></td><td class="num">${fmtP(m.power)}</td><td>${statusChip(p.status)}</td><td>${esc(prefLabel(ev, p.pref))}</td><td class="muted">${esc(p.note || "")}</td></tr>`; }).join("")}</tbody></table>
    </div>`;
}

/* --- teams --- */
function viewTeams(ev) {
  const teams = ev.teams || [];
  const inTeam = (tid, seat) => S.members.filter((m) => pl(m.id).team === tid && pl(m.id).seat === seat).sort(byPower);
  const assigned = new Set(S.members.filter((m) => pl(m.id).team).map((m) => m.id));
  let pool = S.members.filter((m) => !assigned.has(m.id) && (S.ui.showAllPool ? pl(m.id).status !== "no" : ["yes", "maybe"].includes(pl(m.id).status)));
  pool.sort((a, b) => (pl(a.id).status === "yes" ? 0 : 1) - (pl(b.id).status === "yes" ? 0 : 1) || byPower(a, b));
  const row = (m, extra) => `<li><span class="nm">${esc(m.name)}</span><span class="muted">${fmtP(m.power)}</span>${extra}</li>`;
  const teamCol = (tm) => {
    const st = inTeam(tm.id, "starter"), sb = inTeam(tm.id, "sub");
    const pw = [...st].reduce((s, m) => s + (m.power || 0), 0);
    const rm = (m) => isAdmin() ? `<button class="x" data-action="unassign" data-id="${esc(m.id)}" title="${t("remove")}">✕</button>` : "";
    return `<div class="card team">
      <h3>${esc(L(tm))}${tm.time ? ` <small>${esc(tm.time)}</small>` : ""}</h3>
      <div class="muted">${t("totalPower")}: <b>${fmtP(pw)}</b></div>
      <h4>${t("starters")} <span class="cnt ${st.length >= tm.starters ? "full" : ""}">${st.length}/${tm.starters}</span></h4>
      <ol class="plist">${st.map((m) => row(m, rm(m))).join("")}</ol>
      <h4>${t("subs")} <span class="cnt ${sb.length >= tm.subs ? "full" : ""}">${sb.length}/${tm.subs}</span></h4>
      <ol class="plist">${sb.map((m) => row(m, rm(m))).join("")}</ol>
    </div>`;
  };
  const btns = (m) => isAdmin() ? `<span class="btns">${teams.map((tm) => `<button class="mini" data-action="assign" data-id="${esc(m.id)}" data-team="${esc(tm.id)}" data-seat="starter">${esc(tm.id)}</button><button class="mini ghost" data-action="assign" data-id="${esc(m.id)}" data-team="${esc(tm.id)}" data-seat="sub">${esc(tm.id)}·S</button>`).join("")}</span>` : "";
  return `
    ${isAdmin() ? `<div class="row"><button class="btn gold" data-action="autoFill">${t("autoFill")}</button><button class="btn ghost" data-action="clearTeams">${t("clearTeams")}</button></div>` : ""}
    <div class="teams">${teams.map(teamCol).join("")}</div>
    <div class="card">
      <h3>${t("available")} <small class="muted">(${pool.length})</small></h3>
      <label class="check"><input type="checkbox" data-change="showAllPool" ${S.ui.showAllPool ? "checked" : ""}> + ${t("noAnswer")}</label>
      <ul class="plist pool">${pool.map((m) => `<li><span class="nm">${esc(m.name)}</span>${statusChip(pl(m.id).status)}<span class="muted">${fmtP(m.power)}</span><span class="muted sm">${esc(prefLabel(ev, pl(m.id).pref))}</span>${btns(m)}</li>`).join("")}</ul>
    </div>`;
}

/* --- map --- */
function mapCandidates(ev) {
  const teams = ev.teams || [];
  let list = S.members;
  if (teams.length) list = list.filter((m) => pl(m.id).team && (S.ui.mapTeam === "all" || pl(m.id).team === S.ui.mapTeam));
  else list = list.filter((m) => pl(m.id).status !== "no");
  return [...list].sort(byPower);
}
function viewMap(ev) {
  const teams = ev.teams || [];
  const cands = mapCandidates(ev);
  const candSet = new Set(cands.map((m) => m.id));
  const onObj = (oid) => S.members.filter((m) => pl(m.id).objective === oid && candSet.has(m.id)).sort(byPower);
  const sel = (ev.objectives || []).find((o) => o.id === S.ui.selObj);
  const free = cands.filter((m) => !pl(m.id).objective);
  const filters = teams.length ? `<div class="chips-row">${[["all", t("all")], ...teams.map((tm) => [tm.id, L(tm)])].map(([k, l]) => `<button class="chip ${S.ui.mapTeam === k ? "on" : ""}" data-action="mapTeam" data-k="${esc(k)}">${esc(l)}</button>`).join("")}</div>` : "";
  const panel = sel ? `<div class="card objpanel">
      <div class="row between"><h3>${esc(L(sel))}</h3><button class="x" data-action="selObj" data-id="">✕</button></div>
      <ul class="plist">${onObj(sel.id).map((m) => `<li><span class="nm">${esc(m.name)}</span><span class="muted">${fmtP(m.power)}</span>${teams.length ? `<span class="chip">${esc(pl(m.id).team)}</span>` : ""}${isAdmin() ? `<button class="x" data-action="setObj" data-id="${esc(m.id)}" data-obj="">✕</button>` : ""}</li>`).join("") || `<li class="muted">—</li>`}</ul>
      ${isAdmin() ? `<label>${t("assignTo")} ${esc(L(sel))}<select data-change="addToObj" data-obj="${esc(sel.id)}"><option value="">${free.length ? `+ … (${free.length})` : t("allAssigned")}</option>${free.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} · ${fmtP(m.power)}${teams.length ? ` · ${esc(pl(m.id).team)}` : ""}</option>`).join("")}</select></label>
      <div class="row"><button class="btn sm ghost" data-action="renameObj" data-id="${esc(sel.id)}">${t("edit")}</button><button class="btn sm danger" data-action="delObj" data-id="${esc(sel.id)}">${t("delete")}</button></div>` : ""}
    </div>` : "";
  return `
    ${filters}
    <p class="hint">${t("mapHelp")}</p>
    <div class="map t-${esc(ev.type)} ${S.maps[ev.type]?.img ? "has-bg" : ""}" id="map">
      ${(ev.objectives || []).map((o) => { const ps = onObj(o.id); return `
        <div class="obj ${S.ui.selObj === o.id ? "sel" : ""} ${ps.length ? "has" : ""}" data-obj="${esc(o.id)}" style="left:${o.x}%;top:${o.y}%">
          <div class="obj-name">${esc(L(o))}</div><div class="obj-cnt">${ps.length}</div>
          ${ps.length ? `<div class="obj-ppl">${ps.slice(0, 3).map((m) => esc(m.name)).join("<br>")}${ps.length > 3 ? "<br>+" + (ps.length - 3) : ""}</div>` : ""}
        </div>`; }).join("")}
    </div>
    ${panel}
    ${isAdmin() ? `<div class="row wrap"><button class="btn sm ghost" data-action="addObj">+ ${t("addObjective")}</button>
      <label class="btn sm ghost filebtn">🖼️ ${t("mapBg")}<input type="file" accept="image/*" data-change="mapImage" data-type="${esc(ev.type)}" hidden></label>
      ${S.maps[ev.type]?.img ? `<button class="btn sm ghost" data-action="removeMapImage" data-type="${esc(ev.type)}">${t("mapBgRemove")}</button>` : ""}</div>
      <p class="hint">${t("mapBgHelp")}</p>` : ""}
    <div class="card"><h3>${t("unassigned")} <small class="muted">(${free.length})</small></h3>
      ${isAdmin() && sel ? `<p class="hint">👆 ${t("tapToAssign")} <b>${esc(L(sel))}</b></p>` : ""}
      <div class="tags">${free.map((m) => isAdmin() && sel
        ? `<button class="tag tap" data-action="setObj" data-id="${esc(m.id)}" data-obj="${esc(sel.id)}">${esc(m.name)} <small>${fmtP(m.power)}</small></button>`
        : `<span class="tag">${esc(m.name)} <small>${fmtP(m.power)}</small></span>`).join("")}</div></div>`;
}

function applyMapBg(evId) {
  const ev = currentEvent(evId), map = document.getElementById("map");
  if (!map || !ev) return;
  const up = S.maps[ev.type];
  const def = EVENT_TYPES[ev.type]?.map;
  let src = null, w, h;
  if (up?.img && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(up.img)) ({ img: src, w, h } = up);
  else if (def) ({ src, w, h } = def);
  if (!src) return;
  map.classList.add("has-bg");
  map.style.backgroundImage = `url("${src}")`;
  if (w && h) map.style.aspectRatio = `${w} / ${h}`;
}

// Achica la imagen en el navegador para que quepa en un documento de Firestore (<1 MB).
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let max = 1400, q = 0.8, out = "", w = 0, h = 0;
      for (let i = 0; i < 8; i++) {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        w = Math.round(img.width * k); h = Math.round(img.height * k);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        out = c.toDataURL("image/jpeg", q);
        if (out.length < 850000) break;
        max = Math.round(max * 0.85); q = Math.max(0.5, q - 0.08);
      }
      URL.revokeObjectURL(img.src);
      out.length < 1000000 ? resolve({ img: out, w, h }) : reject(new Error("imagen muy grande"));
    };
    img.onerror = () => reject(new Error("no es una imagen"));
    img.src = URL.createObjectURL(file);
  });
}

function attachMapDrag(evId) {
  const map = document.getElementById("map");
  if (!map) return;
  map.querySelectorAll(".obj").forEach((node) => {
    node.addEventListener("pointerdown", (e) => {
      const id = node.dataset.obj;
      const rect = map.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY;
      let moved = false;
      if (isAdmin()) node.setPointerCapture(e.pointerId);
      const move = (ev2) => {
        if (!isAdmin()) return;
        if (Math.abs(ev2.clientX - sx) + Math.abs(ev2.clientY - sy) > 5) moved = true;
        if (!moved) return;
        const x = Math.max(4, Math.min(96, ((ev2.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(4, Math.min(96, ((ev2.clientY - rect.top) / rect.height) * 100));
        node.style.left = x + "%"; node.style.top = y + "%";
        node.dataset.nx = x.toFixed(1); node.dataset.ny = y.toFixed(1);
      };
      const up = () => {
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        if (moved) {
          const ev = currentEvent(evId);
          const objectives = (ev.objectives || []).map((o) => o.id === id ? { ...o, x: +node.dataset.nx, y: +node.dataset.ny } : o);
          safe(() => db.set("events", evId, { objectives }));
        } else { S.ui.selObj = S.ui.selObj === id ? null : id; render(true); }
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up);
    });
  });
}

/* --- SvS roles --- */
const r4s = () => S.members.filter((m) => m.rank === "R4" || m.rank === "R5").sort((a, b) => a.name.localeCompare(b.name));
function viewRoles(ev) {
  const roleOpts = [["", "—"], ["barro", t("barro")], ["guarnicion", t("guarnicion")], ["out", t("out")]];
  const cnt = { barro: 0, guarnicion: 0, out: 0 };
  S.members.forEach((m) => { const r = pl(m.id).role; if (cnt[r] != null) cnt[r]++; });
  let list = [...S.members];
  if (S.ui.rolesContact) list = list.filter((m) => (pl(m.id).contact || "") === S.ui.rolesContact);
  if (S.ui.onlyPending) list = list.filter((m) => !pl(m.id).role);
  const order = { no: 0, maybe: 1, "": 2, yes: 3 };
  list.sort((a, b) => (order[pl(a.id).status || ""] - order[pl(b.id).status || ""]) || byPower(a, b));
  const contactNames = [...new Set([...r4s().map((m) => m.name), ...S.members.map((m) => pl(m.id).contact).filter(Boolean)])];
  const sel = (m, field, opts) => isAdmin()
    ? `<select data-change="setField" data-id="${esc(m.id)}" data-field="${field}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${(pl(m.id)[field] || "") === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`
    : esc((opts.find(([v]) => v === (pl(m.id)[field] || "")) || ["", ""])[1]);
  return `
    <div class="chips-row">
      <span class="chip r-barro">⚔️ ${t("barro")}: ${cnt.barro}</span><span class="chip r-guarnicion">🛡️ ${t("guarnicion")}: ${cnt.guarnicion}</span>
      <span class="chip s-no">${t("out")}: ${cnt.out}</span><span class="chip s-none">${t("noAnswer")}: ${S.members.length - cnt.barro - cnt.guarnicion - cnt.out}</span>
    </div>
    <div class="row wrap">
      <label class="inline">${t("contact")} <select data-change="rolesContact"><option value="">${t("all")}</option>${contactNames.map((n) => `<option ${S.ui.rolesContact === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" data-change="onlyPending" ${S.ui.onlyPending ? "checked" : ""}> ${t("onlyPending")}</label>
      ${isAdmin() ? `<button class="btn sm ghost" data-action="distribute">${t("distribute")}</button>` : ""}
    </div>
    <div class="card list"><table>
      <thead><tr><th>${t("name")}</th><th class="num">${t("power")}</th><th>${t("vote")}</th><th>${t("suggested")}</th><th>${t("confirmed")}</th><th>${t("contact")}</th><th>✓</th></tr></thead>
      <tbody>${list.map((m) => { const p = pl(m.id); const sg = suggestRole(m); return `<tr>
        <td>${esc(m.name)} <small class="muted">${esc(m.rank)}</small></td><td class="num">${fmtP(m.power)}</td>
        <td>${statusChip(p.status)}${p.pref && p.pref !== "any" ? `<br><small class="muted">${esc(prefLabel(ev, p.pref))}</small>` : ""}</td>
        <td><span class="chip r-${sg}">${t(sg)}</span></td>
        <td>${sel(m, "role", roleOpts)}</td>
        <td>${sel(m, "contact", [["", "—"], ...contactNames.map((n) => [n, n])])}</td>
        <td>${isAdmin() ? `<input type="checkbox" data-change="setCheck" data-id="${esc(m.id)}" data-field="contacted" ${p.contacted ? "checked" : ""}>` : (p.contacted ? "✓" : "")}</td>
      </tr>`; }).join("")}</tbody></table></div>`;
}

/* --- strategy (Canyon) --- */
const md = (txt) => esc(txt).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
function viewStrategy(ev) {
  const C = CANYON_STRATEGY[getLang()] || CANYON_STRATEGY.es;
  const ours = ev.faction === "rule" ? "rule" : "dawn", other = ours === "rule" ? "dawn" : "rule";
  const list = (arr) => `<ul class="guide">${arr.map((x) => `<li>${md(x)}</li>`).join("")}</ul>`;
  const teamNotes = (ev.teams || []).map((tm) => {
    const st = S.members.filter((m) => pl(m.id).team === tm.id && pl(m.id).seat === "starter");
    const nSubs = S.members.filter((m) => pl(m.id).team === tm.id && pl(m.id).seat === "sub").length;
    const pw = st.reduce((a, m) => a + (m.power || 0), 0);
    const note = (nSubs >= 5 ? C.teamManySubs : C.teamFewSubs).replace("{n}", nSubs);
    return `<div class="card team-note"><h4>${esc(L(tm))}${tm.time ? ` · ${esc(tm.time)}` : ""}${tm.ally ? ` · ${t("with")} ${esc(tm.ally)}` : ""}</h4>
      <p>${md(note)}</p><p class="muted">${C.teamPower.replace("{p}", fmtP(pw))} · ${st.length} ${t("starters").toLowerCase()}</p></div>`;
  }).join("");
  const copyBox = (txt) => `<div class="copybox"><code>${esc(txt)}</code><button class="btn sm ghost" data-action="copyText" data-text="${esc(txt)}">${C.copy}</button></div>`;
  return `
    <p class="hint">ℹ️ ${esc(C.disclaimer)}</p>
    <div class="card"><h3>${esc(C.factions[ours].title)}</h3>${list(C.factions[ours].items)}</div>
    <div class="teams">${teamNotes}</div>
    <div class="card"><h3>${esc(C.pointsTitle)}</h3><div class="list"><table><tbody>
      ${C.points.map(([st, n, p, d]) => `<tr><td class="stars">${st}</td><td><b>${esc(n)}</b><br><small class="muted">${esc(d)}</small></td><td class="num"><b>${esc(p)}</b></td></tr>`).join("")}
    </tbody></table></div></div>
    <div class="card"><h3>${esc(C.timelineTitle)}</h3><ul class="guide">${C.timeline.map(([w, d]) => `<li><b>${esc(w)}</b> — ${md(d)}</li>`).join("")}</ul></div>
    <div class="card"><h3>${esc(C.rotateTitle)}</h3>${list(C.rotate)}</div>
    <div class="card"><h3>${esc(C.teleportTitle)}</h3><ul class="guide check">${C.teleport.map((x) => `<li>${md(x)}</li>`).join("")}</ul></div>
    <div class="card subs-card"><h3>${esc(C.subsTitle)}</h3>${list(C.subs)}
      <h4>${esc(C.msgTitle)}</h4>${copyBox(C.msgOut)}${copyBox(C.msgIn)}</div>
    <details class="card"><summary><b>${esc(C.factions[other].title)}</b></summary>${list(C.factions[other].items)}</details>
    <div class="card"><h3>${esc(C.basicsTitle)}</h3>${list(C.basics)}</div>`;
}

/* --- settings --- */
function viewSettings(ev) {
  if (!isAdmin()) return "";
  return `
    <form class="card form" data-submit="saveEvent">
      <div class="grid2">
        <label>${t("title")}<input name="title" data-keep value="${esc(ev.title)}" required></label>
        <label>${t("date")}<input type="date" name="date" data-keep value="${esc(ev.date || "")}"></label>
        <label>${t("time")}<input type="time" name="time" data-keep value="${esc(ev.time || "")}"></label>
        <label>${t("enemy")}<input name="enemy" data-keep value="${esc(ev.enemy || "")}"></label>
      </div>
      ${ev.type === "canyon" ? `<div class="grid2">${factionFields(ev)}</div>` : ""}
      <label>${t("notes")}<textarea name="notes" data-keep rows="3">${esc(ev.notes || "")}</textarea></label>
      ${(ev.teams || []).length || ev.type !== "svs" ? `<h3>${t("teams")} · ${t("limits")}</h3>
      <div class="teams-edit">${(ev.teams || []).map((tm, i) => `
        <div class="grid4">
          <label>${t("teamName")}<input name="tname${i}" data-keep value="${esc(L(tm))}"></label>
          <label>${t("time")}<input type="time" name="ttime${i}" data-keep value="${esc(tm.time || "")}"></label>
          <label>${t("starters")}<input type="number" min="0" max="100" name="tst${i}" data-keep value="${tm.starters}"></label>
          <label>${t("subs")}<input type="number" min="0" max="100" name="tsb${i}" data-keep value="${tm.subs}"></label>
          ${ev.type === "canyon" ? `<label class="span4">${t("teamAlly")}<input name="tally${i}" data-keep value="${esc(tm.ally || "")}" placeholder="${t("allyHint")}"></label>` : ""}
        </div>`).join("")}</div>
      <button type="button" class="btn sm ghost" data-action="addTeam">+ ${t("addTeam")}</button>` : ""}
      <div class="row"><button class="btn gold">${t("save")}</button></div>
    </form>
    <div class="card"><button class="btn danger" data-action="deleteEvent">${t("delete")} ${esc(ev.title)}</button></div>`;
}

/* ---------------- members ---------------- */
function memberRows() {
  const q = S.ui.memberSearch.trim().toLowerCase();
  const list = S.members.filter((m) => !q || m.name.toLowerCase().includes(q)).sort((a, b) => (a.rank || "").localeCompare(b.rank || "") * -1 || byPower(a, b));
  return list.map((m) => S.ui.editMember === m.id && isAdmin() ? `
    <tr class="editing"><td><input data-keep id="em-name" value="${esc(m.name)}"></td>
      <td><select id="em-rank">${["R5", "R4", "R3", "R2", "R1"].map((r) => `<option ${m.rank === r ? "selected" : ""}>${r}</option>`).join("")}</select></td>
      <td><input data-keep id="em-power" type="number" step="0.1" value="${m.power}"></td>
      <td><input data-keep id="em-level" type="number" value="${m.level}"></td>
      <td><button class="mini" data-action="saveMember" data-id="${esc(m.id)}">${t("save")}</button><button class="mini ghost" data-action="editMember" data-id="">✕</button></td></tr>` : `
    <tr><td>${esc(m.name)}</td><td><span class="chip rk-${esc(m.rank)}">${esc(m.rank)}</span></td><td class="num">${fmtP(m.power)}</td><td class="num">${esc(m.level)}</td>
      <td>${isAdmin() ? `<button class="mini ghost" data-action="editMember" data-id="${esc(m.id)}">✎</button><button class="mini danger" data-action="delMember" data-id="${esc(m.id)}">✕</button>` : ""}</td></tr>`).join("");
}
function viewMembers() {
  const admin = isAdmin();
  return `
    <div class="pagehead"><h1>${t("members")} <small class="muted">${S.members.length}</small></h1></div>
    <input class="search" id="mem-search" placeholder="${t("search")}" value="${esc(S.ui.memberSearch)}" autocomplete="off">
    <div class="card list"><table><thead><tr><th>${t("name")}</th><th>${t("rank")}</th><th class="num">${t("power")}</th><th class="num">${t("level")}</th><th></th></tr></thead>
      <tbody id="mem-body">${memberRows()}</tbody></table></div>
    ${admin ? `
    <form class="card form" data-submit="addMember"><h3>${t("addMember")}</h3>
      <div class="grid4"><label>${t("name")}<input name="name" data-keep required></label>
      <label>${t("rank")}<select name="rank">${["R3", "R4", "R5", "R2", "R1"].map((r) => `<option>${r}</option>`).join("")}</select></label>
      <label>${t("power")} (M)<input name="power" type="number" step="0.1" data-keep></label>
      <label>${t("level")}<input name="level" type="number" data-keep></label></div>
      <button class="btn gold">${t("addMember")}</button></form>
    <form class="card form" data-submit="importCsv"><h3>${t("importCsv")}</h3><p class="hint">${t("csvHelp")}</p>
      <textarea name="csv" rows="4" data-keep placeholder="Taebek, R4, 243.7, 35"></textarea><button class="btn ghost">${t("import")}</button></form>
    ${!S.members.length ? `<div class="card"><button class="btn gold" data-action="seed">${t("seed")}</button></div>` : ""}
    ${store.mode === "firebase" ? `<form class="card form" data-submit="saveAdmins"><h3>${t("adminsTitle")}</h3>
      <textarea name="emails" rows="4" data-keep>${esc(S.admins.join("\n"))}</textarea><button class="btn ghost">${t("save")}</button></form>` : ""}` : ""}`;
}

/* ---------------- actions ---------------- */
const evPath = () => `events/${route().id}/players`;
const actions = {
  lang() { setLang(getLang() === "es" ? "en" : "es"); render(true); },
  login() { safe(signInGoogle); },
  logout() { safe(signOutUser); },
  claim() { safe(claimFirstAdmin); },
  resetDemo() { if (confirm(t("confirmDelete"))) { db.resetDemo(); localStorage.removeItem("lw-demo-seeded"); location.reload(); } },
  toggleNewEvent() { S.ui.showNewEvent = !S.ui.showNewEvent; render(true); },
  seed() { safe(seedAll); },
  assign(el) { safe(() => db.set(evPath(), el.dataset.id, { team: el.dataset.team, seat: el.dataset.seat })); },
  unassign(el) { safe(() => db.set(evPath(), el.dataset.id, { team: "", seat: "", objective: "" })); },
  autoFill() { safe(autoFill); },
  clearTeams() {
    if (!confirm(t("confirmDelete"))) return;
    const items = S.members.filter((m) => pl(m.id).team).map((m) => ({ id: m.id, data: { team: "", seat: "", objective: "" } }));
    safe(() => db.setMany(evPath(), items));
  },
  mapTeam(el) { S.ui.mapTeam = el.dataset.k; render(true); },
  selObj(el) { S.ui.selObj = el.dataset.id || null; render(true); },
  setObj(el) { safe(() => db.set(evPath(), el.dataset.id, { objective: el.dataset.obj })); },
  copyText(el) {
    navigator.clipboard?.writeText(el.dataset.text).then(() => toast("✓"), () => toast(el.dataset.text));
  },
  removeMapImage(el) {
    if (!confirm(t("confirmDelete"))) return;
    safe(() => db.del("maps", el.dataset.type));
  },
  addObj() {
    const name = prompt(t("objName")); if (!name) return;
    const ev = currentEvent(route().id);
    const obj = { id: "o" + Date.now().toString(36), es: name, en: name, x: 50, y: 50 };
    S.ui.selObj = obj.id;
    safe(() => db.set("events", ev.id, { objectives: [...(ev.objectives || []), obj] }));
  },
  renameObj(el) {
    const ev = currentEvent(route().id);
    const o = ev.objectives.find((x) => x.id === el.dataset.id);
    const name = prompt(t("objName"), L(o)); if (!name) return;
    const objectives = ev.objectives.map((x) => x.id === o.id ? { ...x, [getLang()]: name } : x);
    safe(() => db.set("events", ev.id, { objectives }));
  },
  delObj(el) {
    if (!confirm(t("confirmDelete"))) return;
    const ev = currentEvent(route().id);
    const id = el.dataset.id;
    S.ui.selObj = null;
    safe(async () => {
      await db.set("events", ev.id, { objectives: ev.objectives.filter((x) => x.id !== id) });
      const items = S.members.filter((m) => pl(m.id).objective === id).map((m) => ({ id: m.id, data: { objective: "" } }));
      if (items.length) await db.setMany(evPath(), items);
    });
  },
  distribute() {
    const helpers = r4s().filter((m) => pl(m.id).status === "yes").map((m) => m.name);
    if (!helpers.length) return toast("R4 ✕", true);
    let k = 0;
    const items = S.members.filter((m) => !pl(m.id).role && !pl(m.id).contact && pl(m.id).status !== "yes" && !helpers.includes(m.name))
      .map((m) => ({ id: m.id, data: { contact: helpers[k++ % helpers.length] } }));
    safe(() => db.setMany(evPath(), items));
  },
  addTeam() {
    const ev = currentEvent(route().id);
    const teams = ev.teams || [];
    const id = String.fromCharCode(65 + teams.length);
    safe(() => db.set("events", ev.id, { teams: [...teams, { id, es: "Equipo " + id, en: "Team " + id, time: "", starters: 20, subs: 10 }] }));
  },
  deleteEvent() {
    if (!confirm(t("confirmDelete"))) return;
    const id = route().id;
    safe(async () => { await db.delCollection(`events/${id}/players`); await db.del("events", id); location.hash = "#/events"; });
  },
  editMember(el) { S.ui.editMember = el.dataset.id || null; render(true); },
  saveMember(el) {
    const v = (id) => document.getElementById(id).value;
    S.ui.editMember = null;
    safe(() => db.set("members", el.dataset.id, { name: v("em-name").trim(), rank: v("em-rank"), power: +v("em-power") || 0, level: +v("em-level") || 0 }));
  },
  delMember(el) { const m = memberById(el.dataset.id); if (confirm(`${t("delete")} ${m?.name}? ${t("confirmDelete")}`)) safe(() => db.del("members", el.dataset.id)); },
};

const changes = {
  newType(el) {
    const f = el.form;
    f.querySelector(".canyon-only").hidden = el.value !== "canyon"; if (f.title.value === "" || Object.keys(EVENT_TYPES).some((k) => f.title.value === t("t_" + k))) f.title.value = t("t_" + el.value);
  },
  pickMe(el) {
    const m = S.members.find((x) => x.name.toLowerCase() === el.value.trim().toLowerCase());
    if (!m) return;
    const p = pl(m.id), f = el.form;
    f.querySelectorAll('input[name="status"]').forEach((r) => (r.checked = r.value === p.status));
    if (p.pref) f.pref.value = p.pref;
    f.note.value = p.note || "";
  },
  mapImage(el) {
    const file = el.files?.[0]; if (!file) return;
    safe(async () => {
      const data = await shrinkImage(file);
      await db.set("maps", el.dataset.type, { ...data, updatedAt: Date.now() }, false);
      toast(t("saved"));
    });
  },
  showAllPool(el) { S.ui.showAllPool = el.checked; render(true); },
  addToObj(el) { if (el.value) safe(() => db.set(evPath(), el.value, { objective: el.dataset.obj })); },
  rolesContact(el) { S.ui.rolesContact = el.value; render(true); },
  onlyPending(el) { S.ui.onlyPending = el.checked; render(true); },
  setField(el) { safe(() => db.set(evPath(), el.dataset.id, { [el.dataset.field]: el.value })); },
  setCheck(el) { safe(() => db.set(evPath(), el.dataset.id, { [el.dataset.field]: el.checked })); },
};

const submits = {
  async createEvent(f) {
    const type = f.type.value, tpl = EVENT_TYPES[type];
    const id = await db.add("events", {
      type, title: f.title.value.trim(), date: f.date.value, time: f.time.value, enemy: f.enemy.value.trim(), notes: "",
      teams: structuredClone(tpl.teams), objectives: structuredClone(tpl.objectives), createdAt: Date.now(),
      ...(type === "canyon" ? { faction: f.faction.value, ally: f.ally.value.trim() } : {}),
    });
    S.ui.showNewEvent = false;
    location.hash = `#/event/${encodeURIComponent(id)}/signup`;
  },
  async saveSignup(f) {
    const m = S.members.find((x) => x.name.toLowerCase() === f.name.value.trim().toLowerCase());
    if (!m) { toast(t("notFound"), true); return; }
    const status = f.querySelector('input[name="status"]:checked')?.value;
    localStorage.setItem("lw-me", m.id);
    await db.set(evPath(), m.id, { status, pref: f.pref.value, note: f.note.value.trim().slice(0, 140), updatedAt: Date.now() });
    toast(t("saved"));
  },
  async saveEvent(f) {
    const ev = currentEvent(route().id);
    const teams = (ev.teams || []).map((tm, i) => ({
      ...tm, [getLang()]: f["tname" + i]?.value || L(tm), time: f["ttime" + i]?.value || "",
      starters: +f["tst" + i]?.value || 0, subs: +f["tsb" + i]?.value || 0,
      ...(f["tally" + i] ? { ally: f["tally" + i].value.trim() } : {}),
    }));
    await db.set("events", ev.id, { title: f.title.value.trim(), date: f.date.value, time: f.time.value, enemy: f.enemy.value.trim(), notes: f.notes.value.trim(), teams,
      ...(ev.type === "canyon" ? { faction: f.faction.value, ally: f.ally.value.trim() } : {}) });
    toast(t("saved"));
  },
  async addMember(f) {
    const name = f.name.value.trim(); if (!name) return;
    await db.set("members", slug(name), { name, rank: f.rank.value, power: +f.power.value || 0, level: +f.level.value || 0 });
    f.reset(); toast(t("saved"));
  },
  async importCsv(f) {
    const items = f.csv.value.split(/\r?\n/).map((l) => l.split(/[,;\t]/).map((x) => x.trim())).filter((c) => c[0])
      .map(([name, rank, power, level]) => {
        const ex = S.members.find((m) => m.name.toLowerCase() === name.toLowerCase());
        return { id: ex ? ex.id : slug(name), data: { name, rank: /^R[1-5]$/i.test(rank || "") ? rank.toUpperCase() : (ex?.rank || "R3"), power: parseFloat(power) || ex?.power || 0, level: parseInt(level) || ex?.level || 0 } };
      });
    await db.setMany("members", items);
    f.reset(); toast(`${t("saved")} (${items.length})`);
  },
  async saveAdmins(f) { await saveAdmins(f.emails.value.split(/[\s,;]+/)); await loadAdmins(); toast(t("saved")); },
};

app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (el && app.contains(el)) { e.preventDefault(); actions[el.dataset.action]?.(el, e); }
});
app.addEventListener("change", (e) => {
  const el = e.target.closest("[data-change]");
  if (el) changes[el.dataset.change]?.(el, e);
});
app.addEventListener("input", (e) => {
  if (e.target.id === "mem-search") { S.ui.memberSearch = e.target.value; document.getElementById("mem-body").innerHTML = memberRows(); }
});
app.addEventListener("submit", (e) => {
  const f = e.target.closest("form[data-submit]");
  if (!f) return;
  e.preventDefault();
  document.activeElement?.blur();
  safe(() => submits[f.dataset.submit](f));
});

/* ---------------- seed & auto-fill ---------------- */
async function seedAll() {
  await db.setMany("members", SEED_MEMBERS.map((m) => ({ id: m.id, data: { name: m.name, rank: m.rank, power: m.power, level: m.level } })));
  const tpl = EVENT_TYPES.svs;
  await db.set("events", "svs-1579", {
    type: "svs", title: "SvS vs 1579", date: "2026-11-28", time: "", enemy: "1579 (Sammyboy)", notes: "",
    teams: [], objectives: structuredClone(tpl.objectives), createdAt: Date.now(),
  }, false);
  await db.setMany("events/svs-1579/players", SEED_MEMBERS.filter((m) => m.vote || m.contact)
    .map((m) => ({ id: m.id, data: { ...(m.vote ? { status: m.vote } : {}), contact: m.contact || "" } })));
  localStorage.setItem("lw-demo-seeded", "1");
  toast(t("seedDone"));
}
async function autoFill() {
  const ev = currentEvent(route().id);
  const teams = ev.teams || [];
  const taken = new Set(S.members.filter((m) => pl(m.id).team).map((m) => m.id));
  const counts = Object.fromEntries(teams.map((tm) => [tm.id, {
    starter: S.members.filter((m) => pl(m.id).team === tm.id && pl(m.id).seat === "starter").length,
    sub: S.members.filter((m) => pl(m.id).team === tm.id && pl(m.id).seat === "sub").length }]));
  const items = [];
  const place = (status, seats) => {
    for (const tm of teams) for (const seat of seats) {
      const limit = seat === "starter" ? tm.starters : tm.subs;
      const cands = S.members.filter((m) => !taken.has(m.id) && pl(m.id).status === status && [tm.id, "any", "", undefined].includes(pl(m.id).pref))
        .sort((a, b) => (pl(b.id).pref === tm.id) - (pl(a.id).pref === tm.id) || byPower(a, b));
      for (const m of cands) {
        if (counts[tm.id][seat] >= limit) break;
        taken.add(m.id); counts[tm.id][seat]++;
        items.push({ id: m.id, data: { team: tm.id, seat } });
      }
    }
  };
  place("yes", ["starter"]); place("yes", ["sub"]); place("maybe", ["starter", "sub"]);
  if (items.length) await db.setMany(evPath(), items);
  toast(`${t("autoFill")}: ${items.length} ${t("players")}`);
}

async function loadAdmins() {
  if (store.mode !== "firebase" || !store.isAdmin) return;
  try { S.admins = (await db.getAdmins())?.emails || []; } catch { S.admins = []; }
}

/* ---------------- boot ---------------- */
(async function boot() {
  render(true);
  try { await initStore(); } catch (e) { console.error(e); store.error = e.message; }
  onAuthChange(() => { loadAdmins().then(() => render()); });
  let gotMembers = false;
  db.subscribe("members", async (docs) => {
    S.members = docs; S.ready = true;
    if (!gotMembers) {
      gotMembers = true;
      if (store.mode === "demo" && !docs.length && !localStorage.getItem("lw-demo-seeded")) await seedAll();
    }
    render();
  });
  db.subscribe("events", (docs) => { S.events = docs; render(); });
  db.subscribe("maps", (docs) => { S.maps = Object.fromEntries(docs.map((d) => [d.id, d])); render(); });
  ensurePlayers();
})();
