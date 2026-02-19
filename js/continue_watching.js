// js/continue_watching.js

const STORAGE_KEY = "continue_watching_v1";
const MAX_ITEMS = 20;

/* =========================
   Helpers de col (collections::cid)
========================= */

// "collections::abc" -> { col:"collections", cid:"abc" }
// "collections" -> { col:"collections", cid:"" }
export function parseCWCol(rawCol) {
  const s = String(rawCol || "").trim();
  if (!s) return { col: "trending", cid: "" };

  if (s.startsWith("collections::")) {
    const cid = s.split("collections::")[1] || "";
    return { col: "collections", cid };
  }

  return { col: s, cid: "" };
}

// Devuelve col lista para CW:
// - collections + cid => "collections::cid"
// - si ya viene "collections::cid" se respeta
export function normalizeCWCol(col, cid = "") {
  const c = String(col || "").trim() || "trending";
  const id = String(cid || "").trim();

  if (c.startsWith("collections::")) return c; // ya normalizado
  if (c === "collections" && id) return `collections::${id}`;
  return c;
}

/* =========================
   Keys
========================= */

export function buildCWKey({ id, col, season, episode }) {
  const safeId = String(id || "").trim();
  const safeCol = String(col || "").trim() || "trending";

  if (Number.isFinite(season) && Number.isFinite(episode)) {
    return `${safeCol}_${safeId}_S${season}_E${episode}`;
  }
  return `${safeCol}_${safeId}`;
}

/* =========================
   Storage (con migración)
========================= */

function save(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function migrateItem(x) {
  if (!x || typeof x !== "object") return null;

  const id = String(x.id || "").trim();
  if (!id) return null;

  // Soporta item.cid viejo/nuevo
  const cid = String(x.cid || "").trim();

  // Normaliza col para CW
  const col = normalizeCWCol(x.col, cid);

  const season = Number.isFinite(x.season) ? x.season : undefined;
  const episode = Number.isFinite(x.episode) ? x.episode : undefined;

  const key = x.key || buildCWKey({ id, col, season, episode });

  return {
    ...x,
    id,
    cid,          // lo dejamos por si lo quieres usar luego
    col,          // aquí queda "collections::CID" si aplica
    key,
    updatedAt: Number(x.updatedAt) || 0
  };
}

export function getContinueWatching() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(raw)) return [];

    const migrated = raw
      .map(migrateItem)
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    // ✅ opcional: guarda migración para dejar storage limpio
    save(migrated.slice(0, MAX_ITEMS));

    return migrated.slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

/* =========================
   Upsert / Remove / Clear
========================= */

export function upsertContinueWatching(item) {
  if (!item) return;

  const id = String(item.id || "").trim();
  if (!id) return;

  const cid = String(item.cid || "").trim();
  const col = normalizeCWCol(item.col, cid);

  const season = Number.isFinite(item.season) ? item.season : undefined;
  const episode = Number.isFinite(item.episode) ? item.episode : undefined;

  const key = buildCWKey({ id, col, season, episode });

  const list = getContinueWatching();

  const filtered = list.filter((x) => x?.key !== key);

  filtered.unshift({
    ...item,
    id,
    cid,
    col,
    season,
    episode,
    key,
    updatedAt: Date.now()
  });

  save(filtered.slice(0, MAX_ITEMS));
}

export function removeContinueWatchingItem(key) {
  const k = String(key || "").trim();
  if (!k) return;

  const list = getContinueWatching();
  save(list.filter((x) => x?.key !== k));
}

export function clearContinueWatching() {
  save([]);
}

/* =========================
   UI helpers
========================= */

export function pctWatched(time, duration) {
  const t = Number(time) || 0;
  const d = Number(duration) || 0;
  if (!Number.isFinite(d) || d <= 0) return 0;
  return Math.min(100, Math.floor((t / d) * 100));
}
