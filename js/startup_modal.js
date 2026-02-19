// js/startup_modal.js
import { db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

// ✅ una vez por “inicio de app” (cada recarga / nueva pestaña)
const STARTUP_SEEN_KEY = "startup_seen_v1";

function safeText(v, fb = "") {
  if (v === undefined || v === null) return fb;
  const s = String(v).trim();
  return s ? s : fb;
}

export async function showStartupModalOnce() {
  try {
    // ✅ solo una vez por sesión del navegador
    if (sessionStorage.getItem(STARTUP_SEEN_KEY) === "1") return;

    const modal = document.getElementById("startup-modal");
    const closeBtn = document.getElementById("startup-close");
    const imgEl = document.getElementById("startup-image");
    const titleEl = document.getElementById("startup-title");
    const msgEl = document.getElementById("startup-message");
    const secEl = document.getElementById("startup-seconds");

    if (!modal || !imgEl || !secEl || !closeBtn) return;

    // 1) leer config desde Firestore: app_config/startup
    const cfgRef = doc(db, "app_config", "startup");
    const cfgSnap = await getDoc(cfgRef);
    if (!cfgSnap.exists()) return;

    const cfg = cfgSnap.data() || {};
    if (!cfg.enabled) return;

    const imageUrl = safeText(cfg.imageUrl, "");
    if (!imageUrl) return;

    const durationSeconds = Math.max(1, Math.floor(Number(cfg.durationSeconds) || 5));

    // 2) pintar UI
    if (titleEl) titleEl.textContent = safeText(cfg.title, "");
    if (msgEl) msgEl.textContent = safeText(cfg.message, "");

    imgEl.alt = safeText(cfg.title, "Startup");
    imgEl.src = imageUrl;

    imgEl.addEventListener(
      "error",
      () => {
        // si falla la imagen, no bloquea la app
        try { imgEl.removeAttribute("src"); } catch {}
        imgEl.alt = "Imagen no disponible";
      },
      { once: true }
    );

    let remaining = durationSeconds;
    secEl.textContent = String(remaining);

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");

    // 3) cerrar
    let timer = null;

    const cleanup = () => {
      if (timer) clearInterval(timer);
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
      sessionStorage.setItem(STARTUP_SEEN_KEY, "1");
    };

    closeBtn.onclick = cleanup;

    timer = setInterval(() => {
      remaining -= 1;
      secEl.textContent = String(Math.max(0, remaining));
      if (remaining <= 0) cleanup();
    }, 1000);

  } catch (e) {
    console.error("Startup modal error:", e);
  }
}
