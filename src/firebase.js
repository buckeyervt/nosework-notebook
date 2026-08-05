import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
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
// Persistent local cache: lets the app keep reading AND writing while offline.
// Writes queue on-device and sync automatically once the connection returns.
// persistentMultipleTabManager keeps it working correctly if the app is open
// in more than one browser tab at once.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const auth = getAuth(app);
export const storage = getStorage(app);
