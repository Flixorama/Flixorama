// js/profile.js
import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";

const emailEl = document.getElementById("profile-email");
const uidEl = document.getElementById("profile-uid");
const providerEl = document.getElementById("profile-provider");
const createdEl = document.getElementById("profile-created");
const lastEl = document.getElementById("profile-last");
const badgeEl = document.getElementById("profile-badge");
const msgEl = document.getElementById("profile-msg");

const backBtn = document.getElementById("back-btn");
const logoutBtn = document.getElementById("logout-profile");
const copyUidBtn = document.getElementById("copy-uid");
const verifyBtn = document.getElementById("verify-email");
const resetBtn = document.getElementById("reset-pass");

function fmtDate(iso) {
  if (!iso) return "---";
  const d = new Date(iso);
  return d.toLocaleString("es-EC", { dateStyle: "medium", timeStyle: "short" });
}

function setMsg(text) {
  msgEl.textContent = text;
}

let currentUser = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;

  emailEl.textContent = user.email || "Usuario";
  uidEl.textContent = user.uid;
  providerEl.textContent = user.providerData[0]?.providerId || "email";

  createdEl.textContent = fmtDate(user.metadata?.creationTime);
  lastEl.textContent = fmtDate(user.metadata?.lastSignInTime);

  if (user.emailVerified) {
    badgeEl.textContent = "Correo verificado ✅";
    verifyBtn.disabled = true;
    verifyBtn.style.opacity = "0.6";
  } else {
    badgeEl.textContent = "Correo no verificado";
    verifyBtn.disabled = false;
    verifyBtn.style.opacity = "1";
  }

  setMsg("");
});

backBtn.addEventListener("click", () => {
  window.location.href = "home.html";
});

copyUidBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(uidEl.textContent);
    setMsg("UID copiado ✅");
  } catch {
    setMsg("No se pudo copiar. (Permisos del navegador)");
  }
});

verifyBtn.addEventListener("click", async () => {
  if (!currentUser) return;
  verifyBtn.disabled = true;
  setMsg("Enviando correo de verificación…");
  try {
    await sendEmailVerification(currentUser);
    setMsg("Listo. Revisa tu correo para verificar ✅");
  } catch (e) {
    console.error(e);
    setMsg("No se pudo enviar la verificación.");
  } finally {
    verifyBtn.disabled = false;
  }
});

resetBtn.addEventListener("click", async () => {
  const email = currentUser?.email;
  if (!email) {
    setMsg("No hay correo asociado a esta cuenta.");
    return;
  }
  resetBtn.disabled = true;
  setMsg("Enviando enlace de restablecimiento…");
  try {
    await sendPasswordResetEmail(auth, email);
    setMsg("Enlace enviado. Revisa tu correo ✅");
  } catch (e) {
    console.error(e);
    setMsg("No se pudo enviar el enlace.");
  } finally {
    resetBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  setMsg("Cerrando sesión…");
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (e) {
    console.error(e);
    setMsg("No se pudo cerrar sesión.");
    logoutBtn.disabled = false;
  }
});
