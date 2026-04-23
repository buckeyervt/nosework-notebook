// PART 1 of 3 — top of file through ADMIN PANEL

import { useState, useEffect } from "react";
import { db, storage } from "./firebase";
import { MASTER_TRIALS } from "./trials";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot,
  writeBatch, getDoc
} from "firebase/firestore";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail, updateProfile,
  updatePassword, deleteUser, EmailAuthProvider, reauthenticateWithCredential
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// ── Constants ────────────────────────────────────────────────
const ORGS = ["NACSW", "UKC", "AKC", "USCSS/Other"];
const ORG_COLORS = {
  NACSW: "#e07b39",
  UKC: "#3a7bd5",
  AKC: "#c0392b",
  "USCSS/Other": "#27ae60",
};
const ORG_BG = {
  NACSW: "#fff5ee",
  UKC: "#eef4ff",
  AKC: "#fff0f0",
  "USCSS/Other": "#f0fff5",
};
const ADMIN_PIN = "1234"; // ← Change this before sharing!

const ORG_IDS = [
  { org: "NACSW",       key: "nacsw", label: "NACSW #",                  placeholder: "e.g. K040827" },
  { org: "AKC",         key: "akc",   label: "AKC # (Canine Partners)",  placeholder: "e.g. MB25813301" },
  { org: "UKC",         key: "ukc",   label: "UKC Performance Listing #", placeholder: "e.g. PL025899" },
  { org: "USCSS/Other", key: "uscss", label: "USCSS Member #",           placeholder: "e.g. your USCSS ID" },
];

const auth = getAuth();
const TABS = ["Dashboard", "Trials", "Training", "Results", "Titles", "My Dogs", "Account"];
const blankDog = () => ({
  id: Date.now().toString(),
  callName: "",
  name: "",
  breed: "",
  dob: "",
  nacsw: "",
  akc: "",
  ukc: "",
  uscss: "",
});

export default function App() {
  // ── Auth state ───────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login"); // login | signup | reset
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authLogging, setAuthLogging] = useState(false);

  // ── Core state ───────────────────────────────────────────────
  const [tab, setTab] = useState("Dashboard");
  const [dogs, setDogs] = useState([]);
  const [activeDogId, setActiveDogId] = useState(null);
  const [photos, setPhotos] = useState({});
  const [registrations, setRegistrations] = useState({});
  const [allResults, setAllResults] = useState({});

  // NEW: Training entries per dog
  // trainingByDog[dogId] = [ { id, date, type, location, skills, notes, rating, videoLink } ]
  const [trainingByDog, setTrainingByDog] = useState({});

  const [dataLoaded, setDataLoaded] = useState(false);

  // ── Firebase trial calendar ──────────────────────────────────
  const [trials, setTrials] = useState([]);
  const [trialsLoading, setTrialsLoading] = useState(true);

  // ── Admin ────────────────────────────────────────────────────
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminTab, setAdminTab] = useState("list");
  const [trialForm, setTrialForm] = useState({
    org: "NACSW",
    name: "",
    date: "",
    location: "",
    level: "",
    entryOpens: "",
    entryDeadline: "",
    entryLink: "",
    notes: "",
    adminNotes: "",
    needsInfo: false,
  });
  const [adminFilter, setAdminFilter] = useState("all"); // all | needsinfo
  const [quickEditId, setQuickEditId] = useState(null);
  const [quickEditLink, setQuickEditLink] = useState("");
  const [quickEditMode, setQuickEditMode] = useState("link"); // "link" | "location"
  const [quickEditLocation, setQuickEditLocation] = useState("");
  const [editingTrialId, setEditingTrialId] = useState(null);

  // ── UI ───────────────────────────────────────────────────────
  const [filterOrg, setFilterOrg] = useState("All");
  const [showResultForm, setShowResultForm] = useState(false);
  const [resultForm, setResultForm] = useState({
    org: "NACSW",
    trial: "",
    date: "",
    level: "",
    result: "Pass",
    title: "",
    notes: "",
    videoLink: "",
  });
  const [showTitleForm, setShowTitleForm] = useState(false);
  const [titleForm, setTitleForm] = useState({ org: "NACSW", title: "", trial: "", date: "" });
  const [trialView, setTrialView] = useState("upcoming"); // "upcoming" | "past"
  const [resultPhotoFile, setResultPhotoFile] = useState(null);
  const [editingDogId, setEditingDogId] = useState(null);
  const [dogForm, setDogForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [onboardStep, setOnboardStep] = useState(0);
  const [onboardDog, setOnboardDog] = useState(blankDog());

  // ── Account settings state ───────────────────────────────────
  const [accountForm, setAccountForm] = useState({
    name: "",
    email: "",
    newPassword: "",
    currentPassword: "",
  });
  const [accountMsg, setAccountMsg] = useState("");
  const [accountError, setAccountError] = useState("");
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  const activeDog = dogs.find((d) => d.id === activeDogId) || dogs[0];
  const today = new Date();

  // ── Auth listener ────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (!u) setDataLoaded(false);
    });
    return () => unsub();
  }, []);

  // ── Firebase trial calendar ──────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "trials"),
      (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        setTrials(data);
        setTrialsLoading(false);
      },
      () => {
        setTrials(MASTER_TRIALS);
        setTrialsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // ── Load user data from Firebase (real-time) ─────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setDogs(data.dogs || []);
          setActiveDogId((id) => id || data.activeDogId || null);
          setRegistrations(data.registrations || {});
          setAllResults(data.results || {});
          setPhotos(data.photos || {});
          setTrainingByDog(data.trainingByDog || {});
        }
        setDataLoaded(true);
      },
      () => setDataLoaded(true)
    );
    return () => unsub();
  }, [user]);

  // ── Save user data to Firebase ───────────────────────────────
  async function saveUserData(updates) {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), updates, { merge: true });
    } catch (e) {
      console.error("Save error:", e);
    }
  }

  // ── Auth functions ───────────────────────────────────────────
  async function handleSignup(e) {
    e.preventDefault();
    setAuthError("");
    setAuthLogging(true);
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        authForm.email,
        authForm.password
      );
      await updateProfile(cred.user, { displayName: authForm.name });
      setUser(cred.user);
    } catch (err) {
      setAuthError(friendlyError(err.code));
    }
    setAuthLogging(false);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");
    setAuthLogging(true);
    try {
      await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
    } catch (err) {
      setAuthError(friendlyError(err.code));
    }
    setAuthLogging(false);
  }

  async function handleReset(e) {
    e.preventDefault();
    setAuthError("");
    setAuthLogging(true);
    try {
      await sendPasswordResetEmail(auth, authForm.email);
      setAuthError("✅ Password reset email sent! Check your inbox.");
    } catch (err) {
      setAuthError(friendlyError(err.code));
    }
    setAuthLogging(false);
  }

  function friendlyError(code) {
    const map = {
      "auth/email-already-in-use": "That email is already registered. Try logging in!",
      "auth/wrong-password": "Wrong password. Try again or reset it.",
      "auth/user-not-found": "No account found with that email.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/invalid-credential": "Wrong email or password. Try again.",
      "auth/too-many-requests": "Too many attempts. Please wait a moment.",
    };
    return map[code] || "Something went wrong. Please try again.";
  }

  async function handleLogout() {
    await signOut(auth);
    setDogs([]);
    setActiveDogId(null);
    setRegistrations({});
    setAllResults({});
    setPhotos({});
    setTrainingByDog({});
    setDataLoaded(false);
  }

  // ── Account management ───────────────────────────────────────
  async function updateAccountName(e) {
    e.preventDefault();
    setAccountMsg("");
    setAccountError("");
    try {
      await updateProfile(auth.currentUser, { displayName: accountForm.name });
      setAccountMsg("✅ Name updated successfully!");
      setAccountForm((f) => ({ ...f, name: "" }));
    } catch (err) {
      setAccountError("Could not update name. Please try again.");
    }
  }

  async function updateAccountPassword(e) {
    e.preventDefault();
    setAccountMsg("");
    setAccountError("");
    try {
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        accountForm.currentPassword
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, accountForm.newPassword);
      setAccountMsg("✅ Password updated successfully!");
      setAccountForm((f) => ({ ...f, newPassword: "", currentPassword: "" }));
    } catch (err) {
      if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      )
        setAccountError("Wrong current password.");
      else setAccountError("Could not update password. Please try again.");
    }
  }

  async function handleDeleteAccount(e) {
    e.preventDefault();
    setAccountError("");
    try {
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        deletePassword
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      await deleteDoc(doc(db, "users", auth.currentUser.uid));
      await deleteUser(auth.currentUser);
      setDogs([]);
      setActiveDogId(null);
      setRegistrations({});
      setAllResults({});
      setPhotos({});
      setTrainingByDog({});
      setDataLoaded(false);
    } catch (err) {
      if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      )
        setAccountError("Wrong password. Account not deleted.");
      else setAccountError("Could not delete account. Please try again.");
    }
  }

  // ── Onboarding (first dog setup) ─────────────────────────────
  async function finishOnboarding() {
    const dog = { ...onboardDog, id: Date.now().toString() };
    const newDogs = [dog];
    setDogs(newDogs);
    setActiveDogId(dog.id);
    await saveUserData({
      dogs: newDogs,
      activeDogId: dog.id,
      registrations: {},
      results: {},
      photos: {},
      trainingByDog: {},
    });
  }

  // ── Dog management ───────────────────────────────────────────
  async function saveDog(e) {
    e.preventDefault();
    const newDogs = dogs.map((d) =>
      d.id === editingDogId ? { ...dogForm } : d
    );
    setDogs(newDogs);
    setEditingDogId(null);
    await saveUserData({ dogs: newDogs });
  }

  async function addDog() {
    const dog = blankDog();
    const newDogs = [...dogs, dog];
    setDogs(newDogs);
    setActiveDogId(dog.id);
    setEditingDogId(dog.id);
    setDogForm(dog);
    await saveUserData({ dogs: newDogs, activeDogId: dog.id });
  }

  async function deleteDog(id) {
    const rem = dogs.filter((d) => d.id !== id);
    setDogs(rem);
    const newActiveId = rem[0]?.id || null;
    setActiveDogId(newActiveId);
    setDeleteConfirm(null);
    await saveUserData({ dogs: rem, activeDogId: newActiveId });
  }

  // ── Registrations — status + paid ────────────────────────────
  const dogRegs = activeDog ? registrations[activeDog.id] || {} : {};
  const getStatus = (trialId) => dogRegs[trialId]?.status || "none";
  const getPaid = (trialId) => dogRegs[trialId]?.paid || false;

  async function setTrialStatus(trialId, status) {
    if (!activeDog) return;
    const current = dogRegs[trialId] || { status: "none", paid: false };
    const updated = { ...current, status };
    const newRegs = {
      ...registrations,
      [activeDog.id]: {
        ...(registrations[activeDog.id] || {}),
        [trialId]: updated,
      },
    };
    setRegistrations(newRegs);
    await saveUserData({ registrations: newRegs });
  }

  async function togglePaid(trialId) {
    if (!activeDog) return;
    const current = dogRegs[trialId] || { status: "none", paid: false };
    const updated = { ...current, paid: !current.paid };
    const newRegs = {
      ...registrations,
      [activeDog.id]: {
        ...(registrations[activeDog.id] || {}),
        [trialId]: updated,
      },
    };
    setRegistrations(newRegs);
    await saveUserData({ registrations: newRegs });
  }

  // ── Results ──────────────────────────────────────────────────
  const myResults = activeDog ? allResults[activeDog.id] || [] : [];

  async function addResult(e) {
    e.preventDefault();
    if (!activeDog) return;
    let photoUrl = "";
    if (resultPhotoFile) {
      try {
        const storageRef = ref(
          storage,
          `ribbons/${user.uid}/${Date.now()}`
        );
        await uploadBytes(storageRef, resultPhotoFile);
        photoUrl = await getDownloadURL(storageRef);
      } catch (err) {
        console.error("Ribbon photo error:", err);
      }
    }
    const newResult = {
      ...resultForm,
      id: Date.now().toString(),
      photoUrl,
    };
    const newResults = {
      ...allResults,
      [activeDog.id]: [...(allResults[activeDog.id] || []), newResult],
    };
    setAllResults(newResults);
    setShowResultForm(false);
    setResultPhotoFile(null);
    setResultForm({
      org: "NACSW",
      trial: "",
      date: "",
      level: "",
      result: "Pass",
      title: "",
      notes: "",
      videoLink: "",
    });
    await saveUserData({ results: newResults });
  }

  async function addManualTitle(e) {
    e.preventDefault();
    if (!activeDog) return;
    const newResult = {
      id: Date.now().toString(),
      org: titleForm.org,
      trial: titleForm.trial || "Pre-app title",
      date: titleForm.date || "",
      level: "",
      result: "Pass",
      title: titleForm.title,
      notes: "Title entered manually",
      photoUrl: "",
      videoLink: "",
    };
    const newResults = {
      ...allResults,
      [activeDog.id]: [...(allResults[activeDog.id] || []), newResult],
    };
    setAllResults(newResults);
    setShowTitleForm(false);
    setTitleForm({ org: "NACSW", title: "", trial: "", date: "" });
    await saveUserData({ results: newResults });
  }

  // ── Training log ─────────────────────────────────────────────
  const myTraining = activeDog ? trainingByDog[activeDog.id] || [] : [];

  async function addTrainingEntry(e, trainingForm) {
    e.preventDefault();
    if (!activeDog) return;
    const entry = {
      id: Date.now().toString(),
      date: trainingForm.date || new Date().toISOString().slice(0, 10),
      type: trainingForm.type,
      location: trainingForm.location,
      skills: trainingForm.skills,
      notes: trainingForm.notes,
      rating: trainingForm.rating,
      videoLink: trainingForm.videoLink,
    };
    const dogEntries = trainingByDog[activeDog.id] || [];
    const updatedDogEntries = [...dogEntries, entry].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
    const newTraining = {
      ...trainingByDog,
      [activeDog.id]: updatedDogEntries,
    };
    setTrainingByDog(newTraining);
    await saveUserData({ trainingByDog: newTraining });
  }

  async function deleteTrainingEntry(entryId) {
    if (!activeDog) return;
    const dogEntries = trainingByDog[activeDog.id] || [];
    const updatedDogEntries = dogEntries.filter((t) => t.id !== entryId);
    const newTraining = {
      ...trainingByDog,
      [activeDog.id]: updatedDogEntries,
    };
    setTrainingByDog(newTraining);
    await saveUserData({ trainingByDog: newTraining });
  }

  // ── Photo upload to Firebase Storage ────────────────────────
  async function handlePhoto(dogId, file) {
    if (!file || !user) return;
    try {
      const storageRef = ref(storage, `photos/${user.uid}/${dogId}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const newPhotos = { ...photos, [dogId]: url };
      setPhotos(newPhotos);
      await saveUserData({ photos: newPhotos });
    } catch (e) {
      console.error("Photo upload error:", e);
      alert("Photo upload failed. Please try again.");
    }
  }

  // ── Admin ────────────────────────────────────────────────────
  async function seedTrials() {
    const batch = writeBatch(db);
    MASTER_TRIALS.forEach((t) => batch.set(doc(db, "trials", t.id), t));
    await batch.commit();
    alert(`✅ ${MASTER_TRIALS.length} trials uploaded!`);
  }

  async function saveAdminTrial(e) {
    e.preventDefault();
    const id = editingTrialId || `t_${Date.now()}`;
    await setDoc(doc(db, "trials", id), { ...trialForm, id });
    setTrialForm({
      org: "NACSW",
      name: "",
      date: "",
      location: "",
      level: "",
      entryOpens: "",
      entryDeadline: "",
      entryLink: "",
      notes: "",
      adminNotes: "",
      needsInfo: false,
    });
    setEditingTrialId(null);
    setAdminTab("list");
    alert("✅ Saved! Everyone's app will update automatically.");
  }

  async function deleteTrial(id) {
    if (window.confirm("Delete this trial for everyone?")) {
      await deleteDoc(doc(db, "trials", id));
    }
  }

  // ── Derived ──────────────────────────────────────────────────
  const upcoming = trials.filter((t) => new Date(t.date) >= today);
  const deadlineSoon = trials.filter((t) => {
    const d = (new Date(t.entryDeadline) - today) / 86400000;
    return d >= 0 && d <= 14 && getStatus(t.id) === "none";
  });
  const opensSoon = trials.filter((t) => {
    const d = (new Date(t.entryOpens) - today) / 86400000;
    return d >= 0 && d <= 7 && getStatus(t.id) === "none";
  });
  const titlesEarned = myResults
    .filter((r) => r.title)
    .map((r) => ({ org: r.org, title: r.title, date: r.date, trial: r.trial }));
  const trialsByView =
    trialView === "past"
      ? trials.filter((t) => new Date(t.date) < today)
      : trials.filter((t) => new Date(t.date) >= today);
  const filtered =
    filterOrg === "All"
      ? trialsByView
      : filterOrg === "Entered"
      ? trialsByView.filter(
          (t) =>
            getStatus(t.id) === "entered" || getStatus(t.id) === "waitlist"
        )
      : trialsByView.filter((t) => t.org === filterOrg);

  const daysUntil = (d) => {
    const n = Math.ceil((new Date(d) - today) / 86400000);
    if (Number.isNaN(n)) return "";
    return n < 0
      ? "Passed"
      : n === 0
      ? "Today!"
      : n === 1
      ? "Tomorrow"
      : `${n} days`;
  };

  const openMaps = (location) => {
    const encoded = encodeURIComponent(location);
    window.open(`https://maps.google.com/?q=${encoded}`, "_blank");
  };

  // ════════════════════════════════════════════════════════════
  // AUTH LOADING
  // ════════════════════════════════════════════════════════════
  if (authLoading)
    return (
      <div
        style={{
          fontFamily: "Georgia,serif",
          background: "linear-gradient(135deg,#6b21a8,#7c3aed,#06b6d4)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: "#fff", fontSize: 16 }}>🐾 Loading...</div>
      </div>
    );

  // ════════════════════════════════════════════════════════════
  // AUTH SCREENS
  // ════════════════════════════════════════════════════════════
  if (!user)
    return (
      <div
        style={{
          fontFamily: "Georgia,serif",
          background: "linear-gradient(135deg,#6b21a8,#7c3aed,#06b6d4)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 20,
            padding: 28,
            maxWidth: 400,
            width: "100%",
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 48 }}>🐾</div>
            <div
              style={{
                fontSize: 22,
                fontWeight: "bold",
                color: "#5b21b6",
              }}
            >
              NoseWork Notebook
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#888",
                marginTop: 4,
              }}
            >
              Puppy Love · College Station, TX
            </div>
          </div>

          {authMode === "login" && (
            <form onSubmit={handleLogin}>
              <div style={formTitle}>
                {authLogging ? "Signing in..." : "Welcome back!"}
              </div>
              <label style={labelStyle}>Email</label>
              <input
                required
                type="email"
                style={inputStyle}
                placeholder="your@email.com"
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm({ ...authForm, email: e.target.value })
                }
              />
              <label style={labelStyle}>Password</label>
              <input
                required
                type="password"
                style={inputStyle}
                placeholder="••••••••"
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm({ ...authForm, password: e.target.value })
                }
              />
              {authError && (
                <div
                  style={{
                    fontSize: 12,
                    color: authError.startsWith("✅")
                      ? "#27ae60"
                      : "#c0392b",
                    marginTop: 8,
                    padding: "8px 10px",
                    background: authError.startsWith("✅")
                      ? "#e8f8ee"
                      : "#ffeaea",
                    borderRadius: 8,
                  }}
                >
                  {authError}
                </div>
              )}
              <button
                type="submit"
                disabled={authLogging}
                style={{
                  ...btnStyle("#7c3aed"),
                  width: "100%",
                  padding: 12,
                  marginTop: 14,
                  background:
                    "linear-gradient(135deg,#7c3aed,#06b6d4)",
                }}
              >
                Sign In
              </button>
              <div
                style={{
                  textAlign: "center",
                  marginTop: 14,
                  fontSize: 13,
                  color: "#888",
                }}
              >
                <span
                  style={{ cursor: "pointer", color: "#7c3aed" }}
                  onClick={() => {
                    setAuthMode("reset");
                    setAuthError("");
                  }}
                >
                  Forgot password?
                </span>
                <span style={{ margin: "0 8px" }}>·</span>
                <span
                  style={{ cursor: "pointer", color: "#7c3aed" }}
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthError("");
                  }}
                >
                  Create account
                </span>
              </div>
            </form>
          )}

          {authMode === "signup" && (
            <form onSubmit={handleSignup}>
              <div style={formTitle}>
                Join the Puppy Love community!
              </div>
              <label style={labelStyle}>Your Name</label>
              <input
                required
                style={inputStyle}
                placeholder="First name"
                value={authForm.name}
                onChange={(e) =>
                  setAuthForm({ ...authForm, name: e.target.value })
                }
              />
              <label style={labelStyle}>Email</label>
              <input
                required
                type="email"
                style={inputStyle}
                placeholder="your@email.com"
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm({ ...authForm, email: e.target.value })
                }
              />
              <label style={labelStyle}>Password</label>
              <input
                required
                type="password"
                style={inputStyle}
                placeholder="At least 6 characters"
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm({
                    ...authForm,
                    password: e.target.value,
                  })
                }
              />
              {authError && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#c0392b",
                    marginTop: 8,
                    padding: "8px 10px",
                    background: "#ffeaea",
                    borderRadius: 8,
                  }}
                >
                  {authError}
                </div>
              )}
              <button
                type="submit"
                disabled={authLogging}
                style={{
                  ...btnStyle("#7c3aed"),
                  width: "100%",
                  padding: 12,
                  marginTop: 14,
                  background:
                    "linear-gradient(135deg,#7c3aed,#06b6d4)",
                }}
              >
                {authLogging ? "Creating account..." : "Create Account"}
              </button>
              <div
                style={{
                  textAlign: "center",
                  marginTop: 14,
                  fontSize: 13,
                  color: "#888",
                }}
              >
                Already have an account?{" "}
                <span
                  style={{ cursor: "pointer", color: "#7c3aed" }}
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                  }}
                >
                  Sign in
                </span>
              </div>
            </form>
          )}

          {authMode === "reset" && (
            <form onSubmit={handleReset}>
              <div style={formTitle}>Reset your password</div>
              <div
                style={{
                  fontSize: 13,
                  color: "#888",
                  marginBottom: 12,
                }}
              >
                Enter your email and we'll send you a reset link.
              </div>
              <label style={labelStyle}>Email</label>
              <input
                required
                type="email"
                style={inputStyle}
                placeholder="your@email.com"
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm({
                    ...authForm,
                    email: e.target.value,
                  })
                }
              />
              {authError && (
                <div
                  style={{
                    fontSize: 12,
                    color: authError.startsWith("✅")
                      ? "#27ae60"
                      : "#c0392b",
                    marginTop: 8,
                    padding: "8px 10px",
                    background: authError.startsWith("✅")
                      ? "#e8f8ee"
                      : "#ffeaea",
                    borderRadius: 8,
                  }}
                >
                  {authError}
                </div>
              )}
              <button
                type="submit"
                disabled={authLogging}
                style={{
                  ...btnStyle("#7c3aed"),
                  width: "100%",
                  padding: 12,
                  marginTop: 14,
                  background:
                    "linear-gradient(135deg,#7c3aed,#06b6d4)",
                }}
              >
                {authLogging ? "Sending..." : "Send Reset Email"}
              </button>
              <div
                style={{
                  textAlign: "center",
                  marginTop: 14,
                  fontSize: 13,
                }}
              >
                <span
                  style={{ cursor: "pointer", color: "#7c3aed" }}
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                  }}
                >
                  ← Back to sign in
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    );

  // ════════════════════════════════════════════════════════════
  // ONBOARDING — first dog setup
  // ════════════════════════════════════════════════════════════
  if (user && dataLoaded && dogs.length === 0)
    return (
      <div
        style={{
          fontFamily: "Georgia,serif",
          background: "linear-gradient(135deg,#6b21a8,#7c3aed,#06b6d4)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 20,
            padding: 28,
            maxWidth: 420,
            width: "100%",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 48 }}>🐾</div>
            <div
              style={{
                fontSize: 20,
                fontWeight: "bold",
                color: "#5b21b6",
              }}
            >
              Welcome
              {user.displayName
                ? `, ${user.displayName.split(" ")[0]}`
                : ""}
              !
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#888",
                marginTop: 4,
              }}
            >
              Let's set up your first dog
            </div>
          </div>

          {onboardStep === 0 && (
            <div>
              <label style={labelStyle}>Call Name *</label>
              <input
                style={inputStyle}
                placeholder="e.g. Catie"
                value={onboardDog.callName}
                onChange={(e) =>
                  setOnboardDog({
                    ...onboardDog,
                    callName: e.target.value,
                  })
                }
              />
              <label style={labelStyle}>Registered Name</label>
              <input
                style={inputStyle}
                placeholder="Full registered name"
                value={onboardDog.name}
                onChange={(e) =>
                  setOnboardDog({
                    ...onboardDog,
                    name: e.target.value,
                  })
                }
              />
              <label style={labelStyle}>Breed</label>
              <input
                style={inputStyle}
                placeholder="e.g. Border Collie Mix"
                value={onboardDog.breed}
                onChange={(e) =>
                  setOnboardDog({
                    ...onboardDog,
                    breed: e.target.value,
                  })
                }
              />
              <label style={labelStyle}>Date of Birth</label>
              <input
                type="date"
                style={inputStyle}
                value={onboardDog.dob}
                onChange={(e) =>
                  setOnboardDog({
                    ...onboardDog,
                    dob: e.target.value,
                  })
                }
              />
              <button
                onClick={() => setOnboardStep(1)}
                disabled={!onboardDog.callName}
                style={{
                  ...btnStyle("#7c3aed"),
                  width: "100%",
                  padding: 12,
                  marginTop: 16,
                  background:
                    "linear-gradient(135deg,#7c3aed,#06b6d4)",
                }}
              >
                Next → Org IDs
              </button>
            </div>
          )}

          {onboardStep === 1 && (
            <div>
              <div
                style={{
                  fontWeight: "bold",
                  fontSize: 14,
                  color: "#5b21b6",
                  marginBottom: 4,
                }}
              >
                Organization IDs
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#888",
                  marginBottom: 12,
                }}
              >
                Add whichever ones apply — all optional
              </div>
              {ORG_IDS.map(({ org, key, label, placeholder }) => (
                <div key={key}>
                  <label
                    style={{
                      ...labelStyle,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <OrgBadge org={org} size={10} /> {label}
                  </label>
                  <input
                    style={inputStyle}
                    placeholder={placeholder}
                    value={onboardDog[key]}
                    onChange={(e) =>
                      setOnboardDog({
                        ...onboardDog,
                        [key]: e.target.value,
                      })
                    }
                  />
                </div>
              ))}
              <button
                onClick={finishOnboarding}
                style={{
                  ...btnStyle("#7c3aed"),
                  width: "100%",
                  padding: 12,
                  marginTop: 18,
                  background:
                    "linear-gradient(135deg,#7c3aed,#06b6d4)",
                }}
              >
                Let's Go! 🐾
              </button>
              <button
                onClick={() => setOnboardStep(0)}
                style={{
                  ...btnStyle("#aaa", true),
                  width: "100%",
                  marginTop: 8,
                  padding: 8,
                  fontSize: 13,
                }}
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    );

  // ════════════════════════════════════════════════════════════
  // ADMIN PANEL
  // ════════════════════════════════════════════════════════════
  if (showAdmin)
    return (
      <div
        style={{
          fontFamily: "Georgia,serif",
          background: "#f5f3ff",
          minHeight: "100vh",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg,#6b21a8,#7c3aed,#06b6d4)",
            padding: "14px 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ color: "#fff", fontWeight: "bold" }}>🔐 Admin Panel</div>
          <button
            onClick={() => {
              setShowAdmin(false);
              setAdminUnlocked(false);
              setAdminPin("");
            }}
            style={{
              ...btnStyle("#fff", true),
              color: "#fff",
              borderColor: "rgba(255,255,255,0.5)",
              padding: "5px 12px",
              fontSize: 12,
            }}
          >
            ← Back
          </button>
        </div>
        <div style={{ padding: 18, maxWidth: 700, margin: "0 auto" }}>
          {!adminUnlocked ? (
            <div style={formStyle}>
              <div style={formTitle}>🔒 Admin PIN</div>
              <input
                type="password"
                style={inputStyle}
                placeholder="PIN"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  (adminPin === ADMIN_PIN
                    ? setAdminUnlocked(true)
                    : alert("Wrong PIN"))
                }
              />
              <button
                onClick={() =>
                  adminPin === ADMIN_PIN
                    ? setAdminUnlocked(true)
                    : alert("Wrong PIN")
                }
                style={{ ...btnStyle("#7c3aed"), marginTop: 10 }}
              >
                Unlock
              </button>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 16,
                  flexWrap: "wrap",
                }}
              >
                {[
                  ["list", "📋 All Trials"],
                  ["add", "➕ Add Trial"],
                  ["seed", "🚀 Seed DB"],
                ].map(([t, l]) => (
                  <button
                    key={t}
                    onClick={() => {
                      setAdminTab(t);
                      if (t !== "add") {
                        setEditingTrialId(null);
                        setTrialForm({
                          org: "NACSW",
                          name: "",
                          date: "",
                          location: "",
                          level: "",
                          entryOpens: "",
                          entryDeadline: "",
                          entryLink: "",
                          notes: "",
                          adminNotes: "",
                          needsInfo: false,
                        });
                      }
                    }}
                    style={{
                      ...btnStyle(adminTab === t ? "#7c3aed" : "#aaa"),
                      padding: "6px 14px",
                      fontSize: 13,
                      ...(adminTab === t
                        ? {
                            background:
                              "linear-gradient(135deg,#7c3aed,#06b6d4)",
                          }
                        : {}),
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
// PART 2 of 3 — admin list + main app UI and tabs (incl. Training tab)

              {(adminTab === "add" || editingTrialId) && (
                <form onSubmit={saveAdminTrial} style={formStyle}>
                  <div style={formTitle}>
                    {editingTrialId ? "✏️ Edit Trial" : "➕ New Trial"}
                  </div>

                  {/* Needs Info flag */}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: "pointer",
                      background: trialForm.needsInfo ? "#fff8e1" : "#f5f3ff",
                      borderRadius: 8,
                      padding: "8px 12px",
                      marginBottom: 8,
                      border: `1px solid ${
                        trialForm.needsInfo ? "#f59e0b" : "#e9d5ff"
                      }`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={trialForm.needsInfo || false}
                      onChange={(e) =>
                        setTrialForm({
                          ...trialForm,
                          needsInfo: e.target.checked,
                        })
                      }
                      style={{ width: 16, height: 16 }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        color: trialForm.needsInfo ? "#b45309" : "#5b21b6",
                        fontWeight: "bold",
                      }}
                    >
                      ⚠️ Needs more info — flag for follow-up
                    </span>
                  </label>

                  <label style={labelStyle}>Organization</label>
                  <select
                    style={inputStyle}
                    value={trialForm.org}
                    onChange={(e) =>
                      setTrialForm({ ...trialForm, org: e.target.value })
                    }
                  >
                    {ORGS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>

                  <label style={labelStyle}>Trial Name *</label>
                  <input
                    required
                    style={inputStyle}
                    value={trialForm.name}
                    onChange={(e) =>
                      setTrialForm({ ...trialForm, name: e.target.value })
                    }
                    placeholder="Full name & host club"
                  />

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div>
                      <label style={labelStyle}>Trial Date *</label>
                      <input
                        required
                        type="date"
                        style={inputStyle}
                        value={trialForm.date}
                        onChange={(e) =>
                          setTrialForm({
                            ...trialForm,
                            date: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Entry Deadline</label>
                      <input
                        type="date"
                        style={inputStyle}
                        value={trialForm.entryDeadline}
                        onChange={(e) =>
                          setTrialForm({
                            ...trialForm,
                            entryDeadline: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div>
                      <label style={labelStyle}>Entry Opens</label>
                      <input
                        type="date"
                        style={inputStyle}
                        value={trialForm.entryOpens || ""}
                        onChange={(e) =>
                          setTrialForm({
                            ...trialForm,
                            entryOpens: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Level / Classes</label>
                      <input
                        style={inputStyle}
                        value={trialForm.level}
                        onChange={(e) =>
                          setTrialForm({
                            ...trialForm,
                            level: e.target.value,
                          })
                        }
                        placeholder="e.g. NW1/NW2, Novice A"
                      />
                    </div>
                  </div>

                  <label style={labelStyle}>Location</label>
                  <input
                    style={inputStyle}
                    value={trialForm.location}
                    onChange={(e) =>
                      setTrialForm({
                        ...trialForm,
                        location: e.target.value,
                      })
                    }
                    placeholder="Venue, City, TX"
                  />

                  <label style={labelStyle}>Entry Link (URL)</label>
                  <input
                    style={inputStyle}
                    value={trialForm.entryLink || ""}
                    onChange={(e) =>
                      setTrialForm({
                        ...trialForm,
                        entryLink: e.target.value,
                      })
                    }
                    placeholder="https://secreterrier.com/events/..."
                  />

                  <label style={labelStyle}>
                    Public Notes{" "}
                    <span
                      style={{ color: "#aaa", fontWeight: "normal" }}
                    >
                      (everyone sees this)
                    </span>
                  </label>
                  <textarea
                    style={{ ...inputStyle, height: 56 }}
                    value={trialForm.notes}
                    onChange={(e) =>
                      setTrialForm({
                        ...trialForm,
                        notes: e.target.value,
                      })
                    }
                    placeholder="Contact email, special info, full/waitlist status…"
                  />

                  <label style={labelStyle}>
                    🔒 Admin Notes{" "}
                    <span
                      style={{ color: "#aaa", fontWeight: "normal" }}
                    >
                      (only you see this)
                    </span>
                  </label>
                  <textarea
                    style={{
                      ...inputStyle,
                      height: 56,
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                    }}
                    value={trialForm.adminNotes || ""}
                    onChange={(e) =>
                      setTrialForm({
                        ...trialForm,
                        adminNotes: e.target.value,
                      })
                    }
                    placeholder="e.g. 'Check NACSW site in August for premium' or 'Email Deb for entry link'"
                  />

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      type="submit"
                      style={{
                        ...btnStyle("#7c3aed"),
                        background:
                          "linear-gradient(135deg,#7c3aed,#06b6d4)",
                      }}
                    >
                      💾 Save for Everyone
                    </button>
                    {editingTrialId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTrialId(null);
                          setAdminTab("list");
                        }}
                        style={btnStyle("#aaa")}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              )}

              {adminTab === "seed" && !editingTrialId && (
                <div style={formStyle}>
                  <div style={formTitle}>🚀 Seed Database</div>
                  <p style={{ fontSize: 13, color: "#666" }}>
                    Run once when first setting up. Uploads all{" "}
                    {MASTER_TRIALS.length} trials.
                  </p>
                  <button
                    onClick={seedTrials}
                    style={{ ...btnStyle("#c0392b"), marginTop: 8 }}
                  >
                    Upload {MASTER_TRIALS.length} Trials to Firebase
                  </button>
                </div>
              )}

              {adminTab === "list" && !editingTrialId && (
                <div>
                  {/* Filter bar */}
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: "bold",
                          fontSize: 14,
                          color: "#5b21b6",
                        }}
                      >
                        All Trials ({trials.length})
                      </div>
                      <button
                        onClick={() => setAdminFilter("needsinfo")}
                        style={{
                          background:
                            adminFilter === "needsinfo"
                              ? "#f59e0b"
                              : "#fff8e1",
                          color:
                            adminFilter === "needsinfo"
                              ? "#fff"
                              : "#b45309",
                          border: "1px solid #fcd34d",
                          borderRadius: 20,
                          padding: "3px 12px",
                          fontSize: 12,
                          cursor: "pointer",
                          fontWeight: "bold",
                        }}
                      >
                        ⚠️ Needs Info (
                        {trials.filter((t) => t.needsInfo).length})
                      </button>
                    </div>

                    {/* Org filters */}
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      {["all", "NACSW", "UKC", "AKC", "USCSS/Other"].map(
                        (o) => (
                          <button
                            key={o}
                            onClick={() => setAdminFilter(o)}
                            style={{
                              background:
                                adminFilter === o
                                  ? "linear-gradient(135deg,#7c3aed,#06b6d4)"
                                  : ORG_BG[o] || "#ede9fe",
                              color:
                                adminFilter === o
                                  ? "#fff"
                                  : ORG_COLORS[o] || "#7c3aed",
                              border: "none",
                              borderRadius: 20,
                              padding: "3px 12px",
                              fontSize: 12,
                              cursor: "pointer",
                              fontWeight:
                                adminFilter === o ? "bold" : "normal",
                            }}
                          >
                            {o === "all" ? "All" : o}
                            {o !== "all" && (
                              <span
                                style={{
                                  marginLeft: 4,
                                  opacity: 0.7,
                                }}
                              >
                                (
                                {
                                  trials.filter((t) => t.org === o)
                                    .length
                                }
                                )
                              </span>
                            )}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {(adminFilter === "needsinfo"
                    ? trials.filter((t) => t.needsInfo)
                    : adminFilter === "all"
                    ? trials
                    : trials.filter((t) => t.org === adminFilter)
                  ).map((t) => (
                    <div
                      key={t.id}
                      style={{
                        background: t.needsInfo
                          ? "#fffbeb"
                          : ORG_BG[t.org] || "#fff",
                        borderLeft: `4px solid ${
                          t.needsInfo ? "#f59e0b" : ORG_COLORS[t.org]
                        }`,
                        borderRadius: 10,
                        padding: "10px 12px",
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ flex: 1, marginRight: 8 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {t.needsInfo && (
                              <span
                                style={{
                                  fontSize: 10,
                                  background: "#fef3c7",
                                  color: "#b45309",
                                  borderRadius: 10,
                                  padding: "1px 6px",
                                  fontWeight: "bold",
                                }}
                              >
                                ⚠️ NEEDS INFO
                              </span>
                            )}
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: "bold",
                              }}
                            >
                              {t.name}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#888",
                              marginTop: 2,
                            }}
                          >
                            {t.date} · {t.location || "📍 Location TBD"}
                          </div>
                          {!t.entryLink && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#f59e0b",
                                marginTop: 2,
                              }}
                            >
                              ⚠️ No entry link yet
                            </div>
                          )}
                          {!t.entryDeadline && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#f59e0b",
                                marginTop: 1,
                              }}
                            >
                              ⚠️ No deadline set
                            </div>
                          )}
                          {!t.entryOpens && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#f59e0b",
                                marginTop: 1,
                              }}
                            >
                              ⚠️ No entry open date set
                            </div>
                          )}
                          {t.adminNotes && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#b45309",
                                background: "#fffbeb",
                                borderRadius: 6,
                                padding: "3px 8px",
                                marginTop: 4,
                              }}
                            >
                              🔒 {t.adminNotes}
                            </div>
                          )}

                          {/* Quick edit inline */}
                          {quickEditId === t.id ? (
                            <div style={{ marginTop: 6 }}>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 4,
                                  marginBottom: 6,
                                }}
                              >
                                <button
                                  onClick={() =>
                                    setQuickEditMode("link")
                                  }
                                  style={{
                                    fontSize: 10,
                                    background:
                                      quickEditMode === "link"
                                        ? "#7c3aed"
                                        : "#ede9fe",
                                    color:
                                      quickEditMode === "link"
                                        ? "#fff"
                                        : "#7c3aed",
                                    border: "none",
                                    borderRadius: 20,
                                    padding: "2px 8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  🔗 Entry Link
                                </button>
                                <button
                                  onClick={() =>
                                    setQuickEditMode("location")
                                  }
                                  style={{
                                    fontSize: 10,
                                    background:
                                      quickEditMode === "location"
                                        ? "#7c3aed"
                                        : "#ede9fe",
                                    color:
                                      quickEditMode === "location"
                                        ? "#fff"
                                        : "#7c3aed",
                                    border: "none",
                                    borderRadius: 20,
                                    padding: "2px 8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  📍 Location
                                </button>
                              </div>

                              {quickEditMode === "link" ? (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 6,
                                  }}
                                >
                                  <input
                                    style={{
                                      ...inputStyle,
                                      fontSize: 11,
                                      marginBottom: 0,
                                      flex: 1,
                                    }}
                                    placeholder="Paste entry URL…"
                                    value={quickEditLink}
                                    onChange={(e) =>
                                      setQuickEditLink(e.target.value)
                                    }
                                    autoFocus
                                  />
                                  <button
                                    onClick={async () => {
                                      await setDoc(
                                        doc(db, "trials", t.id),
                                        {
                                          ...t,
                                          entryLink: quickEditLink,
                                        },
                                        { merge: true }
                                      );
                                      setQuickEditId(null);
                                      setQuickEditLink("");
                                    }}
                                    style={{
                                      ...btnStyle("#27ae60"),
                                      padding: "4px 10px",
                                      fontSize: 11,
                                    }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => {
                                      setQuickEditId(null);
                                      setQuickEditLink("");
                                    }}
                                    style={{
                                      ...btnStyle("#aaa"),
                                      padding: "4px 8px",
                                      fontSize: 11,
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 6,
                                  }}
                                >
                                  <input
                                    style={{
                                      ...inputStyle,
                                      fontSize: 11,
                                      marginBottom: 0,
                                      flex: 1,
                                    }}
                                    placeholder="Venue, City, TX"
                                    value={quickEditLocation}
                                    onChange={(e) =>
                                      setQuickEditLocation(
                                        e.target.value
                                      )
                                    }
                                    autoFocus
                                  />
                                  <button
                                    onClick={async () => {
                                      await setDoc(
                                        doc(db, "trials", t.id),
                                        {
                                          ...t,
                                          location: quickEditLocation,
                                        },
                                        { merge: true }
                                      );
                                      setQuickEditId(null);
                                      setQuickEditLocation("");
                                    }}
                                    style={{
                                      ...btnStyle("#27ae60"),
                                      padding: "4px 10px",
                                      fontSize: 11,
                                    }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => {
                                      setQuickEditId(null);
                                      setQuickEditLocation("");
                                    }}
                                    style={{
                                      ...btnStyle("#aaa"),
                                      padding: "4px 8px",
                                      fontSize: 11,
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                marginTop: 4,
                                flexWrap: "wrap",
                              }}
                            >
                              {!t.entryLink && (
                                <button
                                  onClick={() => {
                                    setQuickEditId(t.id);
                                    setQuickEditMode("link");
                                    setQuickEditLink("");
                                  }}
                                  style={{
                                    fontSize: 11,
                                    color: "#7c3aed",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 0,
                                    textDecoration: "underline",
                                  }}
                                >
                                  Add entry link
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setQuickEditId(t.id);
                                  setQuickEditMode("location");
                                  setQuickEditLocation(
                                    t.location || ""
                                  );
                                }}
                                style={{
                                  fontSize: 11,
                                  color: "#7c3aed",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: 0,
                                  textDecoration: "underline",
                                }}
                              >
                                Update location
                              </button>
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexShrink: 0,
                          }}
                        >
                          <button
                            onClick={() => {
                              setEditingTrialId(t.id);
                              setTrialForm({
                                ...t,
                                adminNotes: t.adminNotes || "",
                                needsInfo: t.needsInfo || false,
                                entryLink: t.entryLink || "",
                              });
                              setAdminTab("add");
                              window.scrollTo(0, 0);
                            }}
                            style={{
                              ...btnStyle("#3a7bd5", true),
                              padding: "3px 10px",
                              fontSize: 11,
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteTrial(t.id)}
                            style={{
                              ...btnStyle("#c0392b", true),
                              padding: "3px 10px",
                              fontSize: 11,
                            }}
                          >
                            Del
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );

  // ════════════════════════════════════════════════════════════
  // MAIN APP SHELL
  // ════════════════════════════════════════════════════════════
  return (
    <div
      style={{
        fontFamily: "Georgia,serif",
        background: "#f5f3ff",
        minHeight: "100vh",
        color: "#1e1b4b",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg,#6b21a8,#7c3aed,#06b6d4)",
          padding: "14px 18px 0",
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {activeDog && photos[activeDog.id] && (
              <img
                src={photos[activeDog.id]}
                alt={activeDog.callName || "Dog"}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  objectFit: "cover",
                  border: "2px solid rgba(255,255,255,0.5)",
                }}
              />
            )}
            <div>
              <div style={{ fontSize: 17, fontWeight: "bold", color: "#fff" }}>
                NoseWork Notebook
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.75)",
                }}
              >
                {activeDog?.callName
                  ? `${activeDog.callName} · ${
                      dogs.length > 1 ? `${dogs.length} dogs` : "1 dog"
                    }`
                  : "Set up your dog"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setShowAdmin(true)}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.75)",
                fontSize: 20,
                cursor: "pointer",
                padding: 4,
              }}
              title="Admin"
            >
              ⚙️
            </button>
            <button
              onClick={handleLogout}
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "none",
                color: "#fff",
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 2,
            overflowX: "auto",
          }}
        >
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background:
                  tab === t ? "rgba(255,255,255,0.25)" : "transparent",
                color:
                  tab === t
                    ? "#fff"
                    : "rgba(255,255,255,0.7)",
                border: "none",
                borderRadius: "8px 8px 0 0",
                padding: "7px 10px",
                fontSize: 11,
                fontWeight: tab === t ? "bold" : "normal",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          padding: "16px 14px",
          maxWidth: 700,
          margin: "0 auto",
        }}
      >
        {/* DASHBOARD */}
        {tab === "Dashboard" && (
          <div>
            {opensSoon.length > 0 && (
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #93c5fd",
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontWeight: "bold",
                    color: "#1d4ed8",
                    marginBottom: 6,
                  }}
                >
                  Entries Opening Soon
                </div>
                {opensSoon.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      fontSize: 13,
                      color: "#1e40af",
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 3,
                    }}
                  >
                    <span>
                      {t.name.split("-")[0].trim()}{" "}
                      <OrgBadge org={t.org} />
                    </span>
                    <b>{daysUntil(t.entryOpens)}</b>
                  </div>
                ))}
              </div>
            )}

            {deadlineSoon.length > 0 && (
              <div
                style={{
                  background: "#fef9c3",
                  border: "1px solid #fde047",
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontWeight: "bold",
                    color: "#713f12",
                    marginBottom: 6,
                  }}
                >
                  Entry Deadlines Soon
                </div>
                {deadlineSoon.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      fontSize: 13,
                      color: "#854d0e",
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 3,
                    }}
                  >
                    <span>
                      {t.name.split("-")[0].trim()}{" "}
                      <OrgBadge org={t.org} />
                    </span>
                    <b>{daysUntil(t.entryDeadline)}</b>
                  </div>
                ))}
              </div>
            )}

            {/* Stat cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
                marginBottom: 18,
              }}
            >
              <StatCard
                label="Entered"
                value={
                  Object.values(dogRegs).filter(
                    (v) => v?.status === "entered"
                  ).length
                }
                icon="✅"
              />
              <StatCard
                label="Titles"
                value={titlesEarned.length}
                icon="🏅"
              />
              <StatCard
                label="Upcoming"
                value={upcoming.length}
                icon="📅"
              />
            </div>

            {/* Next trial */}
            {upcoming.length > 0 && (
              <div
                style={{
                  background: ORG_BG[upcoming[0].org] || "#fff",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  borderLeft: `5px solid ${ORG_COLORS[upcoming[0].org]}`,
                  boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "#999",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 4,
                  }}
                >
                  Next Trial
                </div>
                <div
                  style={{
                    fontWeight: "bold",
                    fontSize: 15,
                  }}
                >
                  {upcoming[0].name}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#666",
                    marginTop: 5,
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span>{upcoming[0].date}</span>
                  <span>{upcoming[0].location}</span>
                  <span
                    style={{
                      color:
                        getStatus(upcoming[0].id) === "entered"
                          ? "#27ae60"
                          : getStatus(upcoming[0].id) === "waitlist"
                          ? "#f59e0b"
                          : "#e07b39",
                      fontWeight: "bold",
                    }}
                  >
                    {getStatus(upcoming[0].id) === "entered"
                      ? "Entered"
                      : getStatus(upcoming[0].id) === "waitlist"
                      ? "Waitlist"
                      : "Not Entered"}
                  </span>
                </div>
              </div>
            )}

            {/* Recent results */}
            <div
              style={{
                fontWeight: "bold",
                fontSize: 14,
                marginBottom: 10,
                color: "#5b21b6",
              }}
            >
              Recent Results {activeDog?.callName && `· ${activeDog.callName}`}
            </div>
            {myResults.length === 0 ? (
              <div style={{ color: "#bbb", fontSize: 13 }}>
                No results yet — go sniff some stuff! 🐽
              </div>
            ) : (
              myResults
                .slice(-3)
                .reverse()
                .map((r) => <ResultRow key={r.id} r={r} />)
            )}
          </div>
        )}

        {/* TRIALS */}
        {tab === "Trials" && (
          <div>
            {/* Past vs Upcoming toggle */}
            <div
              style={{
                display: "flex",
                gap: 6,
                marginBottom: 12,
              }}
            >
              <button
                onClick={() => setTrialView("upcoming")}
                style={{
                  background:
                    trialView === "upcoming"
                      ? "linear-gradient(135deg,#7c3aed,#06b6d4)"
                      : "#ede9fe",
                  color: trialView === "upcoming" ? "#fff" : "#7c3aed",
                  border: "none",
                  borderRadius: 20,
                  padding: "5px 16px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                Upcoming{" "}
                {trials.filter((t) => new Date(t.date) >= today).length}
              </button>
              <button
                onClick={() => setTrialView("past")}
                style={{
                  background:
                    trialView === "past"
                      ? "linear-gradient(135deg,#7c3aed,#06b6d4)"
                      : "#ede9fe",
                  color: trialView === "past" ? "#fff" : "#7c3aed",
                  border: "none",
                  borderRadius: 20,
                  padding: "5px 16px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                Past{" "}
                {trials.filter((t) => new Date(t.date) < today).length}
              </button>
            </div>

            {/* Filter */}
            <OrgFilter value={filterOrg} onChange={setFilterOrg} />
            <div
              style={{
                fontSize: 11,
                color: "#bbb",
                margin: "6px 0 12px",
                textAlign: "right",
              }}
            >
              {trialsLoading
                ? "Syncing calendar…"
                : `${filtered.length} trials`}
            </div>

            {filtered.map((t) => {
              const status = getStatus(t.id);
              const paid = getPaid(t.id);
              const isPast = new Date(t.date) < today;
              const entriesClosed =
                t.entryDeadline &&
                new Date(t.entryDeadline) < today;
              const statusStyles = {
                none: {
                  bg: "#f5f3ff",
                  color: "#7c3aed",
                  border: "#7c3aed",
                },
                waitlist: {
                  bg: "#fff8e1",
                  color: "#f59e0b",
                  border: "#f59e0b",
                },
                entered: {
                  bg: "#e8f8ee",
                  color: "#27ae60",
                  border: "#27ae60",
                },
              };
              const sc = statusStyles[status];

              return (
                <div
                  key={t.id}
                  style={{
                    background: isPast
                      ? "#f8f8f8"
                      : ORG_BG[t.org] || "#fff",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 10,
                    borderLeft: `5px solid ${
                      isPast ? "#ccc" : ORG_COLORS[t.org]
                    }`,
                    boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
                    opacity: isPast ? 0.85 : 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1, marginRight: 8 }}>
                      <div
                        style={{
                          fontWeight: "bold",
                          fontSize: 14,
                          color: isPast ? "#888" : "#1e1b4b",
                        }}
                      >
                        {t.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#888",
                          marginTop: 2,
                        }}
                      >
                        <OrgBadge org={t.org} /> {t.level}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#555",
                          marginTop: 5,
                        }}
                      >
                        <b>{t.date}</b>{" "}
                        <span
                          onClick={() => openMaps(t.location)}
                          style={{
                            color: "#7c3aed",
                            cursor: "pointer",
                            textDecoration: "underline",
                          }}
                        >
                          {t.location}
                        </span>
                      </div>

                      {t.entryDeadline && !isPast && (
                        <div
                          style={{
                            fontSize: 11,
                            color: entriesClosed
                              ? "#bbb"
                              : "#e07b39",
                            marginTop: 3,
                          }}
                        >
                          {entriesClosed
                            ? "Entries closed"
                            : `Deadline ${t.entryDeadline} (${daysUntil(
                                t.entryDeadline
                              )})`}
                        </div>
                      )}

                      {t.entryOpens && !isPast && !entriesClosed && (
                        <div
                          style={{
                            fontSize: 11,
                            color:
                              new Date(t.entryOpens) <= today
                                ? "#27ae60"
                                : "#3a7bd5",
                            marginTop: 2,
                            fontWeight:
                              new Date(t.entryOpens) <= today
                                ? "bold"
                                : "normal",
                          }}
                        >
                          {new Date(t.entryOpens) <= today
                            ? "Entries open!"
                            : `Opens ${t.entryOpens} (${daysUntil(
                                t.entryOpens
                              )})`}
                        </div>
                      )}

                      {!entriesClosed && !isPast && !t.entryLink && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#f59e0b",
                            marginTop: 2,
                          }}
                        >
                          ⚠️ No entry link yet
                        </div>
                      )}

                      {t.notes && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#999",
                            marginTop: 4,
                            fontStyle: "italic",
                          }}
                        >
                          {t.notes}
                        </div>
                      )}

                      {/* Enter Now button */}
                      {!isPast &&
                        status === "none" &&
                        t.entryLink &&
                        !entriesClosed && (
                          <button
                            onClick={() =>
                              window.open(t.entryLink, "_blank")
                            }
                            style={{
                              background:
                                "linear-gradient(135deg,#7c3aed,#06b6d4)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 20,
                              padding: "5px 16px",
                              fontSize: 11,
                              cursor: "pointer",
                              fontWeight: "bold",
                              marginTop: 6,
                              display: "inline-block",
                            }}
                          >
                            Enter Now
                          </button>
                        )}
                    </div>

                    {/* Status buttons */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        flexShrink: 0,
                        alignItems: "flex-end",
                      }}
                    >
                      {!isPast && (
                        <div
                          style={{
                            display: "flex",
                            gap: 4,
                          }}
                        >
                          {["none", "waitlist", "entered"].map((s) => (
                            <button
                              key={s}
                              onClick={() => setTrialStatus(t.id, s)}
                              style={{
                                background:
                                  status === s ? sc.bg : "#fff",
                                color:
                                  status === s ? sc.color : "#bbb",
                                border: `1px solid ${
                                  status === s ? sc.border : "#ddd"
                                }`,
                                borderRadius: 20,
                                padding: "3px 8px",
                                fontSize: 10,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                                fontWeight:
                                  status === s ? "bold" : "normal",
                              }}
                            >
                              {s === "none"
                                ? "Not In"
                                : s === "waitlist"
                                ? "Waitlist"
                                : "Entered"}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Past summary */}
                      {isPast && status !== "none" && (
                        <span
                          style={{
                            background: sc.bg,
                            color: sc.color,
                            border: `1px solid ${sc.border}`,
                            borderRadius: 20,
                            padding: "3px 10px",
                            fontSize: 10,
                            fontWeight: "bold",
                          }}
                        >
                          {status === "entered"
                            ? "Attended"
                            : "Waitlisted"}
                        </span>
                      )}

                      {/* Paid toggle */}
                      {!isPast && status !== "none" && (
                        <button
                          onClick={() => togglePaid(t.id)}
                          style={{
                            background: paid
                              ? "#e8f8ee"
                              : "#ffeaea",
                            color: paid ? "#27ae60" : "#c0392b",
                            border: `1px solid ${
                              paid ? "#27ae60" : "#ffaaaa"
                            }`,
                            borderRadius: 20,
                            padding: "3px 10px",
                            fontSize: 10,
                            cursor: "pointer",
                            fontWeight: "bold",
                          }}
                        >
                          {paid ? "Paid" : "Unpaid"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && !trialsLoading && (
              <div
                style={{
                  color: "#bbb",
                  fontSize: 13,
                  textAlign: "center",
                  marginTop: 30,
                }}
              >
                No trials found!
              </div>
            )}
          </div>
        )}

        {/* TRAINING TAB */}
        {tab === "Training" && (
          <TrainingTab
            activeDog={activeDog}
            myTraining={myTraining}
            addTrainingEntry={addTrainingEntry}
            deleteTrainingEntry={deleteTrainingEntry}
          />
        )}

        {/* RESULTS TAB, TITLES TAB, MY DOGS TAB, ACCOUNT TAB come next */}
        {/* RESULTS */}
        {tab === "Results" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontWeight: "bold",
                  fontSize: 14,
                  color: "#5b21b6",
                }}
              >
                Trial Results {activeDog?.callName && `· ${activeDog.callName}`}
              </div>
              <button
                onClick={() => setShowResultForm(true)}
                style={{
                  ...btnStyle("#7c3aed"),
                  padding: "4px 10px",
                  fontSize: 11,
                }}
              >
                ➕ Add Result
              </button>
            </div>

            {myResults.length === 0 ? (
              <div style={{ color: "#bbb", fontSize: 13 }}>
                No results yet — when you earn your first ribbon, log it here!
              </div>
            ) : (
              myResults
                .slice()
                .reverse()
                .map((r) => <ResultRow key={r.id} r={r} />)
            )}

            {showResultForm && (
              <div style={formStyle}>
                <div style={formTitle}>
                  Add Result {activeDog?.callName && `· ${activeDog.callName}`}
                </div>
                <form onSubmit={addResult}>
                  <label style={labelStyle}>Organization</label>
                  <select
                    style={inputStyle}
                    value={resultForm.org}
                    onChange={(e) =>
                      setResultForm({
                        ...resultForm,
                        org: e.target.value,
                      })
                    }
                  >
                    {ORGS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>

                  <label style={labelStyle}>Trial Name</label>
                  <input
                    style={inputStyle}
                    value={resultForm.trial}
                    onChange={(e) =>
                      setResultForm({
                        ...resultForm,
                        trial: e.target.value,
                      })
                    }
                  />

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div>
                      <label style={labelStyle}>Date</label>
                      <input
                        type="date"
                        style={inputStyle}
                        value={resultForm.date}
                        onChange={(e) =>
                          setResultForm({
                            ...resultForm,
                            date: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Level / Class</label>
                      <input
                        style={inputStyle}
                        value={resultForm.level}
                        onChange={(e) =>
                          setResultForm({
                            ...resultForm,
                            level: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <label style={labelStyle}>Result</label>
                  <select
                    style={inputStyle}
                    value={resultForm.result}
                    onChange={(e) =>
                      setResultForm({
                        ...resultForm,
                        result: e.target.value,
                      })
                    }
                  >
                    <option>Pass</option>
                    <option>NQ</option>
                    <option>Q</option>
                    <option>Other</option>
                  </select>

                  <label style={labelStyle}>Title Earned (optional)</label>
                  <input
                    style={inputStyle}
                    value={resultForm.title}
                    onChange={(e) =>
                      setResultForm({
                        ...resultForm,
                        title: e.target.value,
                      })
                    }
                    placeholder="e.g. NW1, SCN, SIF"
                  />

                  <label style={labelStyle}>Notes</label>
                  <textarea
                    style={{ ...inputStyle, height: 60 }}
                    value={resultForm.notes}
                    onChange={(e) =>
                      setResultForm({
                        ...resultForm,
                        notes: e.target.value,
                      })
                    }
                    placeholder="Search areas, hides found, what to improve…"
                  />

                  <label style={labelStyle}>
                    Ribbon Photo (optional, 5–8 MB or smaller)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setResultPhotoFile(e.target.files?.[0] || null)
                    }
                    style={{
                      fontSize: 12,
                      marginBottom: 8,
                    }}
                  />

                  <label style={labelStyle}>Video Link (optional)</label>
                  <input
                    style={inputStyle}
                    value={resultForm.videoLink}
                    onChange={(e) =>
                      setResultForm({
                        ...resultForm,
                        videoLink: e.target.value,
                      })
                    }
                    placeholder="YouTube or Vimeo URL"
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <button
                      type="submit"
                      style={{
                        ...btnStyle("#7c3aed"),
                        background:
                          "linear-gradient(135deg,#7c3aed,#06b6d4)",
                      }}
                    >
                      Save Result
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowResultForm(false);
                        setResultPhotoFile(null);
                      }}
                      style={btnStyle("#aaa")}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* TITLES */}
        {tab === "Titles" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontWeight: "bold",
                  fontSize: 14,
                  color: "#5b21b6",
                }}
              >
                Titles {activeDog?.callName && `· ${activeDog.callName}`}
              </div>
              <button
                onClick={() => setShowTitleForm(true)}
                style={{
                  ...btnStyle("#7c3aed"),
                  padding: "4px 10px",
                  fontSize: 11,
                }}
              >
                ➕ Add Existing Title
              </button>
            </div>

            {titlesEarned.length === 0 ? (
              <div style={{ color: "#bbb", fontSize: 13 }}>
                No titles entered yet — when you add results with titles,
                they’ll appear here.
              </div>
            ) : (
              <div>
                {titlesEarned.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      background: ORG_BG[t.org] || "#fff",
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 6,
                      borderLeft: `4px solid ${ORG_COLORS[t.org]}`,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "bold",
                        fontSize: 13,
                      }}
                    >
                      {t.title} <OrgBadge org={t.org} />
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#777",
                        marginTop: 2,
                      }}
                    >
                      {t.trial} {t.date && `· ${t.date}`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showTitleForm && (
              <div style={formStyle}>
                <div style={formTitle}>
                  Add Existing Title{" "}
                  {activeDog?.callName && `· ${activeDog.callName}`}
                </div>
                <form onSubmit={addManualTitle}>
                  <label style={labelStyle}>Organization</label>
                  <select
                    style={inputStyle}
                    value={titleForm.org}
                    onChange={(e) =>
                      setTitleForm({
                        ...titleForm,
                        org: e.target.value,
                      })
                    }
                  >
                    {ORGS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>

                  <label style={labelStyle}>Title</label>
                  <input
                    required
                    style={inputStyle}
                    value={titleForm.title}
                    onChange={(e) =>
                      setTitleForm({
                        ...titleForm,
                        title: e.target.value,
                      })
                    }
                    placeholder="e.g. NW1, SCN, SIF"
                  />

                  <label style={labelStyle}>Trial Name (optional)</label>
                  <input
                    style={inputStyle}
                    value={titleForm.trial}
                    onChange={(e) =>
                      setTitleForm({
                        ...titleForm,
                        trial: e.target.value,
                      })
                    }
                    placeholder="Where did you earn it?"
                  />

                  <label style={labelStyle}>
                    Date (optional — month/year is fine)
                  </label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={titleForm.date}
                    onChange={(e) =>
                      setTitleForm({
                        ...titleForm,
                        date: e.target.value,
                      })
                    }
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <button
                      type="submit"
                      style={{
                        ...btnStyle("#7c3aed"),
                        background:
                          "linear-gradient(135deg,#7c3aed,#06b6d4)",
                      }}
                    >
                      Save Title
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTitleForm(false)}
                      style={btnStyle("#aaa")}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* MY DOGS */}
        {tab === "My Dogs" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontWeight: "bold",
                  fontSize: 14,
                  color: "#5b21b6",
                }}
              >
                My Dogs
              </div>
              <button
                onClick={addDog}
                style={{
                  ...btnStyle("#7c3aed"),
                  padding: "4px 10px",
                  fontSize: 11,
                }}
              >
                ➕ Add Dog
              </button>
            </div>

            {dogs.length === 0 ? (
              <div style={{ color: "#bbb", fontSize: 13 }}>
                No dogs yet — add your first dog to get started.
              </div>
            ) : (
              dogs.map((d) => (
                <div
                  key={d.id}
                  style={{
                    background:
                      d.id === activeDogId ? "#ede9fe" : "#fff",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                    border:
                      d.id === activeDogId
                        ? "1px solid #7c3aed"
                        : "1px solid #eee",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ position: "relative" }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        background: "#f3e8ff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {photos[d.id] ? (
                        <img
                          src={photos[d.id]}
                          alt={d.callName || "Dog"}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 18 }}>🐶</span>
                      )}
                    </div>
                    <label
                      style={{
                        position: "absolute",
                        bottom: -4,
                        right: -4,
                        background: "#7c3aed",
                        color: "#fff",
                        borderRadius: 12,
                        fontSize: 9,
                        padding: "2px 4px",
                        cursor: "pointer",
                      }}
                    >
                      ✎
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) =>
                          e.target.files?.[0] &&
                          handlePhoto(d.id, e.target.files[0])
                        }
                      />
                    </label>
                  </div>

                  <div
                    style={{ flex: 1, cursor: "pointer" }}
                    onClick={() => setActiveDogId(d.id)}
                  >
                    <div
                      style={{
                        fontWeight: "bold",
                        fontSize: 13,
                      }}
                    >
                      {d.callName || "Unnamed Dog"}
                      {d.id === activeDogId && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "#7c3aed",
                            marginLeft: 6,
                          }}
                        >
                          (Active)
                        </span>
                      )}
                    </div>
                    {d.name && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "#777",
                          marginTop: 2,
                        }}
                      >
                        {d.name}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 10,
                        color: "#999",
                        marginTop: 2,
                      }}
                    >
                      {d.breed && `${d.breed} · `}
                      {d.dob && `DOB ${d.dob}`}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <button
                      onClick={() => {
                        setEditingDogId(d.id);
                        setDogForm(d);
                      }}
                      style={{
                        ...btnStyle("#3a7bd5", true),
                        padding: "3px 10px",
                        fontSize: 11,
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(d.id)}
                      style={{
                        ...btnStyle("#c0392b", true),
                        padding: "3px 10px",
                        fontSize: 11,
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  {deleteConfirm === d.id && (
                    <div
                      style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.4)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 50,
                      }}
                    >
                      <div
                        style={{
                          background: "#fff",
                          borderRadius: 12,
                          padding: 20,
                          maxWidth: 320,
                          width: "90%",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: "bold",
                            marginBottom: 8,
                          }}
                        >
                          Delete {d.callName || "this dog"}?
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#666",
                            marginBottom: 16,
                          }}
                        >
                          This will remove their trials, training notes,
                          and results from this app.
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            justifyContent: "flex-end",
                          }}
                        >
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            style={btnStyle("#aaa")}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => deleteDog(d.id)}
                            style={btnStyle("#c0392b")}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {editingDogId && (
              <div style={formStyle}>
                <div style={formTitle}>Edit Dog</div>
                <form onSubmit={saveDog}>
                  <label style={labelStyle}>Call Name</label>
                  <input
                    style={inputStyle}
                    value={dogForm.callName || ""}
                    onChange={(e) =>
                      setDogForm({
                        ...dogForm,
                        callName: e.target.value,
                      })
                    }
                  />
                  <label style={labelStyle}>Registered Name</label>
                  <input
                    style={inputStyle}
                    value={dogForm.name || ""}
                    onChange={(e) =>
                      setDogForm({ ...dogForm, name: e.target.value })
                    }
                  />
                  <label style={labelStyle}>Breed</label>
                  <input
                    style={inputStyle}
                    value={dogForm.breed || ""}
                    onChange={(e) =>
                      setDogForm({
                        ...dogForm,
                        breed: e.target.value,
                      })
                    }
                  />
                  <label style={labelStyle}>Date of Birth</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={dogForm.dob || ""}
                    onChange={(e) =>
                      setDogForm({ ...dogForm, dob: e.target.value })
                    }
                  />
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: "bold",
                      marginTop: 10,
                      color: "#5b21b6",
                    }}
                  >
                    Organization IDs
                  </div>
                  {ORG_IDS.map(({ org, key, label, placeholder }) => (
                    <div key={key}>
                      <label
                        style={{
                          ...labelStyle,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <OrgBadge org={org} size={10} /> {label}
                      </label>
                      <input
                        style={inputStyle}
                        placeholder={placeholder}
                        value={dogForm[key] || ""}
                        onChange={(e) =>
                          setDogForm({
                            ...dogForm,
                            [key]: e.target.value,
                          })
                        }
                      />
                    </div>
                  ))}

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <button
                      type="submit"
                      style={{
                        ...btnStyle("#7c3aed"),
                        background:
                          "linear-gradient(135deg,#7c3aed,#06b6d4)",
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingDogId(null)}
                      style={btnStyle("#aaa")}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ACCOUNT */}
        {tab === "Account" && (
          <div>
            <div
              style={{
                fontWeight: "bold",
                fontSize: 14,
                color: "#5b21b6",
                marginBottom: 12,
              }}
            >
              Account Settings
            </div>

            <div style={formStyle}>
              <div style={formTitle}>Profile</div>
              <form onSubmit={updateAccountName}>
                <label style={labelStyle}>Current Name</label>
                <div
                  style={{
                    fontSize: 13,
                    marginBottom: 8,
                    color: "#555",
                  }}
                >
                  {user.displayName || "(none set)"}
                </div>
                <label style={labelStyle}>New Name</label>
                <input
                  style={inputStyle}
                  value={accountForm.name}
                  onChange={(e) =>
                    setAccountForm({
                      ...accountForm,
                      name: e.target.value,
                    })
                  }
                  placeholder="New display name"
                />
                <button
                  type="submit"
                  style={{
                    ...btnStyle("#7c3aed"),
                    marginTop: 8,
                  }}
                >
                  Update Name
                </button>
              </form>
            </div>

            <div style={formStyle}>
              <div style={formTitle}>Change Password</div>
              <form onSubmit={updateAccountPassword}>
                <label style={labelStyle}>Current Password</label>
                <input
                  type="password"
                  style={inputStyle}
                  value={accountForm.currentPassword}
                  onChange={(e) =>
                    setAccountForm({
                      ...accountForm,
                      currentPassword: e.target.value,
                    })
                  }
                />
                <label style={labelStyle}>New Password</label>
                <input
                  type="password"
                  style={inputStyle}
                  value={accountForm.newPassword}
                  onChange={(e) =>
                    setAccountForm({
                      ...accountForm,
                      newPassword: e.target.value,
                    })
                  }
                />
                <button
                  type="submit"
                  style={{
                    ...btnStyle("#7c3aed"),
                    marginTop: 8,
                  }}
                >
                  Update Password
                </button>
              </form>
            </div>

            <div style={formStyle}>
              <div style={formTitle}>Danger Zone</div>
              {accountMsg && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#27ae60",
                    marginBottom: 8,
                  }}
                >
                  {accountMsg}
                </div>
              )}
              {accountError && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#c0392b",
                    marginBottom: 8,
                  }}
                >
                  {accountError}
                </div>
              )}

              <button
                onClick={() => setShowDeleteAccount(true)}
                style={{
                  ...btnStyle("#c0392b"),
                  background: "#fee2e2",
                  color: "#c0392b",
                }}
              >
                Delete My Account
              </button>

              {showDeleteAccount && (
                <form
                  onSubmit={handleDeleteAccount}
                  style={{ marginTop: 12 }}
                >
                  <label style={labelStyle}>
                    Confirm Password to Delete
                  </label>
                  <input
                    type="password"
                    style={inputStyle}
                    value={deletePassword}
                    onChange={(e) =>
                      setDeletePassword(e.target.value)
                    }
                  />
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    <button
                      type="submit"
                      style={btnStyle("#c0392b")}
                    >
                      Permanently Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeleteAccount(false);
                        setDeletePassword("");
                      }}
                      style={btnStyle("#aaa")}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// TRAINING TAB COMPONENT
// ════════════════════════════════════════════════════════════

function TrainingTab({ activeDog, myTraining, addTrainingEntry, deleteTrainingEntry }) {
  const [trainingForm, setTrainingForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: "Class",
    location: "",
    skills: "",
    notes: "",
    rating: "👍",
    videoLink: "",
  });

  if (!activeDog) {
    return (
      <div style={{ color: "#bbb", fontSize: 13 }}>
        Add a dog first to start logging training.
      </div>
    );
  }

  const handleSubmit = (e) => {
    addTrainingEntry(e, trainingForm);
    setTrainingForm((prev) => ({
      ...prev,
      location: "",
      skills: "",
      notes: "",
      videoLink: "",
    }));
  };

  return (
    <div>
      <div
        style={{
          fontWeight: "bold",
          fontSize: 14,
          color: "#5b21b6",
          marginBottom: 10,
        }}
      >
        Training Log · {activeDog.callName || "Your Dog"}
      </div>

      <div style={formStyle}>
        <div style={formTitle}>Add Training Session</div>
        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <div>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                style={inputStyle}
                value={trainingForm.date}
                onChange={(e) =>
                  setTrainingForm({
                    ...trainingForm,
                    date: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label style={labelStyle}>Session Type</label>
              <select
                style={inputStyle}
                value={trainingForm.type}
                onChange={(e) =>
                  setTrainingForm({
                    ...trainingForm,
                    type: e.target.value,
                  })
                }
              >
                <option>Class</option>
                <option>Private Lesson</option>
                <option>Home Practice</option>
                <option>Fun Match</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <label style={labelStyle}>Location</label>
          <input
            style={inputStyle}
            value={trainingForm.location}
            onChange={(e) =>
              setTrainingForm({
                ...trainingForm,
                location: e.target.value,
              })
            }
            placeholder="Training center, home, park, etc."
          />

          <label style={labelStyle}>Skills / Hide Types</label>
          <input
            style={inputStyle}
            value={trainingForm.skills}
            onChange={(e) =>
              setTrainingForm({
                ...trainingForm,
                skills: e.target.value,
              })
            }
            placeholder="e.g. NW3 level interiors, vehicle combos, inaccessibles"
          />

          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, height: 60 }}
            value={trainingForm.notes}
            onChange={(e) =>
              setTrainingForm({
                ...trainingForm,
                notes: e.target.value,
              })
            }
            placeholder="What went well, what to improve, patterns you saw…"
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: 10,
            }}
          >
            <div>
              <label style={labelStyle}>Overall Feel</label>
              <select
                style={inputStyle}
                value={trainingForm.rating}
                onChange={(e) =>
                  setTrainingForm({
                    ...trainingForm,
                    rating: e.target.value,
                  })
                }
              >
                <option>👍</option>
                <option>👌</option>
                <option>🤔</option>
                <option>😬</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Video Link (optional)</label>
              <input
                style={inputStyle}
                value={trainingForm.videoLink}
                onChange={(e) =>
                  setTrainingForm({
                    ...trainingForm,
                    videoLink: e.target.value,
                  })
                }
                placeholder="YouTube or Vimeo URL"
              />
            </div>
          </div>

          <button
            type="submit"
            style={{
              ...btnStyle("#7c3aed"),
              marginTop: 10,
              background:
                "linear-gradient(135deg,#7c3aed,#06b6d4)",
            }}
          >
            Save Training Session
          </button>
        </form>
      </div>

      <div
        style={{
          fontWeight: "bold",
          fontSize: 13,
          color: "#5b21b6",
          marginTop: 16,
          marginBottom: 6,
        }}
      >
        Recent Sessions
      </div>

      {myTraining.length === 0 ? (
        <div style={{ color: "#bbb", fontSize: 13 }}>
          No training logged yet. After each class or practice, jot a
          quick note here.
        </div>
      ) : (
        myTraining.map((s) => (
          <TrainingEntryCard
            key={s.id}
            entry={s}
            onDelete={() => deleteTrainingEntry(s.id)}
          />
        ))
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ════════════════════════════════════════════════════════════

function OrgBadge({ org, size = 9 }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        padding: "1px 6px",
        borderRadius: 999,
        background: ORG_BG[org] || "#eee",
        color: ORG_COLORS[org] || "#555",
        border: `1px solid ${
          ORG_COLORS[org] || "rgba(0,0,0,0.1)"
        }`,
      }}
    >
      <span
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: ORG_COLORS[org] || "#999",
        }}
      />
      {org}
    </span>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: 10,
        textAlign: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div
        style={{
          fontWeight: "bold",
          fontSize: 16,
          marginTop: 2,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#777",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function ResultRow({ r }) {
  return (
    <div
      style={{
        background: ORG_BG[r.org] || "#fff",
        borderRadius: 10,
        padding: 10,
        marginBottom: 6,
        borderLeft: `4px solid ${ORG_COLORS[r.org]}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontWeight: "bold",
              fontSize: 13,
            }}
          >
            {r.trial || "Trial"}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#777",
              marginTop: 2,
            }}
          >
            {r.date} · {r.level || "Level"}{" "}
            <OrgBadge org={r.org} />
          </div>
          {r.title && (
            <div
              style={{
                fontSize: 11,
                color: "#5b21b6",
                marginTop: 2,
                fontWeight: "bold",
              }}
            >
              🏅 {r.title}
            </div>
          )}
          {r.notes && (
            <div
              style={{
                fontSize: 11,
                color: "#555",
                marginTop: 4,
              }}
            >
              {r.notes}
            </div>
          )}
          {r.videoLink && (
            <a
              href={r.videoLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                color: "#3b82f6",
                marginTop: 4,
                display: "inline-block",
              }}
            >
              🎥 Watch video
            </a>
          )}
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: "bold",
            color:
              r.result === "Pass" || r.result === "Q"
                ? "#27ae60"
                : "#c0392b",
          }}
        >
          {r.result}
        </div>
      </div>
      {r.photoUrl && (
        <img
          src={r.photoUrl}
          alt="Ribbon"
          style={{
            marginTop: 8,
            borderRadius: 8,
            maxHeight: 120,
            objectFit: "cover",
          }}
        />
      )}
    </div>
  );
}

function TrainingEntryCard({ entry, onDelete }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
        border: "1px solid #e5e7eb",
        boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontWeight: "bold",
              fontSize: 13,
            }}
          >
            {entry.date} · {entry.type} {entry.rating}
          </div>
          {entry.location && (
            <div
              style={{
                fontSize: 11,
                color: "#666",
                marginTop: 2,
              }}
            >
              📍 {entry.location}
            </div>
          )}
          {entry.skills && (
            <div
              style={{
                fontSize: 11,
                color: "#4b5563",
                marginTop: 2,
              }}
            >
              Skills: {entry.skills}
            </div>
          )}
          {entry.notes && (
            <div
              style={{
                fontSize: 11,
                color: "#374151",
                marginTop: 4,
              }}
            >
              {entry.notes}
            </div>
          )}
          {entry.videoLink && (
            <a
              href={entry.videoLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                color: "#3b82f6",
                marginTop: 4,
                display: "inline-block",
              }}
            >
              🎥 Watch training video
            </a>
          )}
        </div>
        <button
          onClick={onDelete}
          style={{
            ...btnStyle("#c0392b", true),
            padding: "2px 8px",
            fontSize: 10,
            height: "fit-content",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function OrgFilter({ value, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: 4,
      }}
    >
      {["All", "Entered", ...ORGS].map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          style={{
            background:
              value === o
                ? "linear-gradient(135deg,#7c3aed,#06b6d4)"
                : "#ede9fe",
            color: value === o ? "#fff" : "#7c3aed",
            border: "none",
            borderRadius: 20,
            padding: "3px 10px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SHARED STYLES
// ════════════════════════════════════════════════════════════

const formStyle = {
  background: "#fff",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};

const formTitle = {
  fontWeight: "bold",
  fontSize: 14,
  marginBottom: 10,
  color: "#5b21b6",
};

const labelStyle = {
  fontSize: 11,
  fontWeight: "bold",
  marginTop: 8,
  marginBottom: 4,
  color: "#4b5563",
};

const inputStyle = {
  width: "100%",
  padding: "7px 9px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

const btnStyle = (color, outline = false) => ({
  borderRadius: 999,
  border: outline ? `1px solid ${color}` : "none",
  background: outline ? "transparent" : color,
  color: outline ? color : "#fff",
  padding: "5px 14px",
  fontSize: 12,
  cursor: "pointer",
});

