// js/series.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

import { setReturnToCurrentPage } from "./nav_state.js";

/* =========================
   Config
========================= */

const SERIES_LIMIT = 800;      // ajusta a tu gusto
const DEFAULT_SORT = "title";  // "title" | "rank"

/* =========================
   UI
========================= */

const backBtn = document.getElementById("back-btn");
const searchEl = document.getElementById("series-search");
const gridEl = document.getElementById("series-grid");
const msgEl = document.getElementById("series-msg");

/* =========================
   Helpers
========================= */

function setMsg(t) { if (msgEl) msgEl.textContent = t || ""; }

function safeText(v, fb = "") {
  if (v === undefined || v === null) return fb;
  const s = String(v).trim();
  return s ? s : fb;
}

function normalize(str) {
  return safeText(str, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function clearGrid() { if (gridEl) gridEl.innerHTML = ""; }

function skeleton(n = 12) {
  if (!gridEl) return;
  gridEl.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const sk = document.createElement("div");
    sk.className = "series-skeleton";
    gridEl.appendChild(sk);
  }
}

function toRankNumber(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 999999;
}

function buildCard(item) {
  const title = safeText(item.title, "Sin título");
  const img = safeText(item.posterUrl, "") || safeText(item.backdropUrl, "");
  const year = safeText(item.year, "");
  const rating =
    item.rating !== undefined &&
    item.rating !== null &&
    String(item.rating).trim() !== ""
      ? `⭐ ${item.rating}`
      : "";

  const pills = [year, rating].filter(Boolean).slice(0, 2);

  const el = document.createElement("div");
  el.className = "series-item";
  el.tabIndex = 0;

  const imgHTML = img
    ? `<img class="ser-img" src="${img}" alt="${title}" loading="lazy">`
    : `<div class="ser-fallback">Sin imagen</div>`;

  const pillsHTML = pills.map(p => `<span class="ser-pill">${p}</span>`).join("");

  el.innerHTML = `
    ${imgHTML}
    <div class="ser-meta">
      <div class="ser-title">${title}</div>
      <div class="ser-sub">${pillsHTML}</div>
    </div>
  `;

  // fallback imagen
  const imgEl = el.querySelector(".ser-img");
  if (imgEl) {
    imgEl.addEventListener("error", () => {
      imgEl.remove();
      el.insertAdjacentHTML(
        "afterbegin",
        `<div class="ser-fallback">Imagen no disponible</div>`
      );
    });
  }

    const go = () => {
    // ✅ guarda return_to (series.html + scroll)
    setReturnToCurrentPage();

    // ✅ abre details
    window.location.href = `details.html?id=${encodeURIComponent(item.id)}&col=series`;
    };


  el.addEventListener("click", go);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });

  return el;
}

/* =========================
   Data
========================= */

let allSeries = [];
let loaded = false;

/* =========================
   Firestore loader
========================= */

async function loadSeriesOnce() {
  if (loaded) return;
  loaded = true;

  setMsg("Cargando series…");
  skeleton(18);

  try {
    const colRef = collection(db, "series");

    const q =
      DEFAULT_SORT === "rank"
        ? query(colRef, orderBy("rank", "asc"), limit(SERIES_LIMIT))
        : query(colRef, orderBy("title", "asc"), limit(SERIES_LIMIT));

    const snap = await getDocs(q);

    const map = new Map();

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const id = docSnap.id;

      if (map.has(id)) return;

      map.set(id, {
        id,
        col: "series",
        title: data.title,
        type: data.type || "serie",
        year: data.year,
        rating: data.rating,
        rank: data.rank,
        posterUrl: data.posterUrl,
        backdropUrl: data.backdropUrl,
        __normTitle: normalize(data.title)
      });
    });

    allSeries = Array.from(map.values());

    clearGrid();

    if (!allSeries.length) {
      setMsg("No hay series aún en Firestore (series).");
      return;
    }

    setMsg("Escribe para buscar…");
    renderFiltered();

  } catch (e) {
    console.error("Error cargando series:", e);
    clearGrid();
    setMsg("Error cargando series. Revisa consola y reglas de Firestore.");
  }
}

/* =========================
   Render + Search
========================= */

function renderFiltered() {
  if (!gridEl) return;

  const q = normalize(searchEl?.value || "");
  clearGrid();

  let list = allSeries;

  if (q.length >= 1) {
    list = list.filter(x => (x.__normTitle || "").includes(q));
  }

  if (!list.length) {
    setMsg(q ? "No se encontraron resultados." : "Escribe para buscar…");
    return;
  }

  setMsg("");

  list.sort((a, b) => {
    const at = a.__normTitle || "";
    const bt = b.__normTitle || "";
    const aStarts = q && at.startsWith(q) ? 0 : 1;
    const bStarts = q && bt.startsWith(q) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;

    const ra = toRankNumber(a.rank);
    const rb = toRankNumber(b.rank);
    if (ra !== rb) return ra - rb;

    return at.localeCompare(bt);
  });

  const frag = document.createDocumentFragment();
  list.slice(0, 120).forEach(item => frag.appendChild(buildCard(item)));
  gridEl.appendChild(frag);
}

/* =========================
   Events
========================= */

searchEl?.addEventListener("input", renderFiltered);

backBtn?.addEventListener("click", () => {
  window.location.href = "home.html";
});

/* =========================
   Boot
========================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  await loadSeriesOnce();
});
