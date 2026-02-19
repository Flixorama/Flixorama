// js/info.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";
import { consumeReturnTo } from "./nav_state.js";

/* =========================
   UI
========================= */
const backBtn = document.getElementById("back-btn");

const emailEl = document.getElementById("user-email");
const statusEl = document.getElementById("user-status");
const statusPill = document.getElementById("user-status-pill");

const appNameEl = document.getElementById("app-name");
const versionEl = document.getElementById("app-version");
const buildEl = document.getElementById("app-build");

const msgEl = document.getElementById("msg");
function setMsg(t) { if (msgEl) msgEl.textContent = t || ""; }

// Legal (modal)
const privacyBtn = document.getElementById("privacy-btn");
const termsBtn = document.getElementById("terms-btn");
const supportBtn = document.getElementById("support-btn");

const legalModal = document.getElementById("legal-modal");
const legalClose = document.getElementById("legal-close");
const legalTitleEl = document.getElementById("legal-title");
const legalBodyEl = document.getElementById("legal-body");

// PayPal
const paypalLink = document.getElementById("paypal-link");

// Socials
const tiktokLink = document.getElementById("tiktok-link");
const facebookLink = document.getElementById("facebook-link");
const instagramLink = document.getElementById("instagram-link");
const telegramLink = document.getElementById("telegram-link");
const xLink = document.getElementById("x-link");
const youtubeLink = document.getElementById("youtube-link");

// Local data
const clearLocalBtn = document.getElementById("clear-local-btn");
const localStatsEl = document.getElementById("local-stats");

// About
const aboutTextEl = document.getElementById("about-text");

/* =========================
   Firestore Config Location
========================= */
const CONFIG_DOC = doc(db, "app_config", "info");

/* =========================
   Helpers
========================= */
function safeText(v, fb = "") {
  if (v === undefined || v === null) return fb;
  const s = String(v).trim();
  return s ? s : fb;
}

function safeJsonParse(raw, fb) {
  try { return JSON.parse(raw); } catch { return fb; }
}

function computeLocalStats() {
  const cw = safeJsonParse(localStorage.getItem("continue_watching_v1") || "[]", []);
  const cwCount = Array.isArray(cw) ? cw.length : 0;

  const watched = safeJsonParse(localStorage.getItem("watched_episodes_v1") || "{}", {});
  const watchedCount = watched && typeof watched === "object" ? Object.keys(watched).length : 0;

  if (localStatsEl) localStatsEl.textContent = `${cwCount} en continuar viendo · ${watchedCount} episodios vistos`;
}

function setHrefOrDisable(el, href, labelForMsg) {
  if (!el) return;

  const url = safeText(href, "");
  if (!url || url === "#") {
    el.setAttribute("href", "#");
    el.addEventListener("click", (e) => {
      e.preventDefault();
      setMsg(`No configurado: ${labelForMsg}`);
    });
    return;
  }

  el.setAttribute("href", url);
}

/* =========================
   Modal Legal
========================= */
function openLegalModal(title, body) {
  if (!legalModal) return;
  if (legalTitleEl) legalTitleEl.textContent = safeText(title, "Información");
  if (legalBodyEl) legalBodyEl.textContent = safeText(body, "No hay contenido configurado.");
  legalModal.classList.add("show");
  legalModal.setAttribute("aria-hidden", "false");
}

function closeLegalModal() {
  if (!legalModal) return;
  legalModal.classList.remove("show");
  legalModal.setAttribute("aria-hidden", "true");
}

legalClose?.addEventListener("click", closeLegalModal);
legalModal?.addEventListener("click", (e) => {
  if (e.target === legalModal) closeLegalModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLegalModal();
});

/* =========================
   Back
========================= */
backBtn?.addEventListener("click", () => {
  const ret = consumeReturnTo?.();
  if (ret?.url) {
    window.location.href = ret.url;
    return;
  }
  window.location.href = "home.html";
});

/* =========================
   Clear Local Data
========================= */
clearLocalBtn?.addEventListener("click", () => {
  const ok = window.confirm(
    "¿Seguro que quieres borrar los datos locales?\n\nSe eliminará:\n• Continuar viendo\n• Episodios vistos"
  );
  if (!ok) return;

  try {
    localStorage.removeItem("continue_watching_v1");
    localStorage.removeItem("watched_episodes_v1");
    computeLocalStats();
    setMsg("Datos locales borrados ✅");
  } catch (e) {
    console.error(e);
    setMsg("No se pudo borrar los datos locales.");
  }
});

/* =========================
   Load Firestore Config
========================= */
let cachedConfig = null;

async function loadConfig() {
  setMsg("");

  try {
    const snap = await getDoc(CONFIG_DOC);
    if (!snap.exists()) {
      setMsg("No existe app_config/info.");
      return null;
    }
    const data = snap.data() || {};
    cachedConfig = data;
    return data;
  } catch (e) {
    console.error(e);
    setMsg("Error leyendo configuración desde Firestore.");
    return null;
  }
}

function applyConfigToUI(cfg) {
  if (!cfg) return;

  // App
  if (appNameEl) appNameEl.textContent = safeText(cfg.appName, "—");
  if (versionEl) versionEl.textContent = safeText(cfg.version, "—");
  if (buildEl) buildEl.textContent = safeText(cfg.build, "—");

  // PayPal
  setHrefOrDisable(paypalLink, cfg.paypalUrl, "PayPal");

  // Socials (con youtube)
  const s = cfg.socials || {};
  setHrefOrDisable(tiktokLink, s.tiktok, "TikTok");
  setHrefOrDisable(facebookLink, s.facebook, "Facebook");
  setHrefOrDisable(instagramLink, s.instagram, "Instagram");
  setHrefOrDisable(telegramLink, s.telegram, "Telegram");
  setHrefOrDisable(xLink, s.x, "X");
  setHrefOrDisable(youtubeLink, s.youtube, "YouTube");

  // About
  if (aboutTextEl) aboutTextEl.textContent = safeText(cfg.about, "—");
}

function bindLegalButtons(cfg) {
  const legal = cfg?.legal || {};

  privacyBtn?.addEventListener("click", () => {
    openLegalModal(legal.privacyTitle || "Privacidad", legal.privacyBody || "");
  });

  termsBtn?.addEventListener("click", () => {
    openLegalModal(legal.termsTitle || "Términos", legal.termsBody || "");
  });

  supportBtn?.addEventListener("click", () => {
    openLegalModal(legal.supportTitle || "Soporte", legal.supportBody || "");
  });
}

/* =========================
   Boot
========================= */
computeLocalStats();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  // Cuenta (Auth)
  const email = user.email || "Usuario";
  if (emailEl) emailEl.textContent = email;

  if (statusEl) statusEl.textContent = "Sesión activa ✅";
  if (statusPill) statusPill.textContent = "Activa";

  // Firestore config
  const cfg = await loadConfig();
  applyConfigToUI(cfg);
  bindLegalButtons(cfg);
});
