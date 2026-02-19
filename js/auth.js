// js/auth.js
import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";

const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const btn = document.getElementById("auth-btn");
const toggle = document.getElementById("toggle-form");
const title = document.getElementById("form-title");
const subtitle = document.getElementById("form-subtitle");
const errorEl = document.getElementById("error");

let mode = "login"; // "login" | "register"

function setMode(nextMode) {
  mode = nextMode;
  errorEl.textContent = "";

  if (mode === "login") {
    title.textContent = "Iniciar sesión";
    subtitle.textContent = "Accede a tu catálogo.";
    btn.textContent = "Entrar";
    document.getElementById("toggle-text").innerHTML =
      '¿No tienes cuenta? <span id="toggle-form">Crear cuenta</span>';
  } else {
    title.textContent = "Crear cuenta";
    subtitle.textContent = "Crea tu cuenta en segundos.";
    btn.textContent = "Registrarme";
    document.getElementById("toggle-text").innerHTML =
      '¿Ya tienes cuenta? <span id="toggle-form">Iniciar sesión</span>';
  }

  // Re-enlazar el evento porque reescribimos el HTML del toggle-text
  document.getElementById("toggle-form").addEventListener("click", () => {
    setMode(mode === "login" ? "register" : "login");
  });
}

// Toggle inicial
toggle.addEventListener("click", () => {
  setMode("register");
});

btn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const password = passEl.value.trim();
  errorEl.textContent = "";

  if (!email || !password) {
    errorEl.textContent = "Completa correo y contraseña.";
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = "La contraseña debe tener al menos 6 caracteres.";
    return;
  }

  btn.disabled = true;
  btn.style.opacity = "0.85";

  try {
    if (mode === "register") {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    // Si todo va bien, onAuthStateChanged redirige
  } catch (err) {
    // Mensajes comunes
    const code = err?.code || "";
    if (code.includes("auth/email-already-in-use")) {
      errorEl.textContent = "Ese correo ya está registrado.";
    } else if (code.includes("auth/invalid-email")) {
      errorEl.textContent = "Correo inválido.";
    } else if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) {
      errorEl.textContent = "Credenciales incorrectas.";
    } else if (code.includes("auth/user-not-found")) {
      errorEl.textContent = "No existe un usuario con ese correo.";
    } else if (code.includes("auth/too-many-requests")) {
      errorEl.textContent = "Demasiados intentos. Intenta más tarde.";
    } else {
      errorEl.textContent = "Error: " + (err?.message || "desconocido");
    }
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.style.opacity = "1";
  }
});

// Si ya está logueado, manda a home
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "home.html";
  }
});
