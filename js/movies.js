// js/movie.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

// ✅ NAV STATE (para volver siempre a movies si entraste desde aquí)
import { setReturnToCurrentPage, restoreScrollFromSession } from "./nav_state.js";

/* =========================
   UI
========================= */
const backBtn = document.getElementById("back-btn");
const gridEl = document.getElementById("movies-grid");
const msgEl = document.getElementById("msg");
const searchEl = document.getElementById("movie-search");
const sortEl = document.getElementById("movie-sort");

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
    sk.className = "collection-skeleton";
    gridEl.appendChild(sk);
  }
}

function buildCard({ img, title, pills = [] }) {
  const t = safeText(title, "Sin título");

  const el = document.createElement("div");
  el.className = "collection-item";

  const imgHTML = img
    ? `<img class="col-img" src="${img}" alt="${t}" loading="lazy">`
    : `<div class="col-fallback">Sin imagen</div>`;

  const pillsHTML = pills
    .filter(Boolean)
    .slice(0, 2)
    .map(p => `<span class="col-pill">${p}</span>`)
    .join("");

  el.innerHTML = `
    ${imgHTML}
    <div class="col-meta">
      <div class="col-title">${t}</div>
      ${pillsHTML ? `<div class="col-sub">${pillsHTML}</div>` : `<div class="col-sub"></div>`}
    </div>
  `;

  const imgEl = el.querySelector(".col-img");
  if (imgEl) {
    imgEl.addEventListener("error", () => {
      imgEl.remove();
      el.insertAdjacentHTML("afterbegin", `<div class="col-fallback">Imagen no disponible</div>`);
    });
  }

  return el;
}

/* =========================
   Data
========================= */
const MOVIES_LIMIT = 250;
let allMovies = []; // cache local

async function loadMoviesOnce(sortMode = "rank") {
  skeleton(12);
  setMsg("Cargando películas…");

  try {
    let q;

    if (sortMode === "title") {
      q = query(collection(db, "movies"), orderBy("title", "asc"), limit(MOVIES_LIMIT));
    } else if (sortMode === "year_desc") {
      q = query(collection(db, "movies"), orderBy("year", "desc"), limit(MOVIES_LIMIT));
    } else if (sortMode === "year_asc") {
      q = query(collection(db, "movies"), orderBy("year", "asc"), limit(MOVIES_LIMIT));
    } else {
      // default: rank
      q = query(collection(db, "movies"), orderBy("rank", "asc"), limit(MOVIES_LIMIT));
    }

    const snap = await getDocs(q);

    allMovies = snap.docs.map(d => {
      const data = d.data() || {};
      return {
        id: d.id,
        title: data.title,
        posterUrl: data.posterUrl,
        backdropUrl: data.backdropUrl,
        year: data.year,
        duration: data.duration,
        rating: data.rating,
        type: data.type || "movie",
        __normTitle: normalize(data.title)
      };
    });

    if (!allMovies.length) {
      clearGrid();
      setMsg("No hay películas en la colección 'movies'.");
      return;
    }

    setMsg("Escribe para buscar…");
    renderMovies();

  } catch (e) {
    console.error(e);
    clearGrid();
    setMsg("Error cargando películas. Revisa consola y reglas de Firestore.");
  }
}

function renderMovies() {
  if (!gridEl) return;

  const q = normalize(searchEl?.value || "");
  clearGrid();

  let list = allMovies;
  if (q) list = list.filter(x => (x.__normTitle || "").includes(q));

  if (!list.length) {
    setMsg(q ? "No se encontraron resultados." : "Escribe para buscar…");
    return;
  }

  setMsg("");

  const frag = document.createDocumentFragment();

  list.slice(0, 120).forEach((m) => {
    const title = safeText(m.title, m.id);
    const poster = safeText(m.posterUrl, "") || safeText(m.backdropUrl, "");
    const pillA = safeText(m.year, "");
    const pillB = safeText(m.duration, "");

    const card = buildCard({
      img: poster,
      title,
      pills: [pillA, pillB].filter(Boolean)
    });

    card.addEventListener("click", () => {
      // ✅ Guardar "return_to" (movies.html + scroll) ANTES de ir a detalles
      setReturnToCurrentPage();

      // details leyendo desde movies
      window.location.href = `details.html?id=${encodeURIComponent(m.id)}&col=movies`;
    });

    frag.appendChild(card);
  });

  gridEl.appendChild(frag);
}

/* =========================
   Events
========================= */
backBtn?.addEventListener("click", () => {
  window.location.href = "home.html";
});

searchEl?.addEventListener("input", renderMovies);

sortEl?.addEventListener("change", async () => {
  await loadMoviesOnce(sortEl.value || "rank");
});

/* =========================
   Boot
========================= */
window.addEventListener("DOMContentLoaded", () => {
  // ✅ Si vuelves desde details, recupera el scroll (opcional pro)
  restoreScrollFromSession();
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  await loadMoviesOnce("rank");
});
