// js/search.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import {
  collection,
  getDocs,
  query,
  limit
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

import { setReturnToCurrentPage, restoreScrollFromSession } from "./nav_state.js";

/* =========================
   Config
========================= */

// Raíz (colecciones normales)
const ROOT_COLS = ["trending", "estreno", "top10"];
const PER_COL_LIMIT = 150;

// Movies (colección global)
const MOVIES_LIMIT = 800;

// Series (colección global)
const SERIES_LIMIT = 800;

// Animes (colección global)
const ANIMES_LIMIT = 800;

// Collections/items (colecciones personales)
const COLLECTIONS_LIMIT = 60;       // cuántas colecciones leer
const ITEMS_PER_COLLECTION = 250;   // cuántos items por colección

/* =========================
   UI
========================= */

const backBtn = document.getElementById("back-btn");
const inputEl = document.getElementById("search-input");
const btnEl = document.getElementById("search-btn");
const msgEl = document.getElementById("msg");
const resultsEl = document.getElementById("results");
const filterBtns = Array.from(document.querySelectorAll(".filter-btn"));

/* =========================
   Helpers
========================= */

function setMsg(t) { if (msgEl) msgEl.textContent = t || ""; }

function getParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

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

function typeBucket(rawType) {
  const t = normalize(rawType);
  if (t === "anime") return "anime";
  if (t === "serie" || t === "series") return "serie";
  return "movie";
}

function clearResults() {
  if (resultsEl) resultsEl.innerHTML = "";
}

/**
 * Dedupe “inteligente” por título+año (evita repetidos entre
 * movies/trending/top10/collections/series/animes).
 * Si no hay título, no dedupea por canon.
 */
function canonKeyFromData(data) {
  const t = normalize(data?.title);
  const y = safeText(data?.year, "");
  return t ? `canon::${t}::${y}` : "";
}

function cardHTML(item) {
  const title = safeText(item.title, "Sin título");
  const poster = safeText(item.posterUrl, "") || safeText(item.backdropUrl, "");
  const type = safeText(item.type, "");
  const year = safeText(item.year, "");
  const rating =
    item.rating !== undefined &&
    item.rating !== null &&
    String(item.rating).trim() !== ""
      ? `⭐ ${item.rating}`
      : "";

  const pills = [type, year, rating].filter(Boolean).slice(0, 2);

  return `
    <article class="s-card" tabindex="0">
      <div class="s-poster">
        ${
          poster
            ? `<img src="${poster}" alt="${title}" loading="lazy" />`
            : `<div class="s-fallback">Sin imagen</div>`
        }
        <div class="s-overlay"></div>
      </div>

      <div class="s-meta">
        <div class="s-title">${title}</div>
        <div class="s-sub">
          ${pills.map(p => `<span class="s-pill">${p}</span>`).join("")}
        </div>
      </div>
    </article>
  `;
}

/* =========================
   Data cache
========================= */

let allItems = [];
let activeType = "all";
let loaded = false;

/* =========================
   Loaders
========================= */

async function loadRootCollectionsInto(map, canonSeen) {
  for (const colName of ROOT_COLS) {
    try {
      const snap = await getDocs(query(collection(db, colName), limit(PER_COL_LIMIT)));

      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const id = docSnap.id;

        const canon = canonKeyFromData(data);
        if (canon && canonSeen.has(canon)) return;

        const key = `root::${colName}::${id}`;
        if (map.has(key)) return;

        if (canon) canonSeen.add(canon);

        map.set(key, {
          id,
          col: colName,
          cid: "",
          source: "root",
          title: data.title,
          type: data.type,
          year: data.year,
          rating: data.rating,
          posterUrl: data.posterUrl,
          backdropUrl: data.backdropUrl,
          __normTitle: normalize(data.title)
        });
      });
    } catch (e) {
      console.error("Error cargando raíz:", colName, e);
    }
  }
}

async function loadMoviesInto(map, canonSeen) {
  try {
    const snap = await getDocs(query(collection(db, "movies"), limit(MOVIES_LIMIT)));

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const id = docSnap.id;

      const canon = canonKeyFromData(data);
      if (canon && canonSeen.has(canon)) return;

      const key = `root::movies::${id}`;
      if (map.has(key)) return;

      if (canon) canonSeen.add(canon);

      map.set(key, {
        id,
        col: "movies",
        cid: "",
        source: "movies",
        title: data.title,
        type: data.type || "movie",
        year: data.year,
        rating: data.rating,
        posterUrl: data.posterUrl,
        backdropUrl: data.backdropUrl,
        __normTitle: normalize(data.title)
      });
    });
  } catch (e) {
    console.error("Error cargando movies:", e);
  }
}

async function loadSeriesInto(map, canonSeen) {
  try {
    const snap = await getDocs(query(collection(db, "series"), limit(SERIES_LIMIT)));

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const id = docSnap.id;

      const canon = canonKeyFromData(data);
      if (canon && canonSeen.has(canon)) return;

      const key = `root::series::${id}`;
      if (map.has(key)) return;

      if (canon) canonSeen.add(canon);

      map.set(key, {
        id,
        col: "series",
        cid: "",
        source: "series",
        title: data.title,
        type: data.type || "serie",
        year: data.year,
        rating: data.rating,
        posterUrl: data.posterUrl,
        backdropUrl: data.backdropUrl,
        __normTitle: normalize(data.title)
      });
    });
  } catch (e) {
    console.error("Error cargando series:", e);
  }
}

async function loadAnimesInto(map, canonSeen) {
  try {
    const snap = await getDocs(query(collection(db, "animes"), limit(ANIMES_LIMIT)));

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const id = docSnap.id;

      const canon = canonKeyFromData(data);
      if (canon && canonSeen.has(canon)) return;

      const key = `root::animes::${id}`;
      if (map.has(key)) return;

      if (canon) canonSeen.add(canon);

      map.set(key, {
        id,
        col: "animes",
        cid: "",
        source: "animes",
        title: data.title,
        type: data.type || "anime",
        year: data.year,
        rating: data.rating,
        posterUrl: data.posterUrl,
        backdropUrl: data.backdropUrl,
        __normTitle: normalize(data.title)
      });
    });
  } catch (e) {
    console.error("Error cargando animes:", e);
  }
}

async function loadCollectionsItemsInto(map, canonSeen) {
  let colsSnap;
  try {
    colsSnap = await getDocs(query(collection(db, "collections"), limit(COLLECTIONS_LIMIT)));
  } catch (e) {
    console.error("Error leyendo collections:", e);
    return;
  }

  if (colsSnap.empty) return;

  for (const colDoc of colsSnap.docs) {
    const cid = colDoc.id;

    try {
      const itemsSnap = await getDocs(
        query(collection(db, "collections", cid, "items"), limit(ITEMS_PER_COLLECTION))
      );

      itemsSnap.forEach((itemDoc) => {
        const data = itemDoc.data() || {};
        const itemId = itemDoc.id;

        const canon = canonKeyFromData(data);
        if (canon && canonSeen.has(canon)) return;

        const key = `collections::${cid}::${itemId}`;
        if (map.has(key)) return;

        if (canon) canonSeen.add(canon);

        map.set(key, {
          id: itemId,
          col: "collections",
          cid,
          source: "collections",
          title: data.title,
          type: data.type || "movie",
          year: data.year,
          rating: data.rating,
          posterUrl: data.posterUrl,
          backdropUrl: data.backdropUrl,
          __normTitle: normalize(data.title)
        });
      });
    } catch (e) {
      console.error(`Error leyendo items de colección ${cid}:`, e);
    }
  }
}

async function loadAllOnce() {
  if (loaded) return;
  loaded = true;

  setMsg("Cargando catálogo…");
  clearResults();

  const map = new Map();
  const canonSeen = new Set();

  // A) trending/estreno/top10
  await loadRootCollectionsInto(map, canonSeen);

  // B) movies
  await loadMoviesInto(map, canonSeen);

  // C) series
  await loadSeriesInto(map, canonSeen);

  // D) animes ✅
  await loadAnimesInto(map, canonSeen);

  // E) collections/*/items
  await loadCollectionsItemsInto(map, canonSeen);

  allItems = Array.from(map.values());

  setMsg(allItems.length ? "Escribe para buscar…" : "No hay contenido para buscar.");
}

/* =========================
   Render search
========================= */

function applyFiltersAndRender() {
  if (!resultsEl) return;

  const q = normalize(inputEl?.value || "");
  clearResults();

  let list = allItems;

  // filtro por tipo
  if (activeType !== "all") {
    list = list.filter(x => typeBucket(x.type) === activeType);
  }

  // filtro por texto
  if (q.length >= 1) {
    list = list.filter(x => (x.__normTitle || "").includes(q));
  }

  if (!list.length) {
    setMsg(q ? "No se encontraron resultados." : "Escribe para buscar…");
    return;
  }

  setMsg("");

  // prioriza "empieza con"
  list.sort((a, b) => {
    const at = a.__normTitle || "";
    const bt = b.__normTitle || "";
    const aStarts = q && at.startsWith(q) ? 0 : 1;
    const bStarts = q && bt.startsWith(q) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return at.localeCompare(bt);
  });

  const frag = document.createDocumentFragment();

  list.slice(0, 90).forEach((item) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = cardHTML(item);
    const card = wrap.firstElementChild;

    const go = () => {
      const rawQ = inputEl?.value || "";
      const qParam = encodeURIComponent(rawQ);

      // ✅ guarda dónde estás (search + scroll)
      setReturnToCurrentPage();

      // ✅ collections/items → details con cid
      if (item.col === "collections" && item.cid) {
        window.location.href =
          `details.html?id=${encodeURIComponent(item.id)}&col=collections&cid=${encodeURIComponent(item.cid)}&from=search&q=${qParam}`;
        return;
      }

      // ✅ raíz/movies/series/animes → details normal
      window.location.href =
        `details.html?id=${encodeURIComponent(item.id)}&col=${encodeURIComponent(item.col)}&from=search&q=${qParam}`;
    };

    card.addEventListener("click", go);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });

    // fallback imagen
    const img = card.querySelector("img");
    if (img) {
      img.addEventListener("error", () => {
        img.remove();
        card.querySelector(".s-poster")?.insertAdjacentHTML(
          "afterbegin",
          `<div class="s-fallback">Imagen no disponible</div>`
        );
      });
    }

    frag.appendChild(card);
  });

  resultsEl.appendChild(frag);
}

/* =========================
   Events
========================= */

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeType = btn.dataset.type || "all";
    applyFiltersAndRender();
  });
});

btnEl?.addEventListener("click", applyFiltersAndRender);
inputEl?.addEventListener("input", applyFiltersAndRender);

inputEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") applyFiltersAndRender();
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

  await loadAllOnce();

  // ✅ Si vienes con ?q=..., restaurar búsqueda
  const qParam = getParam("q");
  if (inputEl && qParam) {
    try { inputEl.value = decodeURIComponent(qParam); }
    catch { inputEl.value = qParam; }
  }

  // ✅ restaurar scroll si venías de details (nav_state)
  restoreScrollFromSession?.();

  applyFiltersAndRender();
});
