import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

const configuracao = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseEstaConfigurado = Boolean(configuracao.apiKey && configuracao.projectId);

let aplicativo: FirebaseApp | null = null;
let autenticacao: Auth | null = null;
let bancoDeDados: Firestore | null = null;

if (firebaseEstaConfigurado) {
  aplicativo = getApps().length ? getApp() : initializeApp(configuracao);
  autenticacao = getAuth(aplicativo);
  bancoDeDados = getFirestore(aplicativo);

  if (import.meta.env.VITE_USAR_EMULADORES === "true") {
    connectAuthEmulator(autenticacao, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(bancoDeDados, "127.0.0.1", 8080);
  }
}

export function obterAutenticacao(): Auth {
  if (!autenticacao) throw new Error("Firebase Authentication não está configurado.");
  return autenticacao;
}

export function obterBancoDeDados(): Firestore {
  if (!bancoDeDados) throw new Error("Cloud Firestore não está configurado.");
  return bancoDeDados;
}
