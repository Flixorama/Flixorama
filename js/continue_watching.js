// js/continue_watching.js

const STORAGE_KEY = "continue_watching_v1";
const MAX_ITEMS = 20;

/* =========================
   Storage
========================= */

export function getContinueWatching() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(raw)) return [];
    // Sanitiza items mínimos
    return raw
      .filter(Boolean)
      .map((x) => ({
        ...x,
        updatedAt: Number(x.updatedAt) || 0
      }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return [];
  }
}

function save(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage lleno/bloqueado: no rompemos la app
  }
}

/* =========================
   Helpers de col (collections::cid)
========================= */

// Normaliza col para usarlo en keys y en navegación.
// Ej:
// - "trending" -> { col: "trending", cid: "" }
// - "collections::abc" -> { col: "collections", cid: "abc" }
// - "collections" + cid aparte -> { col:"collections", cid }
export function parseCWCol(rawCol) {
  const s = String(rawCol || "").trim();
  if (!s) return { col: "trending", cid: "" };

  if (s.startsWith("collections::")) {
    const cid = s.split("collections::")[1] || "";
    return { col: "collections", cid };
  }

  return { col: s, cid: "" };
}

// Devuelve el formato recomendado de col para CW.
// - si col="collections" y hay cid -> "collections::cid"
// - si no -> col normal
export function normalizeCWCol(col, cid = "") {
  const c = String(col || "").trim() || "trending";
  const id = String(cid || "").trim();

  if (c === "collections" && id) return `collections::${id}`;
  return c;
}

/* =========================
   Keys
========================= */

export function buildCWKey({ id, col, season, episode }) {
  const safeId = String(id || "").trim();
  const safeCol = String(col || "").trim() || "trending";

  // episodios
  if (Number.isFinite(season) && Number.isFinite(episode)) {
    return `${safeCol}_${safeId}_S${season}_E${episode}`;
  }

  // películas
  return `${safeCol}_${safeId}`;
}

/* =========================
   Upsert / Remove
========================= */

export function upsertContinueWatching(item) {
  if (!item) return;

  const id = String(item.id || "").trim();
  if (!id) return;

  const col = String(item.col || "").trim() || "trending";

  const key = buildCWKey({
    id,
    col,
    season: item.season,
    episode: item.episode
  });

  const list = getContinueWatching();

  // Filtra el mismo key
  const filtered = list.filter((x) => x?.key !== key);

  // Inserta arriba
  filtered.unshift({
    ...item,
    id,
    col,
    key,
    updatedAt: Date.now()
  });

  // Guarda máximo MAX_ITEMS
  save(filtered.slice(0, MAX_ITEMS));
}

export function removeContinueWatchingItem(key) {
  const k = String(key || "").trim();
  if (!k) return;

  const list = getContinueWatching();
  const updated = list.filter((x) => x?.key !== k);
  save(updated);
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
