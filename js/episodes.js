// js/episodes.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import {
  doc, getDoc,
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

// ✅ Continue Watching (LOCAL)
import {
  upsertContinueWatching,
  getContinueWatching,
  buildCWKey,
  removeContinueWatchingItem
} from "./continue_watching.js";

import { consumeReturnTo } from "./nav_state.js";

/**
 * ✅ Colecciones donde puede existir el MISMO show con el mismo ID.
 * Orden = preferencia (primero series/animes).
 */
const CANON_SHOW_COLS = ["series", "anime", "animes", "trending", "estreno", "top10"];

/* =========================
   UI
========================= */

const backBtn = document.getElementById("back-btn");
const titleEl = document.getElementById("show-title");
const subEl = document.getElementById("show-sub");

const seasonButtonsEl = document.getElementById("season-buttons");
const episodesTitleEl = document.getElementById("episodes-title");
const episodesCountEl = document.getElementById("episodes-count");
const episodesListEl = document.getElementById("episodes-list");
const msgEl = document.getElementById("msg");

/* =========================
   Player modal
========================= */

const playerModal = document.getElementById("player-modal");
const playerClose = document.getElementById("player-close");
const playerEpTitle = document.getElementById("player-ep-title");
const epVideo = document.getElementById("ep-video");

// Controles
const btnPrev = document.getElementById("player-prev");
const btnNext = document.getElementById("player-next");
const btnSkipIntro = document.getElementById("player-skip-intro");
const toastEl = document.getElementById("player-toast");

/* =========================
   Resume modal (flotante)
========================= */

const resumeModal = document.getElementById("resume-modal");
const resumeClose = document.getElementById("resume-close");
const resumeContinue = document.getElementById("resume-continue");
const resumeRestart = document.getElementById("resume-restart");
const resumeSubtitle = document.getElementById("resume-subtitle");

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

// ✅ Mantener from/q SIEMPRE al actualizar URL
function preserveFromQ(urlObj) {
  const from = getParam("from");
  const q = getParam("q");
  if (from) urlObj.searchParams.set("from", from);
  if (q) urlObj.searchParams.set("q", q);
  return urlObj;
}

function updateUrlParams(pairs = {}) {
  const url = preserveFromQ(new URL(window.location.href));
  Object.entries(pairs).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") url.searchParams.delete(k);
    else url.searchParams.set(k, String(v));
  });
  history.replaceState({}, "", url);
}

// "48m" | 48 | "48" | "1h 30m" | "01:30"
function fmtDuration(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const h = Math.floor(value / 60);
    const m = value % 60;
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  }

  const raw = String(value).trim().toLowerCase();
  if (!raw) return "";

  const onlyNumber = raw.match(/^\d+$/);
  if (onlyNumber) return fmtDuration(Number(onlyNumber[0]));

  const minMatch = raw.match(/(\d+)\s*min/);
  if (minMatch) return fmtDuration(Number(minMatch[1]));

  const mOnly = raw.match(/^(\d+)\s*m$/);
  if (mOnly) return fmtDuration(Number(mOnly[1]));

  const hMatch = raw.match(/(\d+)\s*h/);
  const mmMatch = raw.match(/(\d+)\s*m/);
  if (hMatch || mmMatch) {
    const h = hMatch ? Number(hMatch[1]) : 0;
    const m = mmMatch ? Number(mmMatch[1]) : 0;
    const total = h * 60 + m;
    return total > 0 ? fmtDuration(total) : "";
  }

  const colon = raw.match(/^(\d+):(\d{2})$/);
  if (colon) {
    const total = Number(colon[1]) * 60 + Number(colon[2]);
    return total > 0 ? fmtDuration(total) : "";
  }

  return raw;
}

// ✅ criterio “terminado”
function isFinished(t, d) {
  if (!Number.isFinite(d) || d <= 0) return false;
  if (!Number.isFinite(t) || t < 0) return false;
  if (t >= d - 8) return true;        // últimos 8s
  return (t / d) >= 0.95;             // 95%
}

/* =========================
   Resume modal helpers
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
   Canon resolver (evita duplicados por mismo ID en otra colección)
========================= */

async function resolveCanonicalShowLocation({ id, col, cid }) {
  // ✅ collections es especial: depende de cid (no canonizar)
  if (col === "collections") return { colName: col, cid };

  if (!id) return { colName: col, cid: "" };

  // 1) intenta primero en la col actual
  try {
    const s0 = await getDoc(doc(db, col, id));
    if (s0.exists()) return { colName: col, cid: "" };
  } catch {}

  // 2) busca en el resto de colecciones conocidas
  for (const c of CANON_SHOW_COLS) {
    if (c === col) continue;
    try {
      const s = await getDoc(doc(db, c, id));
      if (s.exists()) return { colName: c, cid: "" };
    } catch {}
  }

  return { colName: col, cid: "" };
}

/* =========================
   Watched Episodes (LOCAL)
========================= */

const WATCHED_KEY = "watched_episodes_v1";

function loadWatchedMap() {
  try { return JSON.parse(localStorage.getItem(WATCHED_KEY) || "{}"); }
  catch { return {}; }
}

function saveWatchedMap(map) {
  localStorage.setItem(WATCHED_KEY, JSON.stringify(map));
}

function watchedEpisodeKey({ id, col, season, episode }) {
  return `${col}::${id}::S${season}::E${episode}`;
}

function markEpisodeWatched({ id, col, season, episode }) {
  const map = loadWatchedMap();
  map[watchedEpisodeKey({ id, col, season, episode })] = true;
  saveWatchedMap(map);
}

function isEpisodeWatched({ id, col, season, episode }) {
  const map = loadWatchedMap();
  return !!map[watchedEpisodeKey({ id, col, season, episode })];
}

function updateEpisodeCardWatchedUI({ season, episode }) {
  const sel = `.episode-card[data-ep="${episode}"][data-season="${season}"]`;
  const card = document.querySelector(sel);
  if (!card) return;
  card.classList.add("is-watched");
  const badge = card.querySelector(".ep-watched");
  if (badge) badge.textContent = "✓ VISTO";
  else {
    const top = card.querySelector(".ep-top");
    if (top) top.insertAdjacentHTML("beforeend", `<span class="ep-watched">✓ VISTO</span>`);
  }
}

/* =========================
   Toast
========================= */

let toastTimer = null;
function showToast(text, ms = 1400) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}

/* =========================
   Player control (back + fullscreen FIX)
========================= */

let playerIsOpen = false;
let playerStatePushed = false;
let closingPlayer = false;

function openPlayerModal() {
  if (!playerModal) return;

  if (!playerIsOpen) {
    playerModal.classList.add("show");
    playerModal.setAttribute("aria-hidden", "false");
    playerIsOpen = true;
  }

  if (!playerStatePushed) {
    history.pushState({ modal: "player" }, "");
    playerStatePushed = true;
  }
}

function exitPlayer() {
  if (!playerModal || !epVideo) return;
  if (closingPlayer) return;
  closingPlayer = true;

  playerModal.classList.remove("show");
  playerModal.setAttribute("aria-hidden", "true");
  playerIsOpen = false;

  try { epVideo.pause(); } catch {}
  epVideo.removeAttribute("src");
  try { epVideo.load(); } catch {}

  try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
  try { if (screen.orientation?.unlock) screen.orientation.unlock(); } catch {}

  playerStatePushed = false;
  setTimeout(() => { closingPlayer = false; }, 200);
}

function requestClosePlayer() {
  if (!playerIsOpen) return;
  if (playerStatePushed) history.back();
  else exitPlayer();
}

playerClose?.addEventListener("click", requestClosePlayer);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") requestClosePlayer();
});

playerModal?.addEventListener("click", (e) => {
  if (e.target === playerModal) requestClosePlayer();
});

window.addEventListener("popstate", () => {
  if (playerIsOpen) exitPlayer();
});

async function enterFullscreenAndLandscape() {
  try {
    if (epVideo && typeof epVideo.webkitEnterFullscreen === "function") {
      epVideo.webkitEnterFullscreen();
      return;
    }
  } catch {}

  try {
    if (epVideo?.requestFullscreen) await epVideo.requestFullscreen();
    else if (playerModal?.requestFullscreen) await playerModal.requestFullscreen();
  } catch (e) {
    console.warn("Fullscreen bloqueado:", e);
  }

  try {
    if (screen.orientation?.lock) await screen.orientation.lock("landscape");
  } catch (e) {
    console.warn("Orientation lock no disponible:", e);
  }
}

document.addEventListener("fullscreenchange", () => {
  if (!playerIsOpen) return;
  if (!document.fullscreenElement) {
    if (playerStatePushed) history.back();
    else exitPlayer();
  }
});

epVideo?.addEventListener("webkitendfullscreen", () => {
  if (!playerIsOpen) return;
  if (playerStatePushed) history.back();
  else exitPlayer();
});

/* =========================
   Continue Watching (LOCAL) + Watched
========================= */

function attachEpisodeProgressTracking({
  contentId,
  colName,
  showTitle,
  posterUrl,
  type,
  season,
  episode,
  episodeTitle
}) {
  if (!epVideo) return;

  epVideo._cwCleanup?.();

  let lastSaved = 0;
  const key = buildCWKey({ id: contentId, col: colName, season, episode });

  const finalizeWatched = () => {
    removeContinueWatchingItem(key);
    markEpisodeWatched({ id: contentId, col: colName, season, episode });
    updateEpisodeCardWatchedUI({ season, episode });
  };

  const save = () => {
    const t = epVideo.currentTime || 0;
    const d = epVideo.duration || 0;

    if (t < 3) return;

    if (isFinished(t, d)) {
      finalizeWatched();
      return;
    }

    upsertContinueWatching({
      id: contentId,
      col: colName,
      title: showTitle,
      posterUrl,
      type,
      season,
      episode,
      episodeTitle,
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
  const onEnded = () => finalizeWatched();

  epVideo.addEventListener("timeupdate", onTime);
  epVideo.addEventListener("pause", onPause);
  epVideo.addEventListener("ended", onEnded);

  epVideo._cwCleanup = () => {
    epVideo.removeEventListener("timeupdate", onTime);
    epVideo.removeEventListener("pause", onPause);
    epVideo.removeEventListener("ended", onEnded);
    epVideo._cwCleanup = null;
  };
}

function getEpisodeSavedProgress({ contentId, colName, season, episode }) {
  const key = buildCWKey({ id: contentId, col: colName, season, episode });
  const saved = getContinueWatching().find(x => x.key === key);
  if (!saved) return null;

  const t = Number(saved.time) || 0;
  const d = Number(saved.duration) || 0;

  if (isFinished(t, d)) {
    removeContinueWatchingItem(key);
    markEpisodeWatched({ id: contentId, col: colName, season, episode });
    return null;
  }

  if (t > 3) return { key, time: t, duration: d };
  return null;
}

/* =========================
   Data
========================= */

let contentId = "";
let colName = "trending";
let cid = ""; // ✅ solo para collections
let seasons = [];
let activeSeasonNumber = 1;

let currentEpisodes = [];
let currentEpisodeIndex = -1;
let currentEpisodeData = null;

// info show para CW
let showTitle = "";
let showPosterUrl = "";
let showType = "";

/* =========================
   Firestore path helpers (🔥 collections support)
========================= */

function getShowDocRef() {
  if (colName === "collections") {
    if (!cid) return null;
    return doc(db, "collections", cid, "items", contentId);
  }
  return doc(db, colName, contentId);
}

function getSeasonsCollectionRef() {
  if (colName === "collections") {
    if (!cid) return null;
    return collection(db, "collections", cid, "items", contentId, "seasons");
  }
  return collection(db, colName, contentId, "seasons");
}

function getEpisodesCollectionRef(seasonId) {
  if (colName === "collections") {
    if (!cid) return null;
    return collection(db, "collections", cid, "items", contentId, "seasons", seasonId, "episodes");
  }
  return collection(db, colName, contentId, "seasons", seasonId, "episodes");
}

/* =========================
   Seasons navigation
========================= */

function getSeasonByNumber(n) {
  return seasons.find(s => s.number === n) || null;
}

function getSeasonIndexByNumber(n) {
  return seasons.findIndex(s => s.number === n);
}

function getNextSeasonNumber(n) {
  const idx = getSeasonIndexByNumber(n);
  if (idx < 0) return seasons[0]?.number || 1;
  const next = seasons[idx + 1];
  return next ? next.number : (seasons[0]?.number || 1);
}

function getPrevSeasonNumber(n) {
  const idx = getSeasonIndexByNumber(n);
  if (idx < 0) return seasons[0]?.number || 1;
  const prev = seasons[idx - 1];
  return prev ? prev.number : (seasons[seasons.length - 1]?.number || 1);
}

/* =========================
   Firestore loaders
========================= */

async function loadContent() {
  const ref = getShowDocRef();
  if (!ref) {
    if (titleEl) titleEl.textContent = "No disponible";
    setMsg("Falta cid para leer esta serie/anime en collections.");
    return null;
  }

  const snap = await getDoc(ref);

  if (!snap.exists()) {
    if (titleEl) titleEl.textContent = "No encontrado";
    setMsg("Este contenido no existe.");
    return null;
  }

  const item = snap.data();

  showTitle = safeText(item.title, "Serie/Anime");
  showPosterUrl = safeText(item.posterUrl, "");
  showType = safeText(item.type, "");

  if (titleEl) titleEl.textContent = showTitle;
  if (subEl) subEl.textContent = "Episodios";
  return item;
}

async function loadSeasons() {
  const seasonsRef = getSeasonsCollectionRef();
  if (!seasonsRef) {
    seasons = [{ id: "1", number: 1, title: "" }];
    return;
  }

  const snap = await getDocs(query(seasonsRef, orderBy("number", "asc")));

  seasons = snap.docs
    .map((d) => {
      const data = d.data() || {};
      const num = Number(data.number);
      const number = Number.isFinite(num) ? num : (Number(d.id) || 0);

      const t = safeText(data.title, "");
      return {
        id: d.id,
        number,
        title: t, // 👈 si no hay title queda ""
      };
    })
    .filter((s) => s.number > 0)
    .sort((a, b) => a.number - b.number);

  if (!seasons.length) seasons = [{ id: "1", number: 1, title: "" }];
}

function seasonLabel(seasonObj) {
  // ✅ Si hay título de temporada, úsalo (también en selector)
  const t = safeText(seasonObj?.title, "");
  if (t) return t;
  // fallback
  return `Temporada ${seasonObj?.number ?? "?"}`;
}

function renderSeasonButtons() {
  if (!seasonButtonsEl) return;
  seasonButtonsEl.innerHTML = "";

  seasons.forEach((s) => {
    const btn = document.createElement("button");
    btn.className = "season-btn";
    btn.type = "button";

    // ✅ aquí también va el nombre, no “T3”
    btn.textContent = seasonLabel(s);

    if (s.number === activeSeasonNumber) btn.classList.add("active");

    btn.addEventListener("click", async () => {
      activeSeasonNumber = s.number;
      updateUrlParams({
        season: activeSeasonNumber,
        col: colName,
        cid: (colName === "collections" ? cid : "")
      });
      renderSeasonButtons();
      await loadEpisodes();
    });

    seasonButtonsEl.appendChild(btn);
  });
}

async function fetchEpisodesForSeason(seasonObj) {
  const epsRef = getEpisodesCollectionRef(seasonObj.id);
  if (!epsRef) return [];

  const epsSnap = await getDocs(query(epsRef, orderBy("number", "asc")));
  if (epsSnap.empty) return [];

  const episodes = epsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  episodes.sort((a, b) => Number(a.number) - Number(b.number));
  return episodes;
}

/* =========================
   Player next/prev + intro
========================= */

function updatePlayerButtons() {
  const hasEp = currentEpisodes.length > 0 && currentEpisodeIndex >= 0;
  if (btnPrev) btnPrev.disabled = !hasEp;
  if (btnNext) btnNext.disabled = !hasEp;
  if (btnSkipIntro) btnSkipIntro.disabled = !hasEp || !epVideo;
}

async function playEpisodeByIndex(seasonNumber, index) {
  const seasonObj = getSeasonByNumber(seasonNumber);
  if (!seasonObj) return;

  if (seasonNumber !== activeSeasonNumber) {
    activeSeasonNumber = seasonNumber;

    updateUrlParams({
      season: activeSeasonNumber,
      col: colName,
      cid: (colName === "collections" ? cid : "")
    });

    renderSeasonButtons();
    await loadEpisodes();
  }

  if (!currentEpisodes.length) {
    setMsg("No hay episodios en esta temporada.");
    return;
  }

  const clamped = Math.max(0, Math.min(index, currentEpisodes.length - 1));
  await playEpisode(currentEpisodes[clamped], clamped);
}

async function playNextEpisode(withToast = false) {
  if (currentEpisodeIndex < 0 || !currentEpisodes.length) return;

  const nextIndex = currentEpisodeIndex + 1;

  if (nextIndex < currentEpisodes.length) {
    if (withToast) showToast("Reproduciendo siguiente episodio…", 1300);
    if (withToast) await new Promise(r => setTimeout(r, 650));
    await playEpisode(currentEpisodes[nextIndex], nextIndex);
    return;
  }

  const nextSeason = getNextSeasonNumber(activeSeasonNumber);
  if (withToast) showToast("Reproduciendo siguiente episodio…", 1300);
  if (withToast) await new Promise(r => setTimeout(r, 650));
  await playEpisodeByIndex(nextSeason, 0);
}

async function playPrevEpisode() {
  if (currentEpisodeIndex < 0 || !currentEpisodes.length) return;

  const prevIndex = currentEpisodeIndex - 1;

  if (prevIndex >= 0) {
    await playEpisode(currentEpisodes[prevIndex], prevIndex);
    return;
  }

  const prevSeason = getPrevSeasonNumber(activeSeasonNumber);
  const prevSeasonObj = getSeasonByNumber(prevSeason);
  if (!prevSeasonObj) return;

  const eps = await fetchEpisodesForSeason(prevSeasonObj);
  if (!eps.length) return;

  await playEpisodeByIndex(prevSeason, eps.length - 1);
}

function getIntroRange(ep) {
  const start = Number(ep?.introStart);
  const end = Number(ep?.introEnd);

  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return { start, end };
  }
  return { start: 0, end: 85 };
}

function skipIntroNow() {
  if (!epVideo || !currentEpisodeData) return;

  const { end } = getIntroRange(currentEpisodeData);
  if (!Number.isFinite(end) || end <= 0) return;

  if (isNaN(epVideo.duration) || epVideo.duration === Infinity) {
    setMsg("Cargando video… intenta de nuevo en 1s.");
    return;
  }

  epVideo.currentTime = Math.min(end, Math.max(0, epVideo.duration - 1));
  showToast("Intro saltada ✅", 900);
  epVideo.play().catch(() => {});
}

/* =========================
   Play episode (con resume modal)
========================= */

let pendingResumeAction = null;

async function reallyPlayEpisode(ep, indexInSeason, startAtSeconds) {
  const url = safeText(ep.videoUrl, "");
  if (!url) {
    setMsg("Este episodio no tiene videoUrl.");
    return;
  }

  setMsg("");
  currentEpisodeIndex = indexInSeason;
  currentEpisodeData = ep;

  openPlayerModal();
  updatePlayerButtons();

  const epNum = Number(ep.number);

  if (playerEpTitle) {
    playerEpTitle.textContent =
      `T${activeSeasonNumber} · E${Number.isFinite(epNum) ? epNum : "?"} · ${safeText(ep.title, "Episodio")}`;
  }

  try { epVideo.pause(); } catch {}
  epVideo.removeAttribute("src");
  try { epVideo.load(); } catch {}

  epVideo.src = url;
  epVideo.muted = false;
  epVideo.volume = 1.0;

  const startAt = Math.max(0, Number(startAtSeconds) || 0);

  const apply = () => {
    try { epVideo.currentTime = startAt; } catch {}
    epVideo.removeEventListener("loadedmetadata", apply);
  };
  if (Number.isFinite(epVideo.duration) && epVideo.duration > 0) apply();
  else epVideo.addEventListener("loadedmetadata", apply);

  const cwCol = (colName === "collections" && cid) ? `collections::${cid}` : colName;

  if (Number.isFinite(epNum)) {
    attachEpisodeProgressTracking({
      contentId,
      colName: cwCol,
      showTitle: showTitle || safeText(titleEl?.textContent, "Serie"),
      posterUrl: showPosterUrl || "",
      type: safeText(showType, "serie"),
      season: activeSeasonNumber,
      episode: epNum,
      episodeTitle: safeText(ep.title, "Episodio")
    });
  }

  try {
    await epVideo.play();
  } catch (e) {
    console.warn("Autoplay bloqueado:", e);
    setMsg("Toca ▶️ para reproducir (tu navegador bloqueó autoplay).");
  }

  await enterFullscreenAndLandscape();
}

async function playEpisode(ep, indexInSeason = -1) {
  const epNum = Number(ep.number);

  if (!Number.isFinite(epNum)) {
    await reallyPlayEpisode(ep, indexInSeason, 0);
    return;
  }

  const cwCol = (colName === "collections" && cid) ? `collections::${cid}` : colName;

  const saved = getEpisodeSavedProgress({
    contentId,
    colName: cwCol,
    season: activeSeasonNumber,
    episode: epNum
  });

  if (saved?.time && saved.time > 3) {
    openResumeModal(`T${activeSeasonNumber} · E${epNum} tiene progreso guardado. ¿Quieres continuar?`);
    pendingResumeAction = { ep, idx: indexInSeason, time: saved.time, key: saved.key };
    return;
  }

  await reallyPlayEpisode(ep, indexInSeason, 0);
}

resumeContinue && (resumeContinue.onclick = async () => {
  if (!pendingResumeAction) return;
  const { ep, idx, time } = pendingResumeAction;
  pendingResumeAction = null;
  closeResumeModal();
  await reallyPlayEpisode(ep, idx, time);
});

resumeRestart && (resumeRestart.onclick = async () => {
  if (!pendingResumeAction) return;
  const { ep, idx, key } = pendingResumeAction;
  pendingResumeAction = null;
  closeResumeModal();
  if (key) removeContinueWatchingItem(key);
  await reallyPlayEpisode(ep, idx, 0);
});

/* =========================
   Episodes list
========================= */

async function loadEpisodes() {
  setMsg("Cargando episodios…");
  if (episodesListEl) episodesListEl.innerHTML = "";

  const seasonObj = getSeasonByNumber(activeSeasonNumber) || seasons[0];
  const seasonTitle = seasonLabel(seasonObj) || `Temporada ${activeSeasonNumber}`;

  if (episodesTitleEl) episodesTitleEl.textContent = seasonTitle;
  if (episodesCountEl) episodesCountEl.textContent = "";

  if (!seasonObj) {
    setMsg("No hay temporadas disponibles.");
    currentEpisodes = [];
    currentEpisodeIndex = -1;
    currentEpisodeData = null;
    updatePlayerButtons();
    return;
  }

  try {
    const episodes = await fetchEpisodesForSeason(seasonObj);

    currentEpisodes = episodes;
    currentEpisodeIndex = -1;
    currentEpisodeData = null;
    updatePlayerButtons();

    if (!episodes.length) {
      setMsg("No hay episodios en esta temporada.");
      return;
    }

    if (episodesCountEl) episodesCountEl.textContent = `${episodes.length} episodios`;
    setMsg("");

    episodes.forEach((ep, idx) => {
      const num = Number(ep.number);
      const epTitle = safeText(ep.title, `Episodio ${Number.isFinite(num) ? num : ""}`);
      const dur = fmtDuration(ep.duration);
      const thumb = safeText(ep.thumbnailUrl, "");

      const cwCol = (colName === "collections" && cid) ? `collections::${cid}` : colName;

      const watched = Number.isFinite(num)
        ? isEpisodeWatched({ id: contentId, col: cwCol, season: activeSeasonNumber, episode: num })
        : false;

      const card = document.createElement("div");
      card.className = "episode-card" + (watched ? " is-watched" : "");
      card.dataset.season = String(activeSeasonNumber);
      card.dataset.ep = String(Number.isFinite(num) ? num : "");

      card.innerHTML = `
        ${thumb
          ? `<img class="ep-thumb" src="${thumb}" alt="${epTitle}">`
          : `<div class="ep-thumb" style="display:grid;place-items:center;background:rgba(255,255,255,.06);color:rgba(255,255,255,.55);">Sin imagen</div>`
        }
        <div class="ep-info">
          <div class="ep-top" style="display:flex;align-items:center;gap:10px;">
            <span class="ep-num">E${Number.isFinite(num) ? num : "—"}</span>
            <span class="ep-name" style="flex:1;min-width:0;">${epTitle}</span>
            ${watched ? `<span class="ep-watched">✓ VISTO</span>` : ``}
          </div>
          <div class="ep-meta">${dur ? dur : ""}</div>
        </div>
      `;

      card.addEventListener("click", () => playEpisode(ep, idx));
      episodesListEl?.appendChild(card);
    });

  } catch (e) {
    console.error(e);
    currentEpisodes = [];
    currentEpisodeIndex = -1;
    currentEpisodeData = null;
    updatePlayerButtons();
    setMsg("Error cargando episodios.");
  }
}

/* =========================
   Player events
========================= */

epVideo?.addEventListener("ended", () => {
  if (playerIsOpen) playNextEpisode(true).catch(console.error);
});

btnNext?.addEventListener("click", () => playNextEpisode(false));
btnPrev?.addEventListener("click", () => playPrevEpisode());
btnSkipIntro?.addEventListener("click", () => skipIntroNow());

/* =========================
   Navigation (Back → Details, preserva from/q/cid)
========================= */

backBtn?.addEventListener("click", () => {
  // ✅ si venimos desde details, volvemos exacto (con scroll)
  const ret = consumeReturnTo?.();
  if (ret?.url) {
    window.location.href = ret.url;
    return;
  }

  // fallback: volver a details preservando parámetros
  const from = getParam("from");
  const q = getParam("q");

  const url = new URL("details.html", document.baseURI);
  url.searchParams.set("id", contentId);
  url.searchParams.set("col", colName);

  if (colName === "collections" && cid) url.searchParams.set("cid", cid);
  if (from) url.searchParams.set("from", from);
  if (q) url.searchParams.set("q", q);

  window.location.href = url.toString();
});

/* =========================
   Boot
========================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  contentId = getParam("id") || "";
  colName = getParam("col") || "trending";
  cid = getParam("cid") || "";

  if (!contentId) {
    if (titleEl) titleEl.textContent = "Falta ID";
    setMsg("Vuelve y selecciona una serie/anime.");
    return;
  }

  // ✅ Canoniza SOLO si NO es collections
  const resolved = await resolveCanonicalShowLocation({ id: contentId, col: colName, cid });
  colName = resolved.colName;
  cid = resolved.cid || cid;

  // ✅ Normaliza URL (col/cid) sin perder from/q
  updateUrlParams({
    col: colName,
    cid: (colName === "collections" ? cid : "")
  });

  const seasonParamRaw = getParam("season");

  if (colName === "collections" && !cid) {
    if (titleEl) titleEl.textContent = "No disponible";
    setMsg("Falta el parámetro cid para leer esta serie/anime en collections.");
    return;
  }

  const item = await loadContent();
  if (!item) return;

  // ✅ Solo para series/anime; si no, regresa a details
  const t = safeText(item.type, "").toLowerCase();
  if (t !== "serie" && t !== "series" && t !== "anime") {
    const url = new URL("details.html", document.baseURI);
    url.searchParams.set("id", contentId);
    url.searchParams.set("col", colName);
    if (colName === "collections" && cid) url.searchParams.set("cid", cid);
    const from = getParam("from");
    const q = getParam("q");
    if (from) url.searchParams.set("from", from);
    if (q) url.searchParams.set("q", q);
    window.location.href = url.toString();
    return;
  }

  await loadSeasons();

  if (!seasonParamRaw) {
    activeSeasonNumber = seasons[0]?.number || 1;
  } else {
    const n = Number(seasonParamRaw);
    activeSeasonNumber = seasons.some(s => s.number === n) ? n : (seasons[0]?.number || 1);
  }

  // ✅ asegurar season/col/cid en URL preservando from/q
  updateUrlParams({
    season: activeSeasonNumber,
    col: colName,
    cid: (colName === "collections" ? cid : "")
  });

  renderSeasonButtons();
  await loadEpisodes();
});
