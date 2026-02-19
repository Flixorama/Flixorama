// js/details.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";
import { consumeReturnTo, setReturnToCurrentPage } from "./nav_state.js";


// ✅ Continue Watching (LOCAL)
import {
  upsertContinueWatching,
  getContinueWatching,
  buildCWKey,
  removeContinueWatchingItem
} from "./continue_watching.js";



/* =========================
   Elementos
========================= */

const backBtn = document.getElementById("back-btn");
const heroBg = document.getElementById("hero-bg");
const poster = document.getElementById("poster");

const titleEl = document.getElementById("title");
const typeEl = document.getElementById("type");
const ratingEl = document.getElementById("rating");

const yearEl = document.getElementById("year");
const durationEl = document.getElementById("duration");
const descEl = document.getElementById("description");
const categoriesEl = document.getElementById("categories");

const specYearEl = document.getElementById("spec-year");
const specDurationEl = document.getElementById("spec-duration");
const specCategoriesEl = document.getElementById("spec-categories");

const playBtn = document.getElementById("play-btn");
const addBtn = document.getElementById("add-btn");
const msgEl = document.getElementById("msg");

/* ===== Player modal (PELÍCULAS) ===== */
const movieModal = document.getElementById("movie-player-modal");
const movieClose = document.getElementById("movie-player-close");
const movieTitleEl = document.getElementById("movie-player-title");
const movieVideo = document.getElementById("movie-video");

/* ===== Resume modal (flotante) ===== */
const resumeModal = document.getElementById("resume-modal");
const resumeClose = document.getElementById("resume-close");
const resumeContinue = document.getElementById("resume-continue");
const resumeRestart = document.getElementById("resume-restart");
const resumeSubtitle = document.getElementById("resume-subtitle");

/* =========================
   Helpers
========================= */

function setMsg(text) {
  if (!msgEl) return;
  msgEl.textContent = text || "";
}

function getParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function safeText(v, fallback = "") {
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim();
  return s ? s : fallback;
}

// Soporta: 45 | "45" | "45 min" | "1h 30m" | "01:30"
function formatDuration(value) {
  if (value === undefined || value === null) return "";

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const h = Math.floor(value / 60);
    const m = Math.round(value % 60);
    if (h <= 0) return `${m} min`;
    return `${h}h ${m}m`;
  }

  const raw = String(value).trim().toLowerCase();
  if (!raw) return "";

  const onlyNumber = raw.match(/^\d+$/);
  if (onlyNumber) return formatDuration(Number(onlyNumber[0]));

  const minMatch = raw.match(/(\d+)\s*min/);
  if (minMatch) return formatDuration(Number(minMatch[1]));

  const hMatch = raw.match(/(\d+)\s*h/);
  const mMatch = raw.match(/(\d+)\s*m/);
  if (hMatch || mMatch) {
    const h = hMatch ? Number(hMatch[1]) : 0;
    const m = mMatch ? Number(mMatch[1]) : 0;
    const total = h * 60 + m;
    return total > 0 ? formatDuration(total) : "";
  }

  const colon = raw.match(/^(\d+):(\d{2})$/);
  if (colon) {
    const total = Number(colon[1]) * 60 + Number(colon[2]);
    return total > 0 ? formatDuration(total) : "";
  }

  return "";
}

/* =========================
   Movie Player Control (back + fullscreen)
========================= */

let movieIsOpen = false;
let movieStatePushed = false;
let closingMovie = false;

function openMovieModal() {
  if (!movieModal) return;

  if (!movieIsOpen) {
    movieModal.classList.add("show");
    movieModal.setAttribute("aria-hidden", "false");
    movieIsOpen = true;
  }

  if (!movieStatePushed) {
    history.pushState({ modal: "movie" }, "");
    movieStatePushed = true;
  }
}

function exitMoviePlayer() {
  if (!movieModal || !movieVideo) return;
  if (closingMovie) return;
  closingMovie = true;

  movieModal.classList.remove("show");
  movieModal.setAttribute("aria-hidden", "true");
  movieIsOpen = false;

  try { movieVideo.pause(); } catch {}
  movieVideo.removeAttribute("src");
  try { movieVideo.load(); } catch {}

  try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
  try { if (screen.orientation?.unlock) screen.orientation.unlock(); } catch {}

  movieStatePushed = false;
  setTimeout(() => { closingMovie = false; }, 200);
}

function requestCloseMovie() {
  if (!movieIsOpen) return;
  if (movieStatePushed) history.back();
  else exitMoviePlayer();
}

async function enterFullscreenAndLandscapeForMovie() {
  // iOS Safari
  try {
    if (movieVideo && typeof movieVideo.webkitEnterFullscreen === "function") {
      movieVideo.webkitEnterFullscreen();
      return;
    }
  } catch {}

  try {
    if (movieVideo?.requestFullscreen) await movieVideo.requestFullscreen();
    else if (movieModal?.requestFullscreen) await movieModal.requestFullscreen();
  } catch (e) {
    console.warn("Fullscreen bloqueado:", e);
  }

  try {
    if (screen.orientation?.lock) await screen.orientation.lock("landscape");
  } catch (e) {
    console.warn("Orientation lock no disponible:", e);
  }
}

if (movieClose) movieClose.addEventListener("click", requestCloseMovie);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") requestCloseMovie();
});

movieModal?.addEventListener("click", (e) => {
  if (e.target === movieModal) requestCloseMovie();
});

window.addEventListener("popstate", () => {
  if (movieIsOpen) exitMoviePlayer();
});

document.addEventListener("fullscreenchange", () => {
  if (!movieIsOpen) return;
  if (!document.fullscreenElement) {
    if (movieStatePushed) history.back();
    else exitMoviePlayer();
  }
});

movieVideo?.addEventListener("webkitendfullscreen", () => {
  if (movieIsOpen) {
    if (movieStatePushed) history.back();
    else exitMoviePlayer();
  }
});

/* =========================
   Resume modal (flotante)
========================= */

function openResumeModal(text) {
  if (!resumeModal) return;
  if (resumeSubtitle) resumeSubtitle.textContent = text || "Tienes progreso guardado.";
  resumeModal.classList.add("show");
  resumeModal.setAttribute("aria-hidden", "false");
}

function closeResumeModal() {
  if (!resumeModal) return;
  resumeModal.classList.remove("show");
  resumeModal.setAttribute("aria-hidden", "true");
}

resumeClose?.addEventListener("click", closeResumeModal);
resumeModal?.addEventListener("click", (e) => {
  if (e.target === resumeModal) closeResumeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeResumeModal();
});

/* =========================
   Continue Watching helpers
========================= */

// ✅ criterio de “ya terminó”: 95% o últimos 8s
function isFinished(t, d) {
  if (!Number.isFinite(d) || d <= 0) return false;
  if (!Number.isFinite(t) || t < 0) return false;
  if (t >= d - 8) return true;
  return (t / d) >= 0.95;
}

function getSavedProgress({ id, colName }) {
  const key = buildCWKey({ id, col: colName });
  const saved = getContinueWatching().find(x => x.key === key);
  if (!saved) return null;

  const t = Number(saved.time) || 0;
  const d = Number(saved.duration) || 0;

  if (isFinished(t, d)) {
    removeContinueWatchingItem(key);
    return null;
  }

  if (t > 3) return { key, time: t, duration: d };
  return null;
}

function attachMovieProgressTracking({ id, colName, title, posterUrl, type }) {
  if (!movieVideo) return;

  movieVideo._cwCleanup?.();
  let lastSaved = 0;

  const save = () => {
    const t = movieVideo.currentTime || 0;
    const d = movieVideo.duration || 0;

    if (t < 3) return;

    if (isFinished(t, d)) {
      const key = buildCWKey({ id, col: colName });
      removeContinueWatchingItem(key);
      return;
    }

    upsertContinueWatching({
      id,
      col: colName,
      title,
      posterUrl,
      type,
      time: t,
      duration: d
    });
  };

  const throttled = () => {
    const ms = Date.now();
    if (ms - lastSaved > 3500) {
      lastSaved = ms;
      save();
    }
  };

  const onTime = () => throttled();
  const onPause = () => save();
  const onEnded = () => {
    const key = buildCWKey({ id, col: colName });
    removeContinueWatchingItem(key);
  };

  movieVideo.addEventListener("timeupdate", onTime);
  movieVideo.addEventListener("pause", onPause);
  movieVideo.addEventListener("ended", onEnded);

  movieVideo._cwCleanup = () => {
    movieVideo.removeEventListener("timeupdate", onTime);
    movieVideo.removeEventListener("pause", onPause);
    movieVideo.removeEventListener("ended", onEnded);
    movieVideo._cwCleanup = null;
  };
}

/* =========================
   Firestore: resolver ruta del doc
========================= */

function getDetailsDocRef({ colName, id, cid }) {
  // ✅ collections/{cid}/items/{id}
  if (colName === "collections") {
    if (!cid) return null;
    return doc(db, "collections", cid, "items", id);
  }

  // ✅ todo lo demás: trending/estreno/top10/movies/series/animes/etc
  return doc(db, colName, id);
}

/* =========================
   Core
========================= */

async function loadDetails(id, colName, cid) {
  setMsg("Cargando…");

  try {
    const ref = getDetailsDocRef({ colName, id, cid });
    if (!ref) {
      setMsg("Falta el parámetro cid para esta colección.");
      if (titleEl) titleEl.textContent = "No disponible";
      return;
    }

    const snap = await getDoc(ref);

    if (!snap.exists()) {
      setMsg("No se encontró este contenido.");
      if (titleEl) titleEl.textContent = "No disponible";
      return;
    }

    const item = snap.data();

    const title = safeText(item.title, "Sin título");
    const type = safeText(item.type, "");
    const tt = (type || "").toLowerCase();
    const rating = item.rating;

    const backdrop = safeText(item.backdropUrl, "") || safeText(item.posterUrl, "");
    const posterUrl = safeText(item.posterUrl, "");
    const videoUrl = safeText(item.videoUrl, "");

    if (heroBg) heroBg.style.backgroundImage = backdrop ? `url("${backdrop}")` : "none";

    if (poster) {
      poster.innerHTML = posterUrl
        ? `<img src="${posterUrl}" alt="${title}">`
        : `<div style="height:100%;display:grid;place-items:center;color:rgba(255,255,255,.6)">Sin imagen</div>`;
    }

    if (titleEl) titleEl.textContent = title;
    if (typeEl) typeEl.textContent = type ? type.toUpperCase() : "—";

    if (ratingEl) {
      if (rating !== undefined && rating !== null && String(rating).trim() !== "") {
        ratingEl.style.display = "inline-flex";
        ratingEl.textContent = `⭐ ${rating}`;
      } else {
        ratingEl.style.display = "none";
      }
    }

    const year = safeText(item.year, "");
    if (yearEl) yearEl.textContent = year;
    if (specYearEl) specYearEl.style.display = year ? "inline-flex" : "none";

    const dur = formatDuration(item.duration);
    if (durationEl) durationEl.textContent = dur;
    if (specDurationEl) specDurationEl.style.display = dur ? "inline-flex" : "none";

    const description = safeText(item.description, "Sin descripción por ahora.");
    if (descEl) descEl.textContent = description;

    let categories = [];
    if (Array.isArray(item.categories)) categories = item.categories;
    else if (typeof item.categories === "string") {
      categories = item.categories.split(/[,|]/).map(s => s.trim()).filter(Boolean);
    }

    if (categoriesEl) {
      categoriesEl.innerHTML = categories.length
        ? categories.map(c => `<span class="tag">${safeText(c)}</span>`).join("")
        : "";
    }
    if (specCategoriesEl) {
      specCategoriesEl.style.display = categories.length ? "inline-flex" : "none";
    }

    if (addBtn) addBtn.onclick = () => setMsg("Próximo: guardar en Mi lista ✅");

    // ✅ leer contexto de navegación (search)
    const from = getParam("from"); // "search" si viene del buscador
    const q = getParam("q");       // texto (decoded)

    // ===== SERIES/ANIME =====
    if (playBtn && (tt === "serie" || tt === "series" || tt === "anime")) {
      playBtn.textContent = "📺 Ver episodios";
      playBtn.onclick = () => {
        setReturnToCurrentPage();
        const from = getParam("from");
        const q = getParam("q");

        const extra = (colName === "collections" && cid)
          ? `&col=collections&cid=${encodeURIComponent(cid)}`
          : `&col=${encodeURIComponent(colName)}`;

        const origin =
          (from ? `&from=${encodeURIComponent(from)}` : "") +
          (q ? `&q=${q}` : "");

        window.location.href =
          `episodes.html?id=${encodeURIComponent(id)}&season=1${extra}${origin}`;
      };

      setMsg("");
      return;
    }


    // ===== PELÍCULAS =====
    if (!playBtn) return;

    if (!videoUrl) {
      playBtn.textContent = "▶ Reproducir";
      playBtn.onclick = () => setMsg("Esta película no tiene videoUrl.");
      setMsg("");
      return;
    }

    // ✅ CW: evita choques entre colecciones distintas
    const cwCol = (colName === "collections" && cid) ? `collections::${cid}` : colName;

    // ✅ progreso guardado (si existe)
    const saved = getSavedProgress({ id, colName: cwCol });
    const hasProgress = !!saved;

    playBtn.textContent = "▶ Reproducir";

    async function startMovie(startAtSeconds) {
      setMsg("");
      openMovieModal();
      if (movieTitleEl) movieTitleEl.textContent = title;

      try { movieVideo.pause(); } catch {}
      movieVideo.removeAttribute("src");
      try { movieVideo.load(); } catch {}

      movieVideo.src = videoUrl;
      movieVideo.muted = false;
      movieVideo.volume = 1.0;

      const startAt = Math.max(0, Number(startAtSeconds) || 0);

      const apply = () => {
        try { movieVideo.currentTime = startAt; } catch {}
        movieVideo.removeEventListener("loadedmetadata", apply);
      };

      if (Number.isFinite(movieVideo.duration) && movieVideo.duration > 0) apply();
      else movieVideo.addEventListener("loadedmetadata", apply);

      attachMovieProgressTracking({
        id,
        colName: cwCol,
        title,
        posterUrl,
        type: tt || "movie"
      });

      try {
        await movieVideo.play();
      } catch (e) {
        console.warn("Autoplay bloqueado:", e);
        setMsg("Toca ▶️ para reproducir (tu navegador bloqueó autoplay).");
      }

      await enterFullscreenAndLandscapeForMovie();
    }

    if (resumeContinue) {
      resumeContinue.onclick = async () => {
        closeResumeModal();
        await startMovie(saved?.time || 0);
      };
    }

    if (resumeRestart) {
      resumeRestart.onclick = async () => {
        closeResumeModal();
        const key = buildCWKey({ id, col: cwCol });
        removeContinueWatchingItem(key);
        await startMovie(0);
      };
    }

    playBtn.onclick = async () => {
      if (hasProgress) {
        openResumeModal("Tienes progreso guardado. ¿Quieres continuar donde te quedaste?");
        return;
      }
      await startMovie(0);
    };

    setMsg("");

  } catch (e) {
    console.error(e);
    setMsg("Error cargando detalles.");
  }
}

/* =========================
   Back (inteligente)
========================= */

if (backBtn) {
  backBtn.addEventListener("click", () => {
    const ret = consumeReturnTo();

    // ✅ Evita loop: si return_to apunta al MISMO details actual, ignóralo
    if (ret?.url) {
      try {
        const a = new URL(ret.url, window.location.origin);
        const b = new URL(window.location.href);

        const samePath = a.pathname === b.pathname; // /details.html
        const sameId   = a.searchParams.get("id") === b.searchParams.get("id");
        const sameCol  = a.searchParams.get("col") === b.searchParams.get("col");
        const sameCid  = (a.searchParams.get("cid") || "") === (b.searchParams.get("cid") || "");

        const sameDetails = samePath && sameId && sameCol && sameCid;

        if (!sameDetails) {
          window.location.href = ret.url;
          return;
        }
        // si es el mismo details, seguimos al fallback normal
      } catch {
        // si URL inválida, seguimos al fallback normal
      }
    }

    // ✅ fallback: si venías de search
    const from = getParam("from");
    const q = getParam("q");
    if (from === "search") {
      window.location.href = q ? `search.html?q=${q}` : "search.html";
      return;
    }

    // ✅ si vienes de collections
    const colName = getParam("col") || "trending";
    const cid = getParam("cid");
    if (colName === "collections" && cid) {
      window.location.href = `collection.html?id=${encodeURIComponent(cid)}`;
      return;
    }

    window.location.href = "home.html";
  });
}


/* =========================
   Boot
========================= */

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const id = getParam("id");
  const colName = getParam("col") || "trending";
  const cid = getParam("cid"); // ✅ para collections

  if (!id) {
    if (titleEl) titleEl.textContent = "Falta el ID del contenido";
    setMsg("Vuelve a Home y selecciona una tarjeta.");
    return;
  }

  loadDetails(id, colName, cid);
});
