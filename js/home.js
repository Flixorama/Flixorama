// js/home.js
import { auth, db } from "./firebase.js";

import {
  collection,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";

// ✅ IMPORTS SIEMPRE ARRIBA
import { getContinueWatching, pctWatched } from "./continue_watching.js";

// ✅ Return-to (sessionStorage)
import { setReturnToCurrentPage } from "./nav_state.js";

import { showStartupModalOnce } from "./startup_modal.js";


window.addEventListener("DOMContentLoaded", () => {
  const emailEl = document.getElementById("user-email");
  const statusEl = document.getElementById("status");
  const logoutBtn = document.getElementById("logout-btn");
  const avatar = document.getElementById("avatar");

  const greetingEl = document.getElementById("welcome-greeting");
  const nameEl = document.getElementById("welcome-name");

  // ===== Trending =====
  const trendingTrack = document.getElementById("trending-track");
  const dotsEl = document.getElementById("trend-dots");
  const trendLeft = document.getElementById("trend-left");
  const trendRight = document.getElementById("trend-right");

  // ===== Estrenos =====
  const estrenoTrack = document.getElementById("estreno-track");
  const estrenoLeft = document.getElementById("estreno-left");
  const estrenoRight = document.getElementById("estreno-right");

  // ===== Top 10 =====
  const top10Track = document.getElementById("top10-track");
  const top10Left = document.getElementById("top10-left");
  const top10Right = document.getElementById("top10-right");

  // ===== Continuar viendo (LOCAL) =====
  const cwTrack = document.getElementById("cw-track");
  const cwLeft = document.getElementById("cw-left");
  const cwRight = document.getElementById("cw-right");

  // ===== colecciones =====
  const collectionsTrack = document.getElementById("collections-track");
  const collectionsLeft = document.getElementById("collections-left");
  const collectionsRight = document.getElementById("collections-right");

  const openSearchBtn = document.getElementById("open-search");

  openSearchBtn?.addEventListener("click", () => {
    window.location.href = "search.html";
  });

  // Atajo: Ctrl + K
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      window.location.href = "search.html";
    }
  });

  /* =========================
     Helpers
  ========================= */

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Buenos días";
    if (hour >= 12 && hour < 18) return "Buenas tardes";
    return "Buenas noches";
  }

  function getUserName(u) {
    if (!u?.email) return "Usuario";
    return u.email.split("@")[0];
  }

  function safeText(v, fb = "") {
    if (v === undefined || v === null) return fb;
    const s = String(v).trim();
    return s ? s : fb;
  }

  function scrollByOne(track, dir, selector) {
    if (!track) return;
    const card = track.querySelector(selector);
    if (!card) return;

    const gap = 12;
    const step = card.getBoundingClientRect().width + gap;
    track.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  /* =========================
     Collections cards
  ========================= */

  function createCollectionCard(item, id) {
    const title = safeText(item.title, "Colección");
    const cover = safeText(item.coverUrl, "");

    const card = document.createElement("div");
    card.className = "collection-card";

    card.innerHTML = `
      <div class="collection-inner">
        ${cover ? `<img class="collection-img" src="${cover}" alt="${title}">` : ""}
        <div class="collection-overlay"></div>
        <div class="collection-title">${title}</div>
      </div>
    `;

    const img = card.querySelector(".collection-img");
    if (img) {
      img.addEventListener("error", () => {
        img.remove();
        card.querySelector(".collection-inner")?.insertAdjacentHTML(
          "afterbegin",
          `<div style="height:100%;display:grid;place-items:center;background:rgba(255,255,255,.06);color:rgba(255,255,255,.55);font-size:12px;">Sin imagen</div>`
        );
      });
    }

    card.addEventListener("click", () => {
      // ✅ para que Details pueda volver bien si luego entras a un item de colección
      setReturnToCurrentPage();
;
      window.location.href = `collection.html?id=${encodeURIComponent(id)}`;
    });

    return card;
  }

  async function loadCollections() {
    if (!collectionsTrack) return;

    collectionsTrack.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const sk = document.createElement("div");
      sk.className = "collection-card";
      sk.style.opacity = "0.55";
      sk.innerHTML = `
        <div class="collection-inner">
          <div style="height:100%;width:100%;background:linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.09), rgba(255,255,255,.05));"></div>
        </div>
      `;
      collectionsTrack.appendChild(sk);
    }

    try {
      const snap = await getDocs(query(collection(db, "collections"), orderBy("title", "asc"), limit(20)));
      collectionsTrack.innerHTML = "";

      if (snap.empty) {
        collectionsTrack.innerHTML = `<p style="color:rgba(255,255,255,.6);margin-left:12px;">No hay colecciones aún.</p>`;
        return;
      }

      snap.forEach((docSnap) => {
        collectionsTrack.appendChild(createCollectionCard(docSnap.data(), docSnap.id));
      });

    } catch (e) {
      console.error("Error cargando colecciones:", e);
      collectionsTrack.innerHTML = `<p style="color:#ff5c5c;margin-left:12px;">Error cargando colecciones.</p>`;
    }
  }

  /* =========================
     Cards
  ========================= */

  // Trending card
  function createTrendingCard(item, id, colName = "trending") {
    const imgUrl = safeText(item.posterUrl, "");
    const title = safeText(item.title, "Sin título");
    const type = safeText(item.type, "");
    const ratingOk =
      item.rating !== undefined &&
      item.rating !== null &&
      String(item.rating).trim() !== "";

    const card = document.createElement("div");
    card.className = "trend-card";

    card.innerHTML = `
      <div class="trend-inner">
        ${imgUrl ? `<img class="trend-img" src="${imgUrl}" alt="${title}">` : ""}
        <div class="trend-overlay"></div>

        <div class="trend-meta">
          <div class="trend-title">${title}</div>
          <div class="trend-info">
            <span class="trend-type">${type}</span>
            ${ratingOk ? `<span class="trend-rating">⭐ ${item.rating}</span>` : ""}
          </div>
        </div>
      </div>
    `;

    const img = card.querySelector(".trend-img");
    if (img) {
      img.addEventListener("error", () => {
        img.remove();
        const inner = card.querySelector(".trend-inner");
        inner.insertAdjacentHTML(
          "afterbegin",
          `<div style="height:100%;display:grid;place-items:center;background:rgba(255,255,255,.06);color:rgba(255,255,255,.55);font-size:12px;">Imagen no disponible</div>`
        );
      });
    }

    card.addEventListener("click", () => {
      setReturnToCurrentPage();
;
      window.location.href =
        `details.html?id=${encodeURIComponent(id)}&col=${encodeURIComponent(colName)}`;
    });

    return card;
  }

  // Estrenos card
  function createReleaseCard(item, id) {
    const imgUrl = safeText(item.posterUrl, "");
    const title = safeText(item.title, "Sin título");
    const type = safeText(item.type, "");
    const ratingOk =
      item.rating !== undefined &&
      item.rating !== null &&
      String(item.rating).trim() !== "";

    const card = document.createElement("div");
    card.className = "release-card";

    card.innerHTML = `
      <div class="release-inner">
        ${imgUrl ? `<img class="release-img" src="${imgUrl}" alt="${title}">` : ""}

        <div class="release-meta">
          <div class="release-title">${title}</div>
          <div class="release-info">
            <span class="release-type">${type}</span>
            ${ratingOk ? `<span class="release-rating">⭐ ${item.rating}</span>` : ""}
          </div>
        </div>
      </div>
    `;

    const img = card.querySelector(".release-img");
    if (img) {
      img.addEventListener("error", () => {
        img.remove();
        const inner = card.querySelector(".release-inner");
        inner.insertAdjacentHTML(
          "afterbegin",
          `<div style="height:100%;display:grid;place-items:center;background:rgba(255,255,255,.06);color:rgba(255,255,255,.55);font-size:12px;">Imagen no disponible</div>`
        );
      });
    }

    card.addEventListener("click", () => {
      setReturnToCurrentPage();
;
      window.location.href = `details.html?id=${encodeURIComponent(id)}&col=estreno`;
    });

    return card;
  }

  // Top10 card
  function createTop10Card(item, id, rankNumber) {
    const imgUrl = safeText(item.posterUrl, "");
    const title = safeText(item.title, "Sin título");

    const rank = Number(rankNumber) || 0;

    const card = document.createElement("div");
    card.className = "top10-card";

    if (rank === 1) card.classList.add("top10-gold");
    if (rank === 2) card.classList.add("top10-silver");
    if (rank === 3) card.classList.add("top10-bronze");

    const badgeClass =
      rank === 1 ? "top10-badge number-one" :
      rank === 2 ? "top10-badge number-two" :
      rank === 3 ? "top10-badge number-three" :
      "top10-badge";

    card.innerHTML = `
      <div class="top10-image-wrapper">
        ${imgUrl ? `<img src="${imgUrl}" alt="${title}">` : ""}
        <div class="top10-overlay"></div>

        <div class="${badgeClass}">
          ${rank === 1 ? `<span class="crown">👑</span>` : ""}
          ${rank}
        </div>
      </div>

      <div class="top10-title">${title}</div>
    `;

    const img = card.querySelector("img");
    if (img) {
      img.addEventListener("error", () => {
        img.remove();
        card.querySelector(".top10-image-wrapper")?.insertAdjacentHTML(
          "afterbegin",
          `<div style="height:100%;display:grid;place-items:center;color:rgba(255,255,255,.6);font-size:12px;">Sin imagen</div>`
        );
      });
    }

    card.addEventListener("click", () => {
      setReturnToCurrentPage();
;
      window.location.href = `details.html?id=${encodeURIComponent(id)}&col=top10`;
    });

    return card;
  }

  // ✅ Continuar viendo card (LOCAL)
  function createCWCard(item) {
    const card = document.createElement("div");
    card.className = "release-card";

    const p = pctWatched(item.time, item.duration);

    const subtitle = (Number.isFinite(item.season) && Number.isFinite(item.episode))
      ? `T${item.season} · E${item.episode}`
      : (item.type || "");

    const title = safeText(item.title, "Sin título");
    const posterUrl = safeText(item.posterUrl, "");

    card.innerHTML = `
      <div class="release-inner">
        ${posterUrl ? `<img class="release-img" src="${posterUrl}" alt="${title}">` : ""}

        <div class="release-meta">
          <div class="release-title">${title}</div>
          <div class="release-info">
            <span class="release-type">${subtitle}</span>
            <span class="release-rating">${p}%</span>
          </div>

          <div class="cw-bar">
            <div class="cw-bar-fill" style="width:${p}%"></div>
          </div>
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      // ✅ para que Details (y también Episodes→Details) puedan volver a Home
      setReturnToCurrentPage();
;

      // ✅ col puede venir como "collections::CID" desde CW
      const rawCol = safeText(item.col, "trending");
      let col = rawCol;
      let cid = "";

      if (rawCol.startsWith("collections::")) {
        col = "collections";
        cid = rawCol.split("collections::")[1] || "";
      }

      // episodio
if (Number.isFinite(item.season) && Number.isFinite(item.episode)) {
  const url = new URL("episodes.html", document.baseURI);
  url.searchParams.set("id", item.id);
  url.searchParams.set("season", String(item.season));
  url.searchParams.set("col", col);
  if (col === "collections" && cid) url.searchParams.set("cid", cid);
  window.location.href = url.toString();
  return;
}

// película
const durl = new URL("details.html", document.baseURI);
durl.searchParams.set("id", item.id);
durl.searchParams.set("col", col);
if (col === "collections" && cid) durl.searchParams.set("cid", cid);
window.location.href = durl.toString();
    });

    return card;
  }

  /* =========================
     Trending autoplay + dots
  ========================= */

  let autoIndex = 0;
  let autoTimer = null;
  const AUTO_DELAY = 9000;

  function stopAutoplay() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  function getTrendingCards() {
    return trendingTrack ? Array.from(trendingTrack.querySelectorAll(".trend-card")) : [];
  }

  function updateDots() {
    if (!dotsEl) return;
    const dots = dotsEl.querySelectorAll(".dot");
    dots.forEach((d, i) => d.classList.toggle("active", i === autoIndex));
  }

  function renderDots() {
    if (!dotsEl) return;

    const cards = getTrendingCards();
    dotsEl.innerHTML = "";

    cards.forEach((_, idx) => {
      const dot = document.createElement("button");
      dot.className = "dot";
      dot.type = "button";
      dot.addEventListener("click", () => {
        stopAutoplay();
        scrollToIndex(idx, true);
        startAutoplay();
      });
      dotsEl.appendChild(dot);
    });

    updateDots();
  }

  function setIndexFromVisibleCard() {
    const cards = getTrendingCards();
    if (!cards.length || !trendingTrack) return;

    const trackRect = trendingTrack.getBoundingClientRect();
    const trackCenter = trackRect.left + trackRect.width / 2;

    let bestIdx = 0;
    let bestDist = Infinity;

    cards.forEach((card, idx) => {
      const r = card.getBoundingClientRect();
      const c = r.left + r.width / 2;
      const dist = Math.abs(trackCenter - c);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });

    autoIndex = bestIdx;
    updateDots();
  }

  function scrollToIndex(index, smooth = true) {
    const cards = getTrendingCards();
    if (!cards.length || !trendingTrack) return;

    if (index < 0) index = 0;
    if (index >= cards.length) index = cards.length - 1;

    autoIndex = index;

    const card = cards[autoIndex];

    // centra la card dentro del carrusel SIN tocar el scroll vertical
    const trackRect = trendingTrack.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    const currentLeft = trendingTrack.scrollLeft;
    const cardOffsetLeft = cardRect.left - trackRect.left;
    const targetLeft =
      currentLeft + cardOffsetLeft - (trackRect.width / 2) + (cardRect.width / 2);

    trendingTrack.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: smooth ? "smooth" : "auto"
    });

    updateDots();
  }

  async function elegantResetToStart() {
    if (!trendingTrack) return;
    trendingTrack.classList.add("is-fading");
    await new Promise((r) => setTimeout(r, 230));
    scrollToIndex(0, false);
    trendingTrack.classList.remove("is-fading");
  }

  function startAutoplay() {
    stopAutoplay();
    autoTimer = setInterval(async () => {
      const cards = getTrendingCards();
      if (!cards.length) return;

      setIndexFromVisibleCard();

      if (autoIndex >= cards.length - 1) {
        await elegantResetToStart();
        autoIndex = 0;
        updateDots();
      } else {
        scrollToIndex(autoIndex + 1, true);
      }
    }, AUTO_DELAY);
  }

  // Flechas trending
  if (trendLeft) {
    trendLeft.addEventListener("click", () => {
      stopAutoplay();
      setIndexFromVisibleCard();
      scrollToIndex(autoIndex - 1, true);
      startAutoplay();
    });
  }

  if (trendRight) {
    trendRight.addEventListener("click", () => {
      stopAutoplay();
      setIndexFromVisibleCard();
      scrollToIndex(autoIndex + 1, true);
      startAutoplay();
    });
  }

  // Interacción trending
  if (trendingTrack) {
    trendingTrack.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        trendingTrack.scrollBy({ left: e.deltaY, behavior: "auto" });
      }
    }, { passive: false });

    let scrollStopTimer = null;
    trendingTrack.addEventListener("scroll", () => {
      stopAutoplay();
      clearTimeout(scrollStopTimer);
      scrollStopTimer = setTimeout(() => {
        setIndexFromVisibleCard();
        startAutoplay();
      }, 250);
    }, { passive: true });

    trendingTrack.addEventListener("mouseenter", stopAutoplay);
    trendingTrack.addEventListener("mouseleave", () => {
      setIndexFromVisibleCard();
      startAutoplay();
    });
  }

  // Flechas estrenos
  if (estrenoLeft) estrenoLeft.addEventListener("click", () => scrollByOne(estrenoTrack, -1, ".release-card"));
  if (estrenoRight) estrenoRight.addEventListener("click", () => scrollByOne(estrenoTrack, 1, ".release-card"));

  // Flechas top10
  if (top10Left) top10Left.addEventListener("click", () => scrollByOne(top10Track, -1, ".top10-card"));
  if (top10Right) top10Right.addEventListener("click", () => scrollByOne(top10Track, 1, ".top10-card"));

  // Flechas continuar viendo
  if (cwLeft) cwLeft.addEventListener("click", () => scrollByOne(cwTrack, -1, ".release-card"));
  if (cwRight) cwRight.addEventListener("click", () => scrollByOne(cwTrack, 1, ".release-card"));

  // Flechas colecciones (si las usas)
  if (collectionsLeft) collectionsLeft.addEventListener("click", () => scrollByOne(collectionsTrack, -1, ".collection-card"));
  if (collectionsRight) collectionsRight.addEventListener("click", () => scrollByOne(collectionsTrack, 1, ".collection-card"));

  // Avatar
  if (avatar) {
    avatar.addEventListener("click", () => {
      window.location.href = "profile.html";
    });
  }

  /* =========================
     Loaders
  ========================= */

  async function loadTrending() {
    if (!trendingTrack) return;

    trendingTrack.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const sk = document.createElement("div");
      sk.className = "trend-card";
      sk.style.opacity = "0.55";
      sk.innerHTML = `
        <div class="trend-inner">
          <div style="height:100%;width:100%;background:linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.09), rgba(255,255,255,.05));"></div>
        </div>
      `;
      trendingTrack.appendChild(sk);
    }

    try {
      const q = query(collection(db, "trending"), orderBy("rank", "asc"), limit(12));
      const snap = await getDocs(q);

      trendingTrack.innerHTML = "";

      if (snap.empty) {
        trendingTrack.innerHTML = `<p style="color:rgba(255,255,255,.6)">No hay tendencias aún.</p>`;
        stopAutoplay();
        if (dotsEl) dotsEl.innerHTML = "";
        return;
      }

      snap.forEach((docSnap) => {
        trendingTrack.appendChild(createTrendingCard(docSnap.data(), docSnap.id, "trending"));
      });

      autoIndex = 0;
      renderDots();
      scrollToIndex(0, false);
      startAutoplay();

    } catch (e) {
      console.error(e);
      trendingTrack.innerHTML = `<p style="color:#ff5c5c">Error cargando tendencias.</p>`;
      stopAutoplay();
      if (dotsEl) dotsEl.innerHTML = "";
    }
  }

  async function loadEstrenos() {
    if (!estrenoTrack) return;

    estrenoTrack.innerHTML = "";
    for (let i = 0; i < 10; i++) {
      const sk = document.createElement("div");
      sk.className = "release-card";
      sk.style.opacity = "0.55";
      sk.innerHTML = `
        <div class="release-inner">
          <div style="height:100%;width:100%;background:linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.09), rgba(255,255,255,.05));"></div>
        </div>
      `;
      estrenoTrack.appendChild(sk);
    }

    try {
      const q = query(collection(db, "estreno"), orderBy("rank", "asc"), limit(12));
      const snap = await getDocs(q);

      estrenoTrack.innerHTML = "";

      if (snap.empty) {
        estrenoTrack.innerHTML = `<p style="color:rgba(255,255,255,.6)">No hay estrenos aún.</p>`;
        return;
      }

      snap.forEach((docSnap) => {
        estrenoTrack.appendChild(createReleaseCard(docSnap.data(), docSnap.id));
      });

    } catch (e) {
      console.error("Error cargando estrenos:", e);
      estrenoTrack.innerHTML = `<p style="color:#ff5c5c">Error cargando estrenos.</p>`;
    }
  }

  async function loadTop10() {
    if (!top10Track) return;

    top10Track.innerHTML = "";
    for (let i = 0; i < 10; i++) {
      const sk = document.createElement("div");
      sk.className = "top10-card";
      sk.style.opacity = "0.55";
      sk.innerHTML = `
        <div class="top10-image-wrapper">
          <div style="height:100%;width:100%;background:linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.09), rgba(255,255,255,.05));"></div>
        </div>
        <div class="top10-title" style="height:16px;"></div>
      `;
      top10Track.appendChild(sk);
    }

    try {
      const snap = await getDocs(collection(db, "top10"));

      top10Track.innerHTML = "";

      if (snap.empty) {
        top10Track.innerHTML = `<p style="color:rgba(255,255,255,.6)">No hay Top 10 aún.</p>`;
        return;
      }

      const items = snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, ...data, __rank: Number(data?.rank) };
      });

      const sorted = items
        .filter(x => Number.isFinite(x.__rank) && x.__rank > 0)
        .sort((a, b) => a.__rank - b.__rank)
        .slice(0, 10);

      const finalList = sorted.length ? sorted : items.slice(0, 10);

      finalList.forEach((item, idx) => {
        const badge = Number.isFinite(item.__rank) ? item.__rank : (idx + 1);
        top10Track.appendChild(createTop10Card(item, item.id, badge));
      });

    } catch (e) {
      console.error("Error cargando Top 10:", e);
      top10Track.innerHTML = `<p style="color:#ff5c5c">Error cargando Top 10.</p>`;
    }
  }

  function loadContinueWatching() {
    if (!cwTrack) return;

    const list = getContinueWatching();
    cwTrack.innerHTML = "";

    if (!list.length) {
      cwTrack.innerHTML = `<p style="color:rgba(255,255,255,.55);margin-left:15px;">Aún no hay nada para continuar.</p>`;
      return;
    }

    list.forEach(item => cwTrack.appendChild(createCWCard(item)));
  }

  /* =========================
     Auth
  ========================= */

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    if (emailEl) emailEl.textContent = user.email || "Usuario";
    if (statusEl) statusEl.textContent = "Sesión activa ✅";

    if (greetingEl) greetingEl.textContent = getGreeting();
    if (nameEl) nameEl.textContent = getUserName(user);

    loadTrending();
    loadEstrenos();
    loadTop10();

    // ✅ local
    loadContinueWatching();

    // ✅ colecciones (Firestore)
    loadCollections();
    showStartupModalOnce();

  });

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      logoutBtn.disabled = true;
      if (statusEl) statusEl.textContent = "Cerrando sesión…";
      try {
        await signOut(auth);
        window.location.href = "index.html";
      } catch (e) {
        console.error(e);
        if (statusEl) statusEl.textContent = "No se pudo cerrar sesión.";
        logoutBtn.disabled = false;
      }
    });
  }
});
