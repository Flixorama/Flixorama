// js/collection.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

// ✅ Return-to stack
import { setReturnToCurrentPage } from "./nav_state.js";

window.addEventListener("DOMContentLoaded", () => {
  /* =========================
     UI
  ========================= */

  const backBtn = document.getElementById("back-btn");
  const titleEl = document.getElementById("collection-title");
  const descEl = document.getElementById("collection-desc");
  const gridEl = document.getElementById("collection-grid");
  const msgEl = document.getElementById("msg");

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

  function clearGrid() { if (gridEl) gridEl.innerHTML = ""; }

  function skeleton(n = 8) {
    if (!gridEl) return;
    gridEl.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const sk = document.createElement("div");
      sk.className = "collection-skeleton";
      gridEl.appendChild(sk);
    }
  }

  function toRankNumber(v) {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : 999999;
  }

  function buildCard({ img, title, pills = [] }) {
    const t = safeText(title, "Sin título");

    const el = document.createElement("div");
    el.className = "collection-item";
    el.tabIndex = 0;

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
     Render: Listado de colecciones
  ========================= */

  async function renderCollectionsList() {
    clearGrid();
    skeleton(10);
    setMsg("Cargando colecciones…");

    if (titleEl) titleEl.textContent = "Colecciones";
    if (descEl) descEl.textContent = "Elige una saga/colección para ver sus películas.";

    try {
      const snap = await getDocs(collection(db, "collections"));
      clearGrid();

      if (snap.empty) {
        setMsg("No hay colecciones todavía en Firestore (collections).");
        return;
      }

      setMsg("");

      snap.forEach((d) => {
        const data = d.data() || {};
        const cid = d.id;

        const card = buildCard({
          img: safeText(data.coverUrl, ""),
          title: safeText(data.title, cid),
          pills: [safeText(data.description, "")]
        });

        const go = () => {
          // ✅ guardamos esta pantalla para poder volver con back inteligente
          setReturnToCurrentPage();
          window.location.href = `collection.html?id=${encodeURIComponent(cid)}`;
        };

        card.addEventListener("click", go);
        card.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });

        gridEl?.appendChild(card);
      });

    } catch (e) {
      console.error(e);
      clearGrid();
      setMsg("Error cargando colecciones. Revisa consola y reglas de Firestore.");
    }
  }

  /* =========================
     Render: Items de una colección
  ========================= */

  async function renderCollectionItems(collectionId) {
    clearGrid();
    skeleton(12);
    setMsg("Cargando colección…");

    try {
      const colDocRef = doc(db, "collections", collectionId);
      const colSnap = await getDoc(colDocRef);

      if (!colSnap.exists()) {
        clearGrid();
        setMsg("Esta colección no existe.");
        if (titleEl) titleEl.textContent = "Colección no encontrada";
        if (descEl) descEl.textContent = "";
        return;
      }

      const colData = colSnap.data() || {};
      const colTitle = safeText(colData.title, collectionId);
      const colDesc = safeText(colData.description, "");

      if (titleEl) titleEl.textContent = colTitle;
      if (descEl) descEl.textContent = colDesc;

      setMsg("Cargando películas…");
      const itemsRef = collection(db, "collections", collectionId, "items");
      const itemsSnap = await getDocs(itemsRef);

      clearGrid();

      if (itemsSnap.empty) {
        setMsg("Esta colección no tiene películas todavía.");
        return;
      }

      const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      items.sort((a, b) => {
        const ra = toRankNumber(a.rank);
        const rb = toRankNumber(b.rank);
        if (ra !== rb) return ra - rb;

        const ya = Number(a.year) || 0;
        const yb = Number(b.year) || 0;
        return ya - yb;
      });

      setMsg("");

      items.forEach((item) => {
        const movieId = item.id;

        const movieTitle = safeText(item.title, movieId);
        const posterUrl = safeText(item.posterUrl, "") || safeText(item.backdropUrl, "");

        const pillRank = Number.isFinite(Number(item.rank)) ? `#${Number(item.rank)}` : "";
        const pillA = safeText(item.year, "");
        const pillB = safeText(item.duration, "");

        const card = buildCard({
          img: posterUrl,
          title: movieTitle,
          pills: [pillRank, pillA || pillB].filter(Boolean)
        });

        const go = () => {
          // ✅ guardamos collection.html?id=... como retorno
          setReturnToCurrentPage();

          window.location.href =
            `details.html?id=${encodeURIComponent(movieId)}&col=collections&cid=${encodeURIComponent(collectionId)}`;
        };

        card.addEventListener("click", go);
        card.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });

        gridEl?.appendChild(card);
      });

    } catch (e) {
      console.error(e);
      clearGrid();
      setMsg("Error cargando items. Revisa consola y reglas de Firestore.");
    }
  }

  /* =========================
     Back
  ========================= */

  backBtn?.addEventListener("click", () => {
    const collectionId = getParam("id");

    // ✅ si estás dentro de una colección → vuelve al listado
    if (collectionId) {
      window.location.href = "home.html";
      return;
    }

    // ✅ si estás en el listado → vuelve a home
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

    const collectionId = getParam("id");
    if (!collectionId) await renderCollectionsList();
    else await renderCollectionItems(collectionId);
  });
});
