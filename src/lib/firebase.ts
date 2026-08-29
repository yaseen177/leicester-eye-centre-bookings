import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

// experimentalAutoDetectLongPolling: on shop/office networks where a proxy,
// firewall, or antivirus interferes with Firestore's default transport
// (WebChannel, which can use QUIC), the realtime listener can fail silently
// -- data looks like it's just not there, with no error the app code can
// catch. This makes the SDK detect that case and fall back to plain
// long-polling instead, which is far more compatible with restrictive
// networks at the cost of a little overhead. Safe, officially recommended
// default -- see github.com/firebase/firebase-js-sdk (Settings.experimentalAutoDetectLongPolling).
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
});
export const auth = getAuth(app);