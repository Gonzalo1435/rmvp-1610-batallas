// Capa de datos: Firebase (en vivo, compartido) o modo demo (localStorage).
import { firebaseConfig } from "./config.js";

const FB_VER = "10.12.2";
const listeners = new Set(); // auth/admin listeners

export const store = {
  mode: firebaseConfig.apiKey ? "connecting" : "demo",
  user: null,       // { uid, email, name, anonymous }
  isAdmin: false,
  adminsExist: false,
  error: null,
};

function emitAuth() { listeners.forEach((cb) => cb(store)); }
export function onAuthChange(cb) { listeners.add(cb); cb(store); return () => listeners.delete(cb); }

/* ---------------- DEMO (localStorage) ---------------- */
const LS_KEY = "lw-alliance-demo-v1";
const demoSubs = new Map(); // path -> Set(cb)
function demoLoad() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } }
function demoSave(db) { try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch {} }
function demoEmit(path) {
  const db = demoLoad();
  const coll = db[path] || {};
  const docs = Object.entries(coll).map(([id, d]) => ({ id, ...d }));
  (demoSubs.get(path) || new Set()).forEach((cb) => cb(docs));
}
window.addEventListener("storage", (e) => { if (e.key === LS_KEY) demoSubs.forEach((_, p) => demoEmit(p)); });

const demo = {
  subscribe(path, cb) {
    if (!demoSubs.has(path)) demoSubs.set(path, new Set());
    demoSubs.get(path).add(cb);
    setTimeout(() => demoEmit(path), 0);
    return () => demoSubs.get(path)?.delete(cb);
  },
  async set(path, id, data, merge = true) {
    const db = demoLoad();
    db[path] = db[path] || {};
    db[path][id] = merge ? { ...(db[path][id] || {}), ...data } : { ...data };
    demoSave(db); demoEmit(path);
  },
  async add(path, data) {
    const id = Math.random().toString(36).slice(2, 10);
    await demo.set(path, id, data, false);
    return id;
  },
  async del(path, id) {
    const db = demoLoad();
    if (db[path]) delete db[path][id];
    demoSave(db); demoEmit(path);
  },
  async delCollection(path) {
    const db = demoLoad(); delete db[path]; demoSave(db); demoEmit(path);
  },
  async setMany(path, items) {
    const db = demoLoad();
    db[path] = db[path] || {};
    for (const { id, data } of items) db[path][id] = { ...(db[path][id] || {}), ...data };
    demoSave(db); demoEmit(path);
  },
  async getAdmins() { return demoLoad().__admins || null; },
  async setAdmins(emails) { const db = demoLoad(); db.__admins = { emails }; demoSave(db); },
  reset() { localStorage.removeItem(LS_KEY); demoSubs.forEach((_, p) => demoEmit(p)); },
};

/* ---------------- FIREBASE ---------------- */
let fb = null; // { db, auth, m: firestore module, a: auth module }

const fire = {
  subscribe(path, cb) {
    const { m, db } = fb;
    return m.onSnapshot(m.collection(db, path),
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => { console.error(path, err); store.error = err.message; emitAuth(); });
  },
  async set(path, id, data, merge = true) {
    const { m, db } = fb;
    await m.setDoc(m.doc(db, path, id), data, { merge });
  },
  async add(path, data) {
    const { m, db } = fb;
    const ref = await m.addDoc(m.collection(db, path), data);
    return ref.id;
  },
  async del(path, id) {
    const { m, db } = fb;
    await m.deleteDoc(m.doc(db, path, id));
  },
  async delCollection(path) {
    const { m, db } = fb;
    const snap = await m.getDocs(m.collection(db, path));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = m.writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  },
  async setMany(path, items) {
    const { m, db } = fb;
    for (let i = 0; i < items.length; i += 400) {
      const b = m.writeBatch(db);
      items.slice(i, i + 400).forEach(({ id, data }) => b.set(m.doc(db, path, id), data, { merge: true }));
      await b.commit();
    }
  },
  async getAdmins() {
    const { m, db } = fb;
    const s = await m.getDoc(m.doc(db, "config", "admins"));
    return s.exists() ? s.data() : null;
  },
  async setAdmins(emails) {
    const { m, db } = fb;
    await m.setDoc(m.doc(db, "config", "admins"), { emails });
  },
};

let impl = demo;
export const db = {
  subscribe: (p, cb) => impl.subscribe(p, cb),
  set: (p, id, d, merge) => impl.set(p, id, d, merge),
  add: (p, d) => impl.add(p, d),
  del: (p, id) => impl.del(p, id),
  delCollection: (p) => impl.delCollection(p),
  setMany: (p, items) => impl.setMany(p, items),
  getAdmins: () => impl.getAdmins(),
  setAdmins: (e) => impl.setAdmins(e),
  resetDemo: () => demo.reset(),
};

async function refreshAdmin() {
  try {
    const a = await impl.getAdmins();
    store.adminsExist = !!(a && a.emails && a.emails.length);
    const email = (store.user?.email || "").toLowerCase();
    store.isAdmin = store.mode === "demo" ? true
      : !!(email && a?.emails?.map((e) => e.toLowerCase()).includes(email));
  } catch (e) { console.error(e); store.isAdmin = store.mode === "demo"; }
  emitAuth();
}

export async function initStore() {
  if (!firebaseConfig.apiKey) {
    store.mode = "demo";
    store.user = { uid: "demo", email: "demo@local", name: "Demo", anonymous: false };
    await refreshAdmin();
    return store;
  }
  store.mode = "connecting";
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}`;
  let appM, m, a;
  try {
    [appM, m, a] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-firestore.js`),
      import(`${base}/firebase-auth.js`),
    ]);
  } catch (e) {
    // Nunca caer en modo demo si Firebase está configurado: mostrar el motivo.
    store.mode = "offline";
    store.error = "NO_FIREBASE";
    emitAuth();
    return store;
  }
  const app = appM.initializeApp(firebaseConfig);
  fb = { db: m.getFirestore(app), auth: a.getAuth(app), m, a };
  impl = fire;
  store.mode = "firebase";
  await new Promise((resolve) => {
    let first = true;
    a.onAuthStateChanged(fb.auth, async (u) => {
      if (!u) {
        try { await a.signInAnonymously(fb.auth); } catch (e) { store.error = "AUTH:" + (e.code || e.message); emitAuth(); resolve(); }
        return;
      }
      store.user = { uid: u.uid, email: u.email, name: u.displayName || u.email || "", anonymous: u.isAnonymous };
      await refreshAdmin();
      if (first) { first = false; resolve(); }
    });
  });
  return store;
}

export async function signInGoogle() {
  if (store.mode !== "firebase") return;
  const { a, auth } = fb;
  await a.signInWithPopup(auth, new a.GoogleAuthProvider());
}
export async function signOutUser() {
  if (store.mode !== "firebase") return;
  await fb.a.signOut(fb.auth);
}
export async function claimFirstAdmin() {
  if (!store.user?.email) return;
  await db.setAdmins([store.user.email.toLowerCase()]);
  await refreshAdmin();
}
export async function saveAdmins(emails) {
  await db.setAdmins(emails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  await refreshAdmin();
}
export { refreshAdmin };
