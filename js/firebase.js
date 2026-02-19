// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC12g-7-J65dCR2k61sXIFlLjo3j3v25oI",
  authDomain: "flixorama-f0e48.firebaseapp.com",
  projectId: "flixorama-f0e48",
  storageBucket: "flixorama-f0e48.firebasestorage.app",
  messagingSenderId: "939305341914",
  appId: "1:939305341914:web:5890d5ffccc42edb62a6e3"
};


const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
