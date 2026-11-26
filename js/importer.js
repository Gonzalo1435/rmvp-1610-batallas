// Importar miembros desde un video o capturas de la lista de la alianza.
// 1) Saca imágenes del video en el navegador (sin subirlo a ningún lado).
// 2) Descarta las repetidas.
// 3) Gemini (clave del R4, guardada solo en su navegador) lee las filas.
// 4) Se compara con los miembros actuales y el R4 revisa antes de guardar.

const KEY_LS = "lw-gemini-key";
const MODEL_LS = "lw-gemini-model";
export const DEFAULT_MODEL = ""; // vacío = elegir automáticamente entre los modelos que tenga la clave

export const getKey = () => localStorage.getItem(KEY_LS) || "";
export const setKey = (k) => (k ? localStorage.setItem(KEY_LS, k.trim()) : localStorage.removeItem(KEY_LS));
export const getModel = () => localStorage.getItem(MODEL_LS) || DEFAULT_MODEL;
export const setModel = (m) => (m ? localStorage.setItem(MODEL_LS, m.trim()) : localStorage.removeItem(MODEL_LS));

/* ---------- frames ---------- */
function thumbDiff(a, b) {
  if (!a || !b) return 999;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}
function grabThumb(canvas) {
  const t = document.createElement("canvas"); t.width = 32; t.height = 56;
  const c = t.getContext("2d"); c.drawImage(canvas, 0, 0, 32, 56);
  const d = c.getImageData(0, 0, 32, 56).data, g = new Uint8Array(32 * 56);
  for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  return g;
}
function canvasToJpeg(canvas) { return canvas.toDataURL("image/jpeg", 0.82).split(",")[1]; }

// Devuelve [{b64, w, h}] de imágenes distintas.
export async function framesFromVideo(file, onProgress, { step = 0.7, maxFrames = 60, width = 720 } = {}) {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("No se pudo leer el video (formato no soportado por este navegador).")); });
  const k = Math.min(1, width / v.videoWidth);
  const cv = document.createElement("canvas"); cv.width = Math.round(v.videoWidth * k); cv.height = Math.round(v.videoHeight * k);
  const ctx = cv.getContext("2d");
  const out = []; let last = null;
  for (let t = 0.2; t < v.duration && out.length < maxFrames; t += step) {
    await new Promise((res) => { v.onseeked = res; v.currentTime = t; });
    ctx.drawImage(v, 0, 0, cv.width, cv.height);
    const th = grabThumb(cv);
    if (thumbDiff(th, last) > 6) { out.push({ b64: canvasToJpeg(cv), w: cv.width, h: cv.height }); last = th; }
    onProgress?.(Math.min(1, t / v.duration), out.length);
  }
  URL.revokeObjectURL(url);
  return out;
}
export async function framesFromImages(files, width = 900) {
  const out = [];
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, width / img.width);
    const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    out.push({ b64: canvasToJpeg(cv), w: cv.width, h: cv.height });
    URL.revokeObjectURL(url);
  }
  return out;
}

/* ---------- Gemini ---------- */
const PROMPT = `These are screenshots of the alliance MEMBER LIST of the mobile game "Last War: Survival" (UI may be in Spanish).
Extract EVERY member row that is fully visible. For each row return:
- name: exactly as written (keep symbols, accents, Korean/Chinese characters, spaces).
- rank: "R5","R4","R3","R2" or "R1" if it can be determined from the section header the row belongs to (e.g. "R4 Legionnaire", "Consejo de Guerra"=R4, "Alto mando"=R5, "Campo de pruebas"=R1); otherwise null.
- power: total power in MILLIONS as a number (e.g. "Poder: 259.0M" -> 259.0, "1.2G" -> 1200, "980.5K" -> 0.98).
- level: headquarters level number shown as "Lv.35" or similar, or null.
- lastSeen: the last-online text ("En línea", "Hace 3m", "Hace 2h", "Online", "3m ago") or null.
Ignore headers, buttons and partial rows. Do not invent rows. If the same member appears in several screenshots, list it once.`;

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING" }, rank: { type: "STRING", nullable: true },
      power: { type: "NUMBER", nullable: true }, level: { type: "INTEGER", nullable: true },
      lastSeen: { type: "STRING", nullable: true },
    },
    required: ["name"],
  },
};

async function callGemini(frames, key, model) {
  if (window.__mockGemini) return window.__mockGemini(frames);
  const body = {
    contents: [{ role: "user", parts: [{ text: PROMPT }, ...frames.map((f) => ({ inline_data: { mime_type: "image/jpeg", data: f.b64 } }))] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0 },
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || `HTTP ${r.status}`;
    if (r.status === 400 && /API key/i.test(msg)) throw new Error("La clave de Gemini no es válida.");
    if (r.status === 429) throw new Error("Gemini: se alcanzó el límite gratuito por minuto. Espera un minuto y vuelve a intentar.");
    throw new Error("Gemini: " + msg);
  }
  const txt = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "[]";
  try { return JSON.parse(txt); } catch { throw new Error("Gemini devolvió una respuesta que no se pudo leer."); }
}

// Lista los modelos de la clave y elige uno "Flash" vigente (prefiere Flash-Lite: más cupo gratis por día).
export async function pickModel(key, prefer = getModel()) {
  if (window.__mockGemini) return "mock";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || `HTTP ${r.status}`;
    throw new Error(/API key/i.test(msg) ? "La clave de Gemini no es válida." : "Gemini: " + msg);
  }
  const ok = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /^gemini-\d/.test(n) && /flash/.test(n) && !/(image|tts|audio|live|thinking|exp)/.test(n));
  if (prefer && ok.includes(prefer)) return prefer;
  const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const stable = (n) => (/preview/.test(n) ? 0 : 1);
  const lite = ok.filter((n) => /lite/.test(n)), full = ok.filter((n) => !/lite/.test(n));
  const pool = (prefer === "flash" ? full : lite).length ? (prefer === "flash" ? full : lite) : ok;
  pool.sort((a, b) => stable(b) - stable(a) || ver(b) - ver(a));
  if (!pool.length) throw new Error("Tu clave no tiene modelos Gemini Flash disponibles.");
  return pool[0];
}
export async function listModels(key) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`);
  const j = await r.json().catch(() => ({}));
  return (j.models || []).map((m) => m.name.replace(/^models\//, "")).filter((n) => /^gemini-\d/.test(n) && /flash/.test(n));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function extractRows(frames, onProgress, { batch = 8 } = {}) {
  const key = getKey();
  if (!key && !window.__mockGemini) throw new Error("Falta la clave de Gemini.");
  const model = await pickModel(key);
  // Cupo gratis por minuto: Flash-Lite ~10/min, Flash ~5/min. Se espera entre envíos para no chocar con el límite.
  const gap = window.__mockGemini ? 0 : /lite/.test(model) ? 6500 : 12500;
  const all = [];
  for (let i = 0; i < frames.length; i += batch) {
    if (i && gap) await sleep(gap);
    let rows;
    try { rows = await callGemini(frames.slice(i, i + batch), key, model); }
    catch (e) {
      if (/límite/.test(e.message)) { await sleep(61000); rows = await callGemini(frames.slice(i, i + batch), key, model); }
      else throw e;
    }
    if (Array.isArray(rows)) all.push(...rows);
    onProgress?.(Math.min(1, (i + batch) / frames.length), all.length, model);
  }
  return { rows: dedupeRows(all), model };
}

/* ---------- matching ---------- */
export const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s._\-·•]+/g, "").trim();
function lev(a, b) {
  const m = a.length, n = b.length; if (!m || !n) return m || n;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function dedupeRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = norm(r.name); if (!k) continue;
    const prev = map.get(k);
    if (!prev) map.set(k, { ...r });
    else for (const f of ["rank", "power", "level", "lastSeen"]) if (prev[f] == null && r[f] != null) prev[f] = r[f];
  }
  return [...map.values()];
}

// Compara filas leídas con los miembros actuales.
export function buildDiff(rows, members) {
  const byNorm = new Map(members.map((m) => [norm(m.name), m]));
  const used = new Set();
  const items = rows.map((r) => {
    let m = byNorm.get(norm(r.name)), fuzzy = false;
    if (!m) {
      const n = norm(r.name);
      let best = null, bd = 99;
      for (const x of members) {
        if (used.has(x.id)) continue;
        const d = lev(n, norm(x.name));
        if (d < bd) { bd = d; best = x; }
      }
      if (best && n.length >= 4 && bd <= Math.max(1, Math.floor(n.length / 6))) { m = best; fuzzy = true; }
    }
    if (m) used.add(m.id);
    const power = typeof r.power === "number" && r.power > 0 ? Math.round(r.power * 10) / 10 : null;
    let kind = "new";
    if (m) kind = power != null && Math.abs((m.power || 0) - power) >= 0.1 ? "update" : "same";
    return { row: { ...r, power }, member: m || null, fuzzy, kind, apply: kind !== "same" };
  });
  const missing = members.filter((m) => !used.has(m.id));
  return { items, missing };
}
