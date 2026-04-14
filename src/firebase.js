import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey:            "AIzaSyAShW07hxJSIXZ7Vr1DapKi0LRwhvWLhx4",
  authDomain:        "nosework-notebook.firebaseapp.com",
  projectId:         "nosework-notebook",
  storageBucket:     "nosework-notebook.firebasestorage.app",
  messagingSenderId: "447040824496",
  appId:             "1:447040824496:web:df489337696833a3fa8775",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
