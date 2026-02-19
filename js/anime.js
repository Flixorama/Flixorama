// js/anime.js
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

const ANIME_COL = "animes";     // ✅ tu nueva colección Firestore
const ANIMES_LIMIT = 800;       // ajusta a tu gusto

/* =========================
   UI
========================= */

const backBtn = document.getElementById("back-btn");
const searchEl = document.getElementById("anime-search");
const sortEl = document.getElementById("anime-sort");
const gridEl = document.getElementById("anime-grid");
const msgEl = document.getElementById("anime-msg");

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

function skeleton(n = 18) {
  if (!gridEl) return;
  gridEl.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const sk = document.createElement("div");
    sk.className = "anime-skeleton";
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
  el.className = "anime-item";
  el.tabIndex = 0;

  const imgHTML = img
    ? `<img class="ani-img" src="${img}" alt="${title}" loading="lazy">`
    : `<div class="ani-fallback">Sin imagen</div>`;

  const pillsHTML = pills.map(p => `<span class="ani-pill">${p}</span>`).join("");

  el.innerHTML = `
    ${imgHTML}
    <div class="ani-meta">
      <div class="ani-title">${title}</div>
      <div class="ani-sub">${pillsHTML}</div>
    </div>
  `;

  // fallback imagen
  const imgEl = el.querySelector(".ani-img");
  if (imgEl) {
    imgEl.addEventListener("error", () => {
      imgEl.remove();
      el.insertAdjacentHTML("afterbegin", `<div class="ani-fallback">Imagen no disponible</div>`);
    });
  }

  const go = () => {
    // ✅ return_to + scroll (para volver aquí desde details/episodes)
    setReturnToCurrentPage();

    // ✅ details: col=animes (y tu details resolverá doc(db, colName, id))
    window.location.href = `details.html?id=${encodeURIComponent(item.id)}&col=${encodeURIComponent(ANIME_COL)}`;
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

let allAnimes = [];
let loaded = false;

/* =========================
   Firestore loader
========================= */

async function loadAnimesOnce() {
  if (loaded) return;
  loaded = true;

  setMsg("Cargando animes…");
  skeleton(18);

  const sortMode = safeText(sortEl?.value, "title");

  try {
    let q;
    if (sortMode === "rank") {
      q = query(collection(db, ANIME_COL), orderBy("rank", "asc"), limit(ANIMES_LIMIT));
    } else {
      q = query(collection(db, ANIME_COL), orderBy("title", "asc"), limit(ANIMES_LIMIT));
    }

    const snap = await getDocs(q);

    // ✅ dedupe por id
    const map = new Map();

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const id = docSnap.id;

      if (map.has(id)) return;

      map.set(id, {
        id,
        col: ANIME_COL,
        title: data.title,
        type: data.type || "anime",
        year: data.year,
        rating: data.rating,
        rank: data.rank,
        posterUrl: data.posterUrl,
        backdropUrl: data.backdropUrl,
        __normTitle: normalize(data.title)
      });
    });

    allAnimes = Array.from(map.values());

    clearGrid();

    if (!allAnimes.length) {
      setMsg(`No hay animes aún en Firestore (${ANIME_COL}).`);
      return;
    }

    setMsg("Escribe para buscar…");
    renderFiltered();

  } catch (e) {
    console.error("Error cargando animes:", e);
    clearGrid();
    setMsg(`Error cargando animes. Revisa consola y reglas de Firestore (${ANIME_COL}).`);
  }
}

/* =========================
   Render + Search
========================= */

function renderFiltered() {
  if (!gridEl) return;

  const q = normalize(searchEl?.value || "");
  clearGrid();

  let list = allAnimes;

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

    // desempate suave por rank si existe
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

sortEl?.addEventListener("change", async () => {
  // recargar según orden
  loaded = false;
  allAnimes = [];
  await loadAnimesOnce();
});

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
  await loadAnimesOnce();
});
