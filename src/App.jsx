import { useState, useEffect } from "react";
import { db } from "./firebase";
import { MASTER_TRIALS } from "./trials";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot,
  writeBatch, getDoc, getDocs
} from "firebase/firestore";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail, updateProfile,
  updateEmail, updatePassword, deleteUser, EmailAuthProvider, reauthenticateWithCredential
} from "firebase/auth";
import { storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// ── Constants ────────────────────────────────────────────────
const ORGS = ["NACSW", "UKC", "AKC", "USCSS/Other"];
const ORG_COLORS = { NACSW: "#e07b39", UKC: "#3a7bd5", AKC: "#c0392b", "USCSS/Other": "#27ae60" };
const ORG_BG     = { NACSW: "#fff5ee", UKC: "#eef4ff", AKC: "#fff0f0", "USCSS/Other": "#f0fff5" };
const ADMIN_PIN  = "1234"; // ← Change this before sharing!

const ORG_IDS = [
  { org: "NACSW",        key: "nacsw",  label: "NACSW #",                  placeholder: "e.g. K040827"       },
  { org: "AKC",          key: "akc",    label: "AKC # (Canine Partners)",   placeholder: "e.g. MB25813301"    },
  { org: "UKC",          key: "ukc",    label: "UKC Performance Listing #", placeholder: "e.g. PL025899"      },
  { org: "USCSS/Other",  key: "uscss",  label: "USCSS Member #",            placeholder: "e.g. your USCSS ID" },
];

const auth = getAuth();
const TABS = ["Dashboard", "Trials", "Results", "Titles", "Training", "My Dogs", "Account"];
const blankDog = () => ({ id: Date.now().toString(), callName:"", name:"", breed:"", dob:"", nacsw:"", akc:"", ukc:"", uscss:"" });

export default function App() {
  // ── Auth state ───────────────────────────────────────────────
  const [user, setUser]               = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode]       = useState("login"); // login | signup | reset
  const [authForm, setAuthForm]       = useState({ name:"", email:"", password:"" });
  const [authError, setAuthError]     = useState("");
  const [authLogging, setAuthLogging] = useState(false);

  // ── Core state ───────────────────────────────────────────────
  const [tab, setTab]                   = useState("Dashboard");
  const [dogs, setDogs]                 = useState([]);
  const [activeDogId, setActiveDogId]   = useState(null);
  const [photos, setPhotos]             = useState({});
  const [registrations, setRegistrations] = useState({});
  const [allResults, setAllResults]     = useState({});
  const [dataLoaded, setDataLoaded]     = useState(false);

  // ── Firebase trial calendar ──────────────────────────────────
  const [trials, setTrials]             = useState([]);
  const [trialsLoading, setTrialsLoading] = useState(true);

  // ── Admin ────────────────────────────────────────────────────
  const [showAdmin, setShowAdmin]         = useState(false);
  const [adminPin, setAdminPin]           = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminTab, setAdminTab]           = useState("list");
  const [trialForm, setTrialForm]         = useState({ org:"NACSW", name:"", date:"", location:"", level:"", entryOpens:"", entryDeadline:"", entryLink:"", notes:"", adminNotes:"", needsInfo:false });
  const [adminFilter, setAdminFilter]     = useState("all"); // all | needsinfo
  const [quickEditId, setQuickEditId]     = useState(null);
  const [quickEditLink, setQuickEditLink] = useState("");
  const [quickEditMode, setQuickEditMode] = useState("link"); // "link" | "location"
  const [quickEditLocation, setQuickEditLocation] = useState("");
  const [editingTrialId, setEditingTrialId] = useState(null);

  // ── UI ───────────────────────────────────────────────────────
  const [filterOrg, setFilterOrg]           = useState("All");
  const [showResultForm, setShowResultForm] = useState(false);
  const [resultForm, setResultForm]         = useState({ org:"NACSW", trial:"", date:"", level:"", result:"Pass", title:"", notes:"", videoLink:"" });
  const [showTitleForm, setShowTitleForm]   = useState(false);
  const [titleForm, setTitleForm]           = useState({ org:"NACSW", title:"", trial:"", date:"" });
  const [trialView, setTrialView]           = useState("upcoming"); // "upcoming" | "past"
  const [resultPhotoFile, setResultPhotoFile] = useState(null);

  // ── Training state ───────────────────────────────────────────
  const [allTraining, setAllTraining]           = useState({});
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [trainingForm, setTrainingForm]         = useState({ date: new Date().toISOString().slice(0,10), time:"", type:"Class", location:"", notes:"", rating:"👍 Great", videoLink:"", runs:[] });
  const [editingTrainingId, setEditingTrainingId] = useState(null);
  const [showRunForm, setShowRunForm]           = useState(false);
  const [runForm, setRunForm]                   = useState({ odors:[], hideType:"Blind", elements:[], blindOutcome:"" });
  const [editingRunIdx, setEditingRunIdx]       = useState(null);
  const [editingDogId, setEditingDogId]     = useState(null);
  const [dogForm, setDogForm]               = useState({});
  const [deleteConfirm, setDeleteConfirm]   = useState(null);
  const [onboardStep, setOnboardStep]       = useState(0);
  const [onboardDog, setOnboardDog]         = useState(blankDog());

  // ── Account settings state ───────────────────────────────────
  const [accountForm, setAccountForm]       = useState({ name:"", email:"", newPassword:"", currentPassword:"" });
  const [accountMsg, setAccountMsg]         = useState("");
  const [accountError, setAccountError]     = useState("");
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  const activeDog = dogs.find(d => d.id === activeDogId) || dogs[0];
  const today = new Date();

  // ── Auth listener ────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setUser(u);
      setAuthLoading(false);
      if (!u) setDataLoaded(false);
    });
    return () => unsub();
  }, []);

  // ── Firebase trial calendar ──────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "trials"), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(a.date)-new Date(b.date));
      setTrials(data); setTrialsLoading(false);
    }, () => { setTrials(MASTER_TRIALS); setTrialsLoading(false); });
    return () => unsub();
  }, []);

  // ── Load user data from Firebase (real-time) ─────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), snap => {
      if (snap.exists()) {
        const data = snap.data();
        setDogs(data.dogs || []);
        setActiveDogId(id => id || data.activeDogId || null);
        setRegistrations(data.registrations || {});
        setAllResults(data.results || {});
        setPhotos(data.photos || {});
        setAllTraining(data.training || {});
      }
      setDataLoaded(true);
    }, () => setDataLoaded(true));
    return () => unsub();
  }, [user]);

  // ── Save user data to Firebase ───────────────────────────────
  async function saveUserData(updates) {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), updates, { merge: true });
    } catch (e) { console.error("Save error:", e); }
  }

  // ── Auth functions ───────────────────────────────────────────
  async function handleSignup(e) {
    e.preventDefault();
    setAuthError(""); setAuthLogging(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
      await updateProfile(cred.user, { displayName: authForm.name });
      setUser(cred.user);
    } catch (err) {
      setAuthError(friendlyError(err.code));
    }
    setAuthLogging(false);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError(""); setAuthLogging(true);
    try {
      await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
    } catch (err) {
      setAuthError(friendlyError(err.code));
    }
    setAuthLogging(false);
  }

  async function handleReset(e) {
    e.preventDefault();
    setAuthError(""); setAuthLogging(true);
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
    setDogs([]); setActiveDogId(null); setRegistrations({});
    setAllResults({}); setPhotos({}); setDataLoaded(false);
  }

  // ── Account management ───────────────────────────────────────
  async function updateAccountName(e) {
    e.preventDefault();
    setAccountMsg(""); setAccountError("");
    try {
      await updateProfile(auth.currentUser, { displayName: accountForm.name });
      setAccountMsg("✅ Name updated successfully!");
      setAccountForm(f => ({...f, name:""}));
    } catch (err) { setAccountError("Could not update name. Please try again."); }
  }

  async function updateAccountEmail(e) {
    e.preventDefault();
    setAccountMsg(""); setAccountError("");
    try {
      // Re-authenticate first
      const credential = EmailAuthProvider.credential(auth.currentUser.email, accountForm.currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      // Save all current user data
      const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
      const userData = snap.exists() ? snap.data() : {};
      const displayName = auth.currentUser.displayName;
      const oldUid = auth.currentUser.uid;
      // Delete old account
      await deleteUser(auth.currentUser);
      // Create new account with new email
      const cred = await createUserWithEmailAndPassword(auth, accountForm.email, accountForm.currentPassword);
      await updateProfile(cred.user, { displayName });
      // Restore all data under new UID
      await setDoc(doc(db, "users", cred.user.uid), userData);
      setAccountMsg("✅ Email updated successfully!");
      setAccountForm(f => ({...f, email:"", currentPassword:""}));
    } catch (err) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") setAccountError("Wrong current password.");
      else if (err.code === "auth/email-already-in-use") setAccountError("That email is already registered.");
      else if (err.code === "auth/invalid-email") setAccountError("Please enter a valid email address.");
      else setAccountError("Could not update email. Please try again.");
    }
  }

  async function updateAccountPassword(e) {
    e.preventDefault();
    setAccountMsg(""); setAccountError("");
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, accountForm.currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, accountForm.newPassword);
      setAccountMsg("✅ Password updated successfully!");
      setAccountForm(f => ({...f, newPassword:"", currentPassword:""}));
    } catch (err) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") setAccountError("Wrong current password.");
      else setAccountError("Could not update password. Please try again.");
    }
  }

  async function handleDeleteAccount(e) {
    e.preventDefault();
    setAccountError("");
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, deletePassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      // Delete user data from Firestore
      await deleteDoc(doc(db, "users", auth.currentUser.uid));
      // Delete auth account
      await deleteUser(auth.currentUser);
      setDogs([]); setActiveDogId(null); setRegistrations({});
      setAllResults({}); setPhotos({}); setDataLoaded(false);
    } catch (err) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") setAccountError("Wrong password. Account not deleted.");
      else setAccountError("Could not delete account. Please try again.");
    }
  }

  // ── Onboarding (first dog setup) ─────────────────────────────
  async function finishOnboarding() {
    const dog = { ...onboardDog, id: Date.now().toString() };
    const newDogs = [dog];
    setDogs(newDogs); setActiveDogId(dog.id);
    await saveUserData({ dogs: newDogs, activeDogId: dog.id, registrations:{}, results:{}, photos:{} });
  }

  // ── Dog management ───────────────────────────────────────────
  async function saveDog(e) {
    e.preventDefault();
    const newDogs = dogs.map(d => d.id === editingDogId ? { ...dogForm } : d);
    setDogs(newDogs); setEditingDogId(null);
    await saveUserData({ dogs: newDogs });
  }
  async function addDog() {
    const dog = blankDog();
    const newDogs = [...dogs, dog];
    setDogs(newDogs); setActiveDogId(dog.id);
    setEditingDogId(dog.id); setDogForm(dog);
    await saveUserData({ dogs: newDogs, activeDogId: dog.id });
  }
  async function deleteDog(id) {
    const rem = dogs.filter(d => d.id !== id);
    setDogs(rem);
    const newActiveId = rem[0]?.id || null;
    setActiveDogId(newActiveId);
    setDeleteConfirm(null);
    await saveUserData({ dogs: rem, activeDogId: newActiveId });
  }

  // ── Registrations — status + paid ────────────────────────────
  // dogRegs[dogId][trialId] = { status: "none"|"waitlist"|"entered", paid: bool }
  async function setTrialStatus(trialId, status) {
    if (!activeDog) return;
    const current = dogRegs[trialId] || { status:"none", paid:false };
    const updated = { ...current, status };
    const newRegs = { ...registrations, [activeDog.id]: { ...(registrations[activeDog.id]||{}), [trialId]: updated }};
    setRegistrations(newRegs);
    await saveUserData({ registrations: newRegs });
  }
  async function togglePaid(trialId) {
    if (!activeDog) return;
    const current = dogRegs[trialId] || { status:"none", paid:false };
    const updated = { ...current, paid: !current.paid };
    const newRegs = { ...registrations, [activeDog.id]: { ...(registrations[activeDog.id]||{}), [trialId]: updated }};
    setRegistrations(newRegs);
    await saveUserData({ registrations: newRegs });
  }
  const dogRegs = activeDog ? (registrations[activeDog.id] || {}) : {};
  const getStatus = (trialId) => dogRegs[trialId]?.status || "none";
  const getPaid   = (trialId) => dogRegs[trialId]?.paid || false;

  // ── Results ──────────────────────────────────────────────────
  async function addResult(e) {
    e.preventDefault();
    if (!activeDog) return;
    let photoUrl = "";
    if (resultPhotoFile) {
      try {
        const storageRef = ref(storage, `ribbons/${user.uid}/${Date.now()}`);
        await uploadBytes(storageRef, resultPhotoFile);
        photoUrl = await getDownloadURL(storageRef);
      } catch (err) { console.error("Ribbon photo error:", err); }
    }
    const newResult = { ...resultForm, id: Date.now().toString(), photoUrl };
    const newResults = { ...allResults, [activeDog.id]: [...(allResults[activeDog.id]||[]), newResult] };
    setAllResults(newResults); setShowResultForm(false); setResultPhotoFile(null);
    setResultForm({ org:"NACSW", trial:"", date:"", level:"", result:"Pass", title:"", notes:"", videoLink:"" });
    await saveUserData({ results: newResults });
  }
  const myResults = activeDog ? (allResults[activeDog.id] || []) : [];

  // ── Manual title entry ───────────────────────────────────────
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
    const newResults = { ...allResults, [activeDog.id]: [...(allResults[activeDog.id]||[]), newResult] };
    setAllResults(newResults);
    setShowTitleForm(false);
    setTitleForm({ org:"NACSW", title:"", trial:"", date:"" });
    await saveUserData({ results: newResults });
  }

  // ── Training ─────────────────────────────────────────────────
  const myTraining = activeDog ? (allTraining[activeDog.id] || []) : [];
  const blankTrainingForm = () => ({ date: new Date().toISOString().slice(0,10), time:"", type:"Class", location:"", notes:"", rating:"👍 Great", videoLink:"", runs:[] });
  const blankRunForm = () => ({ odors:[], hideType:"Blind", elements:[], blindOutcome:"", notes:"" });

  function toggleMulti(arr, val) { return arr.includes(val) ? arr.filter(x=>x!==val) : [...arr, val]; }

  function saveRun(e) {
    e.preventDefault();
    if (!runForm.odors.length) return alert("Please select at least one odor.");
    if (!runForm.elements.length) return alert("Please select at least one search element.");
    if (editingRunIdx !== null) {
      const runs = trainingForm.runs.map((r,i) => i===editingRunIdx ? {...runForm} : r);
      setTrainingForm({...trainingForm, runs});
      setEditingRunIdx(null);
    } else {
      setTrainingForm({...trainingForm, runs:[...trainingForm.runs, {...runForm}]});
    }
    setRunForm(blankRunForm());
    setShowRunForm(false);
  }

  function deleteRun(idx) {
    setTrainingForm({...trainingForm, runs: trainingForm.runs.filter((_,i)=>i!==idx)});
  }

  async function addTrainingEntry(e) {
    e.preventDefault();
    if (!activeDog) return;
    if (editingTrainingId) {
      const newTraining = { ...allTraining, [activeDog.id]: (allTraining[activeDog.id]||[]).map(t => t.id===editingTrainingId ? {...trainingForm, id:editingTrainingId} : t) };
      setAllTraining(newTraining);
      setEditingTrainingId(null);
      await saveUserData({ training: newTraining });
    } else {
      const entry = { ...trainingForm, id: Date.now().toString() };
      const newTraining = { ...allTraining, [activeDog.id]: [entry, ...(allTraining[activeDog.id]||[])] };
      setAllTraining(newTraining);
      await saveUserData({ training: newTraining });
    }
    setShowTrainingForm(false);
    setTrainingForm(blankTrainingForm());
    setRunForm(blankRunForm());
    setShowRunForm(false);
    setEditingRunIdx(null);
  }

  async function deleteTrainingEntry(entryId) {
    if (!activeDog) return;
    const newTraining = { ...allTraining, [activeDog.id]: (allTraining[activeDog.id]||[]).filter(e=>e.id!==entryId) };
    setAllTraining(newTraining);
    await saveUserData({ training: newTraining });
  }

  function startEditTraining(entry) {
    setTrainingForm({ ...entry, runs: entry.runs||[] });
    setEditingTrainingId(entry.id);
    setShowTrainingForm(true);
    setShowRunForm(false);
    setEditingRunIdx(null);
    window.scrollTo(0, 0);
  }
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
    MASTER_TRIALS.forEach(t => batch.set(doc(db, "trials", t.id), t));
    await batch.commit();
    alert(`✅ ${MASTER_TRIALS.length} trials uploaded!`);
  }
  async function saveAdminTrial(e) {
    e.preventDefault();
    const id = editingTrialId || `t_${Date.now()}`;
    await setDoc(doc(db, "trials", id), { ...trialForm, id });
    setTrialForm({ org:"NACSW", name:"", date:"", location:"", level:"", entryDeadline:"", entryLink:"", notes:"" });
    setEditingTrialId(null); setAdminTab("list");
    alert("✅ Saved! Everyone's app will update automatically.");
  }
  async function deleteTrial(id) {
    if (window.confirm("Delete this trial for everyone?")) await deleteDoc(doc(db, "trials", id));
  }

  // ── Derived ──────────────────────────────────────────────────
  const upcoming     = trials.filter(t => new Date(t.date) >= today);
  const deadlineSoon = trials.filter(t => { const d=(new Date(t.entryDeadline)-today)/86400000; return d>=0&&d<=14&&getStatus(t.id)==="none"; });
  const opensSoon    = trials.filter(t => { const d=(new Date(t.entryOpens)-today)/86400000; return d>=0&&d<=7&&getStatus(t.id)==="none"; });
  const titlesEarned = myResults.filter(r=>r.title).map(r=>({org:r.org,title:r.title,date:r.date,trial:r.trial}));
  const trialsByView = trialView==="past" ? trials.filter(t=>new Date(t.date)<today) : trials.filter(t=>new Date(t.date)>=today);
  const filtered = filterOrg === "All" ? trialsByView
    : filterOrg === "Entered" ? trialsByView.filter(t => getStatus(t.id)==="entered" || getStatus(t.id)==="waitlist")
    : trialsByView.filter(t => t.org === filterOrg);
  const daysUntil = d => { const n=Math.ceil((new Date(d)-today)/86400000); return n<0?"Passed":n===0?"Today!":n===1?"Tomorrow":`${n} days`; };
  const openMaps = (location) => {
    const encoded = encodeURIComponent(location);
    window.open(`https://maps.google.com/?q=${encoded}`, "_blank");
  };

  // ════════════════════════════════════════════════════════════
  // AUTH LOADING
  // ════════════════════════════════════════════════════════════
  if (authLoading) return (
    <div style={{ fontFamily:"Georgia,serif", background:"linear-gradient(135deg,#6b21a8,#7c3aed,#06b6d4)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#fff", fontSize:16 }}>🐾 Loading...</div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // AUTH SCREENS
  // ════════════════════════════════════════════════════════════
  if (!user) return (
    <div style={{ fontFamily:"Georgia,serif", background:"linear-gradient(135deg,#6b21a8,#7c3aed,#06b6d4)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#fff", borderRadius:20, padding:28, maxWidth:400, width:"100%", boxShadow:"0 8px 32px rgba(0,0,0,0.2)" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:48 }}>🐾</div>
          <div style={{ fontSize:22, fontWeight:"bold", color:"#5b21b6" }}>NoseWork Notebook</div>
          <div style={{ fontSize:13, color:"#888", marginTop:4 }}>Puppy Love · College Station, TX</div>
        </div>

        {authMode === "login" && (
          <form onSubmit={handleLogin}>
            <div style={formTitle}>{authLogging ? "Signing in..." : "Welcome back!"}</div>
            <label style={labelStyle}>Email</label>
            <input required type="email" style={inputStyle} placeholder="your@email.com" value={authForm.email} onChange={e=>setAuthForm({...authForm,email:e.target.value})} />
            <label style={labelStyle}>Password</label>
            <input required type="password" style={inputStyle} placeholder="••••••••" value={authForm.password} onChange={e=>setAuthForm({...authForm,password:e.target.value})} />
            {authError && <div style={{ fontSize:12, color: authError.startsWith("✅") ? "#27ae60" : "#c0392b", marginTop:8, padding:"8px 10px", background: authError.startsWith("✅") ? "#e8f8ee" : "#ffeaea", borderRadius:8 }}>{authError}</div>}
            <button type="submit" disabled={authLogging} style={{ ...btnStyle("#7c3aed"), width:"100%", padding:12, marginTop:14, background:"linear-gradient(135deg,#7c3aed,#06b6d4)" }}>Sign In</button>
            <div style={{ textAlign:"center", marginTop:14, fontSize:13, color:"#888" }}>
              <span style={{ cursor:"pointer", color:"#7c3aed" }} onClick={()=>{setAuthMode("reset");setAuthError("");}}>Forgot password?</span>
              <span style={{ margin:"0 8px" }}>·</span>
              <span style={{ cursor:"pointer", color:"#7c3aed" }} onClick={()=>{setAuthMode("signup");setAuthError("");}}>Create account</span>
            </div>
          </form>
        )}

        {authMode === "signup" && (
          <form onSubmit={handleSignup}>
            <div style={formTitle}>Join the Puppy Love community!</div>
            <label style={labelStyle}>Your Name</label>
            <input required style={inputStyle} placeholder="First name" value={authForm.name} onChange={e=>setAuthForm({...authForm,name:e.target.value})} />
            <label style={labelStyle}>Email</label>
            <input required type="email" style={inputStyle} placeholder="your@email.com" value={authForm.email} onChange={e=>setAuthForm({...authForm,email:e.target.value})} />
            <label style={labelStyle}>Password</label>
            <input required type="password" style={inputStyle} placeholder="At least 6 characters" value={authForm.password} onChange={e=>setAuthForm({...authForm,password:e.target.value})} />
            {authError && <div style={{ fontSize:12, color:"#c0392b", marginTop:8, padding:"8px 10px", background:"#ffeaea", borderRadius:8 }}>{authError}</div>}
            <button type="submit" disabled={authLogging} style={{ ...btnStyle("#7c3aed"), width:"100%", padding:12, marginTop:14, background:"linear-gradient(135deg,#7c3aed,#06b6d4)" }}>{authLogging ? "Creating account..." : "Create Account"}</button>
            <div style={{ textAlign:"center", marginTop:14, fontSize:13, color:"#888" }}>
              Already have an account? <span style={{ cursor:"pointer", color:"#7c3aed" }} onClick={()=>{setAuthMode("login");setAuthError("");}}>Sign in</span>
            </div>
          </form>
        )}

        {authMode === "reset" && (
          <form onSubmit={handleReset}>
            <div style={formTitle}>Reset your password</div>
            <div style={{ fontSize:13, color:"#888", marginBottom:12 }}>Enter your email and we'll send you a reset link.</div>
            <label style={labelStyle}>Email</label>
            <input required type="email" style={inputStyle} placeholder="your@email.com" value={authForm.email} onChange={e=>setAuthForm({...authForm,email:e.target.value})} />
            {authError && <div style={{ fontSize:12, color: authError.startsWith("✅") ? "#27ae60" : "#c0392b", marginTop:8, padding:"8px 10px", background: authError.startsWith("✅") ? "#e8f8ee" : "#ffeaea", borderRadius:8 }}>{authError}</div>}
            <button type="submit" disabled={authLogging} style={{ ...btnStyle("#7c3aed"), width:"100%", padding:12, marginTop:14, background:"linear-gradient(135deg,#7c3aed,#06b6d4)" }}>{authLogging ? "Sending..." : "Send Reset Email"}</button>
            <div style={{ textAlign:"center", marginTop:14, fontSize:13 }}>
              <span style={{ cursor:"pointer", color:"#7c3aed" }} onClick={()=>{setAuthMode("login");setAuthError("");}}>← Back to sign in</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // ONBOARDING — first dog setup
  // ════════════════════════════════════════════════════════════
  if (user && dataLoaded && dogs.length === 0) return (
    <div style={{ fontFamily:"Georgia,serif", background:"linear-gradient(135deg,#6b21a8,#7c3aed,#06b6d4)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#fff", borderRadius:20, padding:28, maxWidth:420, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:48 }}>🐾</div>
          <div style={{ fontSize:20, fontWeight:"bold", color:"#5b21b6" }}>Welcome{user.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}!</div>
          <div style={{ fontSize:13, color:"#888", marginTop:4 }}>Let's set up your first dog</div>
        </div>

        {onboardStep === 0 && (
          <div>
            <label style={labelStyle}>Call Name *</label>
            <input style={inputStyle} placeholder="e.g. Catie" value={onboardDog.callName} onChange={e=>setOnboardDog({...onboardDog,callName:e.target.value})} />
            <label style={labelStyle}>Registered Name</label>
            <input style={inputStyle} placeholder="Full registered name" value={onboardDog.name} onChange={e=>setOnboardDog({...onboardDog,name:e.target.value})} />
            <label style={labelStyle}>Breed</label>
            <input style={inputStyle} placeholder="e.g. Border Collie Mix" value={onboardDog.breed} onChange={e=>setOnboardDog({...onboardDog,breed:e.target.value})} />
            <label style={labelStyle}>Date of Birth</label>
            <input type="date" style={inputStyle} value={onboardDog.dob} onChange={e=>setOnboardDog({...onboardDog,dob:e.target.value})} />
            <button onClick={()=>setOnboardStep(1)} disabled={!onboardDog.callName} style={{ ...btnStyle("#7c3aed"), width:"100%", padding:12, marginTop:16, background:"linear-gradient(135deg,#7c3aed,#06b6d4)" }}>Next → Org IDs</button>
          </div>
        )}

        {onboardStep === 1 && (
          <div>
            <div style={{ fontWeight:"bold", fontSize:14, color:"#5b21b6", marginBottom:4 }}>Organization IDs</div>
            <div style={{ fontSize:12, color:"#888", marginBottom:12 }}>Add whichever ones apply — all optional</div>
            {ORG_IDS.map(({org,key,label,placeholder}) => (
              <div key={key}>
                <label style={{ ...labelStyle, display:"flex", alignItems:"center", gap:6 }}><OrgBadge org={org} size={10}/> {label}</label>
                <input style={inputStyle} placeholder={placeholder} value={onboardDog[key]} onChange={e=>setOnboardDog({...onboardDog,[key]:e.target.value})} />
              </div>
            ))}
            <button onClick={finishOnboarding} style={{ ...btnStyle("#7c3aed"), width:"100%", padding:12, marginTop:18, background:"linear-gradient(135deg,#7c3aed,#06b6d4)" }}>Let's Go! 🐾</button>
            <button onClick={()=>setOnboardStep(0)} style={{ ...btnStyle("#aaa",true), width:"100%", marginTop:8, padding:8, fontSize:13 }}>← Back</button>
          </div>
        )}
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // ADMIN PANEL
  // ════════════════════════════════════════════════════════════
  if (showAdmin) return (
    <div style={{ fontFamily:"Georgia,serif", background:"#f5f3ff", minHeight:"100vh" }}>
      <div style={{ background:"linear-gradient(135deg,#6b21a8,#7c3aed,#06b6d4)", padding:"14px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ color:"#fff", fontWeight:"bold" }}>🔐 Admin Panel</div>
        <button onClick={()=>{setShowAdmin(false);setAdminUnlocked(false);setAdminPin("");}} style={{ ...btnStyle("#fff",true), color:"#fff", borderColor:"rgba(255,255,255,0.5)", padding:"5px 12px", fontSize:12 }}>← Back</button>
      </div>
      <div style={{ padding:18, maxWidth:700, margin:"0 auto" }}>
        {!adminUnlocked ? (
          <div style={formStyle}>
            <div style={formTitle}>🔒 Admin PIN</div>
            <input type="password" style={inputStyle} placeholder="PIN" value={adminPin} onChange={e=>setAdminPin(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&(adminPin===ADMIN_PIN?setAdminUnlocked(true):alert("Wrong PIN"))} />
            <button onClick={()=>adminPin===ADMIN_PIN?setAdminUnlocked(true):alert("Wrong PIN")} style={{ ...btnStyle("#7c3aed"), marginTop:10 }}>Unlock</button>
          </div>
        ) : (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
              {[["list","📋 All Trials"],["add","➕ Add Trial"],["seed","🚀 Seed DB"]].map(([t,l]) => (
                <button key={t} onClick={()=>{setAdminTab(t);if(t!=="add"){setEditingTrialId(null);setTrialForm({org:"NACSW",name:"",date:"",location:"",level:"",entryOpens:"",entryDeadline:"",entryLink:"",notes:"",adminNotes:"",needsInfo:false});}}}
                  style={{ ...btnStyle(adminTab===t?"#7c3aed":"#aaa"), padding:"6px 14px", fontSize:13, ...(adminTab===t?{background:"linear-gradient(135deg,#7c3aed,#06b6d4)"}:{}) }}>{l}</button>
              ))}
            </div>
            {(adminTab==="add"||editingTrialId) && (
              <form onSubmit={saveAdminTrial} style={formStyle}>
                <div style={formTitle}>{editingTrialId?"✏️ Edit Trial":"➕ New Trial"}</div>

                {/* Needs Info flag */}
                <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", background: trialForm.needsInfo?"#fff8e1":"#f5f3ff", borderRadius:8, padding:"8px 12px", marginBottom:8, border:`1px solid ${trialForm.needsInfo?"#f59e0b":"#e9d5ff"}` }}>
                  <input type="checkbox" checked={trialForm.needsInfo||false} onChange={e=>setTrialForm({...trialForm,needsInfo:e.target.checked})} style={{ width:16, height:16 }}/>
                  <span style={{ fontSize:13, color: trialForm.needsInfo?"#b45309":"#5b21b6", fontWeight:"bold" }}>⚠️ Needs more info — flag for follow-up</span>
                </label>

                <label style={labelStyle}>Organization</label>
                <select style={inputStyle} value={trialForm.org} onChange={e=>setTrialForm({...trialForm,org:e.target.value})}>{ORGS.map(o=><option key={o}>{o}</option>)}</select>
                <label style={labelStyle}>Trial Name *</label>
                <input required style={inputStyle} value={trialForm.name} onChange={e=>setTrialForm({...trialForm,name:e.target.value})} placeholder="Full name & host club" />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div><label style={labelStyle}>Trial Date *</label><input required type="date" style={inputStyle} value={trialForm.date} onChange={e=>setTrialForm({...trialForm,date:e.target.value})} /></div>
                  <div><label style={labelStyle}>Entry Deadline</label><input type="date" style={inputStyle} value={trialForm.entryDeadline} onChange={e=>setTrialForm({...trialForm,entryDeadline:e.target.value})} /></div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div><label style={labelStyle}>Entry Opens</label><input type="date" style={inputStyle} value={trialForm.entryOpens||""} onChange={e=>setTrialForm({...trialForm,entryOpens:e.target.value})} /></div>
                  <div><label style={labelStyle}>Level / Classes</label><input style={inputStyle} value={trialForm.level} onChange={e=>setTrialForm({...trialForm,level:e.target.value})} placeholder="e.g. NW1/NW2, Novice A" /></div>
                </div>
                <label style={labelStyle}>Location</label>
                <input style={inputStyle} value={trialForm.location} onChange={e=>setTrialForm({...trialForm,location:e.target.value})} placeholder="Venue, City, TX" />
                <label style={labelStyle}>Entry Link (URL)</label>
                <input style={inputStyle} value={trialForm.entryLink||""} onChange={e=>setTrialForm({...trialForm,entryLink:e.target.value})} placeholder="https://secreterrier.com/events/..." />
                <label style={labelStyle}>Public Notes <span style={{ color:"#aaa", fontWeight:"normal" }}>(everyone sees this)</span></label>
                <textarea style={{...inputStyle,height:56}} value={trialForm.notes} onChange={e=>setTrialForm({...trialForm,notes:e.target.value})} placeholder="Contact email, special info, full/waitlist status…" />
                <label style={labelStyle}>🔒 Admin Notes <span style={{ color:"#aaa", fontWeight:"normal" }}>(only you see this)</span></label>
                <textarea style={{...inputStyle,height:56, background:"#fffbeb", border:"1px solid #fde68a"}} value={trialForm.adminNotes||""} onChange={e=>setTrialForm({...trialForm,adminNotes:e.target.value})} placeholder="e.g. 'Check NACSW site in August for premium' or 'Email Deb for entry link'" />
                <div style={{ display:"flex", gap:8, marginTop:12 }}>
                  <button type="submit" style={{ ...btnStyle("#7c3aed"), background:"linear-gradient(135deg,#7c3aed,#06b6d4)" }}>💾 Save for Everyone</button>
                  {editingTrialId&&<button type="button" onClick={()=>{setEditingTrialId(null);setAdminTab("list");}} style={btnStyle("#aaa")}>Cancel</button>}
                </div>
              </form>
            )}
            {adminTab==="seed"&&!editingTrialId&&(
              <div style={formStyle}>
                <div style={formTitle}>🚀 Seed Database</div>
                <p style={{ fontSize:13, color:"#666" }}>Run once when first setting up. Uploads all {MASTER_TRIALS.length} trials.</p>
                <button onClick={seedTrials} style={{ ...btnStyle("#c0392b"), marginTop:8 }}>Upload {MASTER_TRIALS.length} Trials to Firebase</button>
              </div>
            )}
            {adminTab==="list"&&!editingTrialId&&(
              <div>
                {/* Filter bar */}
                <div style={{ marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <div style={{ fontWeight:"bold", fontSize:14, color:"#5b21b6" }}>All Trials ({trials.length})</div>
                    <button onClick={()=>setAdminFilter("needsinfo")} style={{ background:adminFilter==="needsinfo"?"#f59e0b":"#fff8e1", color:adminFilter==="needsinfo"?"#fff":"#b45309", border:"1px solid #fcd34d", borderRadius:20, padding:"3px 12px", fontSize:12, cursor:"pointer", fontWeight:"bold" }}>
                      ⚠️ Needs Info ({trials.filter(t=>t.needsInfo).length})
                    </button>
                  </div>
                  {/* Org filters */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {["all","NACSW","UKC","AKC","USCSS/Other"].map(o=>(
                      <button key={o} onClick={()=>setAdminFilter(o)} style={{
                        background: adminFilter===o ? "linear-gradient(135deg,#7c3aed,#06b6d4)" : ORG_BG[o]||"#ede9fe",
                        color: adminFilter===o ? "#fff" : ORG_COLORS[o]||"#7c3aed",
                        border: "none", borderRadius:20, padding:"3px 12px", fontSize:12, cursor:"pointer", fontWeight: adminFilter===o?"bold":"normal"
                      }}>
                        {o==="all"?"All":o}
                        {o!=="all"&&<span style={{ marginLeft:4, opacity:0.7 }}>({trials.filter(t=>t.org===o).length})</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {(adminFilter==="needsinfo" ? trials.filter(t=>t.needsInfo) 
                  : adminFilter==="all" ? trials
                  : trials.filter(t=>t.org===adminFilter)
                ).map(t => (
                  <div key={t.id} style={{ background: t.needsInfo?"#fffbeb":ORG_BG[t.org]||"#fff", borderLeft:`4px solid ${t.needsInfo?"#f59e0b":ORG_COLORS[t.org]}`, borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div style={{ flex:1, marginRight:8 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          {t.needsInfo&&<span style={{ fontSize:10, background:"#fef3c7", color:"#b45309", borderRadius:10, padding:"1px 6px", fontWeight:"bold" }}>⚠️ NEEDS INFO</span>}
                          <div style={{ fontSize:13, fontWeight:"bold" }}>{t.name}</div>
                        </div>
                        <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{t.date} · {t.location||"📍 Location TBD"}</div>
                        {!t.entryLink&&<div style={{ fontSize:11, color:"#f59e0b", marginTop:2 }}>⚠️ No entry link yet</div>}
                        {!t.entryDeadline&&<div style={{ fontSize:11, color:"#f59e0b", marginTop:1 }}>⚠️ No deadline set</div>}
                        {!t.entryOpens&&<div style={{ fontSize:11, color:"#f59e0b", marginTop:1 }}>⚠️ No entry open date set</div>}
                        {t.adminNotes&&<div style={{ fontSize:11, color:"#b45309", background:"#fffbeb", borderRadius:6, padding:"3px 8px", marginTop:4 }}>🔒 {t.adminNotes}</div>}

                        {/* Quick edit inline */}
                        {quickEditId===t.id ? (
                          <div style={{ marginTop:6 }}>
                            <div style={{ display:"flex", gap:4, marginBottom:6 }}>
                              <button onClick={()=>setQuickEditMode("link")} style={{ fontSize:10, background:quickEditMode==="link"?"#7c3aed":"#ede9fe", color:quickEditMode==="link"?"#fff":"#7c3aed", border:"none", borderRadius:20, padding:"2px 8px", cursor:"pointer" }}>🔗 Entry Link</button>
                              <button onClick={()=>setQuickEditMode("location")} style={{ fontSize:10, background:quickEditMode==="location"?"#7c3aed":"#ede9fe", color:quickEditMode==="location"?"#fff":"#7c3aed", border:"none", borderRadius:20, padding:"2px 8px", cursor:"pointer" }}>📍 Location</button>
                            </div>
                            {quickEditMode==="link" ? (
                              <div style={{ display:"flex", gap:6 }}>
                                <input style={{...inputStyle, fontSize:11, marginBottom:0, flex:1}} placeholder="Paste entry URL…" value={quickEditLink} onChange={e=>setQuickEditLink(e.target.value)} autoFocus/>
                                <button onClick={async()=>{ await setDoc(doc(db,"trials",t.id),{...t,entryLink:quickEditLink},{merge:true}); setQuickEditId(null); setQuickEditLink(""); }} style={{ ...btnStyle("#27ae60"), padding:"4px 10px", fontSize:11 }}>Save</button>
                                <button onClick={()=>{setQuickEditId(null);setQuickEditLink("");}} style={{ ...btnStyle("#aaa"), padding:"4px 8px", fontSize:11 }}>✕</button>
                              </div>
                            ) : (
                              <div style={{ display:"flex", gap:6 }}>
                                <input style={{...inputStyle, fontSize:11, marginBottom:0, flex:1}} placeholder="Venue, City, TX..." value={quickEditLocation} onChange={e=>setQuickEditLocation(e.target.value)} autoFocus/>
                                <button onClick={async()=>{ await setDoc(doc(db,"trials",t.id),{...t,location:quickEditLocation},{merge:true}); setQuickEditId(null); setQuickEditLocation(""); }} style={{ ...btnStyle("#27ae60"), padding:"4px 10px", fontSize:11 }}>Save</button>
                                <button onClick={()=>{setQuickEditId(null);setQuickEditLocation("");}} style={{ ...btnStyle("#aaa"), padding:"4px 8px", fontSize:11 }}>✕</button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ display:"flex", gap:8, marginTop:4, flexWrap:"wrap" }}>
                            {!t.entryLink && <button onClick={()=>{setQuickEditId(t.id);setQuickEditMode("link");setQuickEditLink("");}} style={{ fontSize:11, color:"#7c3aed", background:"none", border:"none", cursor:"pointer", padding:0, textDecoration:"underline" }}>+ Add entry link</button>}
                            <button onClick={()=>{setQuickEditId(t.id);setQuickEditMode("location");setQuickEditLocation(t.location||"");}} style={{ fontSize:11, color:"#7c3aed", background:"none", border:"none", cursor:"pointer", padding:0, textDecoration:"underline" }}>📍 Update location</button>
                          </div>
                        )}
                      </div>
                      <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                        <button onClick={()=>{setEditingTrialId(t.id);setTrialForm({...t,adminNotes:t.adminNotes||"",needsInfo:t.needsInfo||false,entryLink:t.entryLink||""});setAdminTab("add");window.scrollTo(0,0);}} style={{ ...btnStyle("#3a7bd5",true), padding:"3px 10px", fontSize:11 }}>Edit</button>
                        <button onClick={()=>deleteTrial(t.id)} style={{ ...btnStyle("#c0392b",true), padding:"3px 10px", fontSize:11 }}>Del</button>
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
  // MAIN APP
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily:"Georgia,serif", background:"#f5f3ff", minHeight:"100vh", color:"#1e1b4b" }}>
      <div style={{ background:"linear-gradient(135deg,#6b21a8,#7c3aed,#06b6d4)", padding:"14px 18px 0", boxShadow:"0 4px 20px rgba(0,0,0,0.2)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {activeDog&&photos[activeDog.id]
              ? <img src={photos[activeDog.id]} alt="" style={{ width:36,height:36,borderRadius:18,objectFit:"cover",border:"2px solid rgba(255,255,255,0.5)" }} />
              : <div style={{ fontSize:28 }}>🐾</div>
            }
            <div>
              <div style={{ color:"#fff", fontSize:17, fontWeight:"bold" }}>NoseWork Notebook</div>
              <div style={{ color:"rgba(255,255,255,0.75)", fontSize:11 }}>
                {activeDog?.callName || "Set up your dog"} · {user.displayName?.split(" ")[0] || ""}
                {dogs.length>1&&<span style={{ opacity:0.7 }}> · {dogs.length} dogs</span>}
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button onClick={()=>setShowAdmin(true)} style={{ background:"transparent", border:"none", color:"rgba(255,255,255,0.75)", fontSize:20, cursor:"pointer", padding:4 }}>⚙️</button>
            <button onClick={handleLogout} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", borderRadius:8, padding:"4px 10px", fontSize:11, cursor:"pointer" }}>Sign out</button>
          </div>
        </div>
        <div style={{ display:"flex", gap:2, overflowX:"auto" }}>
          {TABS.map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{ background:tab===t?"rgba(255,255,255,0.25)":"transparent", color:tab===t?"#fff":"rgba(255,255,255,0.7)", border:"none", borderRadius:"8px 8px 0 0", padding:"7px 10px", fontSize:11, fontWeight:tab===t?"bold":"normal", cursor:"pointer", whiteSpace:"nowrap" }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:"16px 14px", maxWidth:700, margin:"0 auto" }}>

        {/* DASHBOARD */}
        {tab==="Dashboard" && (
          <div>
            {opensSoon.length>0&&(
              <div style={{ background:"#eff6ff", border:"1px solid #93c5fd", borderRadius:10, padding:"12px 16px", marginBottom:12 }}>
                <div style={{ fontWeight:"bold", color:"#1d4ed8", marginBottom:6 }}>🔔 Entries Opening Soon</div>
                {opensSoon.map(t=>(
                  <div key={t.id} style={{ fontSize:13, color:"#1e40af", display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span>{t.name.split("–")[0].trim()} <OrgBadge org={t.org}/></span>
                    <b>{daysUntil(t.entryOpens)}</b>
                  </div>
                ))}
              </div>
            )}
            {deadlineSoon.length>0&&(
              <div style={{ background:"#fef9c3", border:"1px solid #fde047", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
                <div style={{ fontWeight:"bold", color:"#713f12", marginBottom:6 }}>⚠️ Entry Deadlines Soon</div>
                {deadlineSoon.map(t=>(
                  <div key={t.id} style={{ fontSize:13, color:"#854d0e", display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span>{t.name.split("–")[0].trim()} <OrgBadge org={t.org}/></span>
                    <b>{daysUntil(t.entryDeadline)}</b>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:18 }}>
              <StatCard label="Entered" value={Object.values(dogRegs).filter(v=>v?.status==="entered").length} icon="📋"/>
              <StatCard label="Titles" value={titlesEarned.length} icon="🏆"/>
              <StatCard label="Upcoming" value={upcoming.length} icon="📅"/>
            </div>
            {upcoming[0]&&(
              <div style={{ background:ORG_BG[upcoming[0].org]||"#fff", borderRadius:12, padding:16, marginBottom:16, borderLeft:`5px solid ${ORG_COLORS[upcoming[0].org]}`, boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize:10, color:"#999", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Next Trial</div>
                <div style={{ fontWeight:"bold", fontSize:15 }}>{upcoming[0].name}</div>
                <div style={{ fontSize:13, color:"#666", marginTop:5, display:"flex", gap:10, flexWrap:"wrap" }}>
                  <span>📅 {upcoming[0].date}</span>
                  <span>📍 {upcoming[0].location}</span>
                  <span style={{ color: getStatus(upcoming[0].id)==="entered"?"#27ae60": getStatus(upcoming[0].id)==="waitlist"?"#f59e0b":"#e07b39", fontWeight:"bold" }}>
                    {getStatus(upcoming[0].id)==="entered"?"✓ Entered": getStatus(upcoming[0].id)==="waitlist"?"⏳ Waitlist":"Not Entered"}
                  </span>
                </div>
              </div>
            )}
            {trialsLoading&&<div style={{ textAlign:"center", color:"#bbb", fontSize:13, padding:16 }}>Syncing calendar…</div>}
            <div style={{ fontWeight:"bold", fontSize:14, marginBottom:10, color:"#5b21b6" }}>Recent Results — {activeDog?.callName}</div>
            {myResults.length===0
              ? <div style={{ color:"#bbb", fontSize:13 }}>No results yet — go sniff some stuff! 🐾</div>
              : myResults.slice(-3).reverse().map(r=><ResultRow key={r.id} r={r}/>)
            }
          </div>
        )}

        {/* TRIALS */}
        {tab==="Trials" && (
          <div>
            {/* Past / Upcoming toggle */}
            <div style={{ display:"flex", gap:6, marginBottom:12 }}>
              <button onClick={()=>setTrialView("upcoming")} style={{ background:trialView==="upcoming"?"linear-gradient(135deg,#7c3aed,#06b6d4)":"#ede9fe", color:trialView==="upcoming"?"#fff":"#7c3aed", border:"none", borderRadius:20, padding:"5px 16px", fontSize:12, cursor:"pointer", fontWeight:"bold" }}>
                📅 Upcoming ({trials.filter(t=>new Date(t.date)>=today).length})
              </button>
              <button onClick={()=>setTrialView("past")} style={{ background:trialView==="past"?"linear-gradient(135deg,#7c3aed,#06b6d4)":"#ede9fe", color:trialView==="past"?"#fff":"#7c3aed", border:"none", borderRadius:20, padding:"5px 16px", fontSize:12, cursor:"pointer", fontWeight:"bold" }}>
                🏁 Past ({trials.filter(t=>new Date(t.date)<today).length})
              </button>
            </div>
            <OrgFilter value={filterOrg} onChange={setFilterOrg} dogRegs={dogRegs}/>
            <div style={{ fontSize:11, color:"#bbb", margin:"6px 0 12px", textAlign:"right" }}>{trialsLoading?"⏳ Syncing…":`${filtered.length} trials · live calendar`}</div>
            {filtered.map(t => {
              const status = getStatus(t.id);
              const paid   = getPaid(t.id);
              const isPast = new Date(t.date) < today;
              const entriesClosed = t.entryDeadline && new Date(t.entryDeadline) < today;
              const statusColors = {
                none:      { bg:"#f5f3ff", color:"#7c3aed", border:"#7c3aed" },
                waitlist:  { bg:"#fff8e1", color:"#f59e0b", border:"#f59e0b" },
                entered:   { bg:"#e8f8ee", color:"#27ae60", border:"#27ae60" },
              };
              const sc = statusColors[status];
              return (
                <div key={t.id} style={{ background: isPast?"#f8f8f8":ORG_BG[t.org]||"#fff", borderRadius:12, padding:14, marginBottom:10, borderLeft:`5px solid ${isPast?"#ccc":ORG_COLORS[t.org]}`, boxShadow:"0 1px 6px rgba(0,0,0,0.05)", opacity: isPast?0.85:1 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ flex:1, marginRight:8 }}>
                      <div style={{ fontWeight:"bold", fontSize:14, color: isPast?"#888":"#1e1b4b" }}>{t.name}</div>
                      <div style={{ fontSize:11, color:"#888", marginTop:2 }}><OrgBadge org={t.org}/> · {t.level}</div>
                      <div style={{ fontSize:12, color:"#555", marginTop:5 }}>
                        📅 <b>{t.date}</b> ·{" "}
                        <span onClick={()=>openMaps(t.location)} style={{ color:"#7c3aed", cursor:"pointer", textDecoration:"underline" }}>
                          📍 {t.location}
                        </span>
                      </div>
                      {t.entryDeadline&&<div style={{ fontSize:11, color:entriesClosed?"#bbb":"#e07b39", marginTop:3 }}>
                        📌 {entriesClosed?"Entries closed":"Deadline:"} {t.entryDeadline}{!entriesClosed&&` · ${daysUntil(t.entryDeadline)}`}
                      </div>}
                      {t.entryOpens&&!isPast&&!entriesClosed&&<div style={{ fontSize:11, color: new Date(t.entryOpens)<=today?"#27ae60":"#3a7bd5", marginTop:2, fontWeight: new Date(t.entryOpens)<=today?"bold":"normal" }}>
                        {new Date(t.entryOpens)<=today ? "🟢 Entries Open!" : `🔔 Opens: ${t.entryOpens} · ${daysUntil(t.entryOpens)}`}
                      </div>}
                      {entriesClosed&&!isPast&&<div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>🔴 Entries Closed</div>}
                      {/* Enter Now — only show if entries are open and not yet closed */}
                      {status==="none" && t.entryLink && !entriesClosed && !isPast && (
                        <button onClick={()=>window.open(t.entryLink,"_blank")} style={{
                          background:"linear-gradient(135deg,#7c3aed,#06b6d4)", color:"#fff",
                          border:"none", borderRadius:20, padding:"5px 16px", fontSize:11,
                          cursor:"pointer", fontWeight:"bold", marginTop:6, display:"inline-block"
                        }}>
                          🔗 Enter Now →
                        </button>
                      )}
                      {t.notes&&<div style={{ fontSize:11, color:"#999", marginTop:4, fontStyle:"italic" }}>{t.notes}</div>}
                    </div>
                    {/* Status buttons — hide for past trials with no status */}
                    {(!isPast || status!=="none") && (
                      <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0, alignItems:"flex-end" }}>
                        {!isPast && <div style={{ display:"flex", gap:4 }}>
                          {["none","waitlist","entered"].map(s => (
                            <button key={s} onClick={()=>setTrialStatus(t.id, s)} style={{
                              background: status===s ? sc.bg : "#fff",
                              color: status===s ? sc.color : "#bbb",
                              border: `1px solid ${status===s ? sc.border : "#ddd"}`,
                              borderRadius:20, padding:"3px 8px", fontSize:10, cursor:"pointer", whiteSpace:"nowrap", fontWeight: status===s ? "bold" : "normal"
                            }}>
                              {s==="none"?"Not In":s==="waitlist"?"Waitlist":"Entered"}
                            </button>
                          ))}
                        </div>}
                        {isPast && status!=="none" && (
                          <span style={{ background:sc.bg, color:sc.color, border:`1px solid ${sc.border}`, borderRadius:20, padding:"3px 10px", fontSize:10, fontWeight:"bold" }}>
                            {status==="entered"?"✓ Attended":status==="waitlist"?"⏳ Waitlisted":""}
                          </span>
                        )}
                        {(status==="waitlist"||status==="entered") && (
                          <button onClick={()=>togglePaid(t.id)} style={{
                            background: paid ? "#e8f8ee" : "#ffeaea",
                            color: paid ? "#27ae60" : "#c0392b",
                            border: `1px solid ${paid?"#27ae60":"#ffaaaa"}`,
                            borderRadius:20, padding:"3px 10px", fontSize:10, cursor:"pointer", fontWeight:"bold"
                          }}>
                            {paid ? "💳 Paid ✓" : "💳 Unpaid"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length===0&&<div style={{ color:"#bbb", fontSize:13, textAlign:"center", marginTop:30 }}>No trials found! 🐾</div>}
          </div>
        )}

        {/* RESULTS */}
        {tab==="Results" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <OrgFilter value={filterOrg} onChange={setFilterOrg}/>
              <button onClick={()=>setShowResultForm(!showResultForm)} style={{ ...btnStyle("#7c3aed"), background:"linear-gradient(135deg,#7c3aed,#06b6d4)" }}>+ Add Result</button>
            </div>
            {showResultForm&&(
              <form onSubmit={addResult} style={formStyle}>
                <div style={formTitle}>Log Result — {activeDog?.callName}</div>
                <label style={labelStyle}>Organization</label>
                <select style={inputStyle} value={resultForm.org} onChange={e=>setResultForm({...resultForm,org:e.target.value})}>{ORGS.map(o=><option key={o}>{o}</option>)}</select>
                <label style={labelStyle}>Trial Name</label>
                <input required style={inputStyle} value={resultForm.trial} onChange={e=>setResultForm({...resultForm,trial:e.target.value})} placeholder="e.g. KCGV May Scent Work Trial" />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div><label style={labelStyle}>Date</label><input required type="date" style={inputStyle} value={resultForm.date} onChange={e=>setResultForm({...resultForm,date:e.target.value})}/></div>
                  <div><label style={labelStyle}>Level</label><input style={inputStyle} value={resultForm.level} onChange={e=>setResultForm({...resultForm,level:e.target.value})} placeholder="Novice A"/></div>
                </div>
                <label style={labelStyle}>Result</label>
                <select style={inputStyle} value={resultForm.result} onChange={e=>setResultForm({...resultForm,result:e.target.value})}>
                  <option>Pass</option><option>NCA</option><option>False Alert</option><option>DNF</option><option>Incomplete</option>
                </select>
                <label style={labelStyle}>Title Earned (if any)</label>
                <input style={inputStyle} value={resultForm.title} onChange={e=>setResultForm({...resultForm,title:e.target.value})} placeholder="e.g. NW1, SBN…" />
                <label style={labelStyle}>Notes</label>
                <textarea style={{...inputStyle,height:56}} value={resultForm.notes} onChange={e=>setResultForm({...resultForm,notes:e.target.value})} placeholder="How did it go?"/>
                <label style={labelStyle}>📸 Ribbon Photo (optional)</label>
                <div style={{ border:"1px dashed #ddd6fe", borderRadius:8, padding:10, background:"#faf5ff", marginBottom:4 }}>
                  {resultPhotoFile ? (
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <img src={URL.createObjectURL(resultPhotoFile)} alt="ribbon preview" style={{ width:60, height:60, objectFit:"cover", borderRadius:8 }}/>
                      <div>
                        <div style={{ fontSize:12, color:"#5b21b6", fontWeight:"bold" }}>{resultPhotoFile.name}</div>
                        <button type="button" onClick={()=>setResultPhotoFile(null)} style={{ fontSize:11, color:"#c0392b", background:"none", border:"none", cursor:"pointer", padding:0 }}>Remove</button>
                      </div>
                    </div>
                  ) : (
                    <label style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:8, fontSize:13, color:"#7c3aed" }}>
                      <span style={{ fontSize:20 }}>🎀</span> Tap to add ribbon photo
                      <input type="file" accept="image/*" style={{ display:"none" }} onChange={e=>setResultPhotoFile(e.target.files[0]||null)}/>
                    </label>
                  )}
                </div>
                <label style={labelStyle}>🎥 Run Video Link (optional)</label>
                <div style={{ background:"#f0fdf4", border:"1px dashed #86efac", borderRadius:8, padding:10, marginBottom:4 }}>
                  <div style={{ fontSize:11, color:"#16a34a", marginBottom:6 }}>Paste a Google Drive, YouTube, or any video link. Upload your video there first, then paste the link here.</div>
                  <input style={{...inputStyle, marginBottom:0}} value={resultForm.videoLink||""} onChange={e=>setResultForm({...resultForm,videoLink:e.target.value})} placeholder="https://drive.google.com/..." />
                </div>
                <div style={{ display:"flex", gap:8, marginTop:10 }}>
                  <button type="submit" style={{ ...btnStyle("#7c3aed"), background:"linear-gradient(135deg,#7c3aed,#06b6d4)" }}>Save</button>
                  <button type="button" onClick={()=>setShowResultForm(false)} style={btnStyle("#aaa")}>Cancel</button>
                </div>
              </form>
            )}
            {(filterOrg==="All"?myResults:myResults.filter(r=>r.org===filterOrg)).slice().reverse().map(r=>(
              <div key={r.id} style={{ background:ORG_BG[r.org]||"#fff", borderRadius:12, padding:14, marginBottom:10, borderLeft:`5px solid ${ORG_COLORS[r.org]}` }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <div><div style={{ fontWeight:"bold" }}>{r.trial}</div><div style={{ fontSize:12, color:"#888" }}><OrgBadge org={r.org}/> · {r.level} · {r.date}</div></div>
                  <div style={{ textAlign:"right" }}>
                    <span style={{ background:r.result==="Pass"?"#e8f8ee":"#ffeaea", color:r.result==="Pass"?"#27ae60":"#c0392b", borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:"bold" }}>{r.result}</span>
                    {r.title&&<div style={{ fontSize:11, color:"#e07b39", fontWeight:"bold", marginTop:4 }}>🏆 {r.title}</div>}
                  </div>
                </div>
                {r.notes&&<div style={{ fontSize:12, color:"#777", marginTop:6, fontStyle:"italic" }}>{r.notes}</div>}
                {r.photoUrl&&<img src={r.photoUrl} alt="ribbon" style={{ width:"100%", maxHeight:200, objectFit:"cover", borderRadius:8, marginTop:8 }}/>}
                {r.videoLink&&(
                  <button onClick={()=>window.open(r.videoLink,"_blank")} style={{ display:"flex", alignItems:"center", gap:6, background:"#f0fdf4", color:"#16a34a", border:"1px solid #86efac", borderRadius:8, padding:"6px 12px", fontSize:12, cursor:"pointer", marginTop:8, fontWeight:"bold" }}>
                    🎥 Watch Run Video →
                  </button>
                )}
              </div>
            ))}
            {myResults.length===0&&<div style={{ color:"#bbb", fontSize:13, textAlign:"center", marginTop:30 }}>No results logged yet!</div>}
          </div>
        )}

        {/* TITLES */}
        {tab==="Titles" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontWeight:"bold", fontSize:16, color:"#5b21b6" }}>🏆 {activeDog?.callName}'s Titles</div>
              <button onClick={()=>setShowTitleForm(!showTitleForm)} style={{ ...btnStyle("#7c3aed"), background:"linear-gradient(135deg,#7c3aed,#06b6d4)", fontSize:12, padding:"6px 14px" }}>+ Add Existing Title</button>
            </div>

            {showTitleForm && (
              <form onSubmit={addManualTitle} style={formStyle}>
                <div style={formTitle}>Add an Existing Title</div>
                <div style={{ fontSize:12, color:"#888", marginBottom:12 }}>Use this to enter titles your dog already earned before using this app.</div>
                <label style={labelStyle}>Organization</label>
                <select style={inputStyle} value={titleForm.org} onChange={e=>setTitleForm({...titleForm,org:e.target.value})}>
                  {ORGS.map(o=><option key={o}>{o}</option>)}
                </select>
                <label style={labelStyle}>Title *</label>
                <input required style={inputStyle} value={titleForm.title} onChange={e=>setTitleForm({...titleForm,title:e.target.value})} placeholder="e.g. NW1, SBN, L1C, NN…" />
                <label style={labelStyle}>Trial Name</label>
                <input style={inputStyle} value={titleForm.trial} onChange={e=>setTitleForm({...titleForm,trial:e.target.value})} placeholder="e.g. Spring NW1 Trial (optional)" />
                <label style={labelStyle}>Date Earned</label>
                <input type="date" style={inputStyle} value={titleForm.date} onChange={e=>setTitleForm({...titleForm,date:e.target.value})} />
                <div style={{ display:"flex", gap:8, marginTop:12 }}>
                  <button type="submit" style={{ ...btnStyle("#7c3aed"), background:"linear-gradient(135deg,#7c3aed,#06b6d4)" }}>Save Title</button>
                  <button type="button" onClick={()=>setShowTitleForm(false)} style={btnStyle("#aaa")}>Cancel</button>
                </div>
              </form>
            )}

            {ORGS.map(org=>{
              const orgTitles = titlesEarned.filter(t=>t.org===org);
              return (
                <div key={org} style={{ background:ORG_BG[org], borderRadius:12, padding:16, marginBottom:12, borderLeft:`5px solid ${ORG_COLORS[org]}` }}>
                  <div style={{ fontWeight:"bold", fontSize:14, marginBottom:8 }}><OrgBadge org={org} size={13}/> {org}</div>
                  {orgTitles.length===0
                    ? <div style={{ color:"#ccc", fontSize:13 }}>No titles yet — you've got this! 🐕</div>
                    : orgTitles.map((t,i)=>(
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, background:"rgba(255,255,255,0.6)", borderRadius:8, padding:"8px 12px" }}>
                          <span style={{ fontSize:20 }}>🏅</span>
                          <div>
                            <div style={{ fontWeight:"bold" }}>{t.title}</div>
                            <div style={{ fontSize:11, color:"#888" }}>
                              {t.trial}{t.trial && t.date ? " · " : ""}{t.date}
                              {t.trial==="Pre-app title" && !t.date ? <span style={{ color:"#bbb" }}> · manually entered</span> : ""}
                            </div>
                          </div>
                        </div>
                      ))
                  }
                </div>
              );
            })}
          </div>
        )}

        {/* MY DOGS */}
        {tab==="My Dogs" && (
          <div>
            {dogs.length>1&&(
              <div style={{ display:"flex", gap:8, marginBottom:16, overflowX:"auto", paddingBottom:4 }}>
                {dogs.map(d=>(
                  <button key={d.id} onClick={async()=>{ setActiveDogId(d.id); await saveUserData({activeDogId:d.id}); }} style={{ background:activeDogId===d.id?"linear-gradient(135deg,#7c3aed,#06b6d4)":"#ede9fe", color:activeDogId===d.id?"#fff":"#7c3aed", border:"none", borderRadius:20, padding:"6px 16px", fontSize:13, cursor:"pointer", whiteSpace:"nowrap", fontWeight:activeDogId===d.id?"bold":"normal" }}>
                    {d.callName||"Unnamed"}
                  </button>
                ))}
              </div>
            )}

            {activeDog&&(editingDogId===activeDog.id?(
              <form onSubmit={saveDog} style={formStyle}>
                <div style={formTitle}>Edit {dogForm.callName||"Dog"}</div>
                <label style={labelStyle}>Call Name *</label>
                <input required style={inputStyle} value={dogForm.callName||""} onChange={e=>setDogForm({...dogForm,callName:e.target.value})}/>
                <label style={labelStyle}>Registered Name</label>
                <input style={inputStyle} value={dogForm.name||""} onChange={e=>setDogForm({...dogForm,name:e.target.value})}/>
                <label style={labelStyle}>Breed</label>
                <input style={inputStyle} value={dogForm.breed||""} onChange={e=>setDogForm({...dogForm,breed:e.target.value})}/>
                <label style={labelStyle}>Date of Birth</label>
                <input type="date" style={inputStyle} value={dogForm.dob||""} onChange={e=>setDogForm({...dogForm,dob:e.target.value})}/>
                <div style={{ background:"#faf5ff", borderRadius:10, padding:"12px 14px", marginTop:14, border:"1px solid #e9d5ff" }}>
                  <div style={{ fontWeight:"bold", fontSize:13, color:"#5b21b6", marginBottom:10 }}>Organization IDs</div>
                  {ORG_IDS.map(({org,key,label,placeholder})=>(
                    <div key={key}>
                      <label style={{ ...labelStyle, display:"flex", alignItems:"center", gap:6 }}><OrgBadge org={org} size={10}/> {label}</label>
                      <input style={inputStyle} placeholder={placeholder} value={dogForm[key]||""} onChange={e=>setDogForm({...dogForm,[key]:e.target.value})}/>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:8, marginTop:14 }}>
                  <button type="submit" style={{ ...btnStyle("#7c3aed"), background:"linear-gradient(135deg,#7c3aed,#06b6d4)" }}>Save</button>
                  <button type="button" onClick={()=>setEditingDogId(null)} style={btnStyle("#aaa")}>Cancel</button>
                </div>
              </form>
            ):(
              <div style={{ background:"#fff", borderRadius:16, padding:20, boxShadow:"0 2px 12px rgba(0,0,0,0.08)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                  <div style={{ position:"relative" }}>
                    {photos[activeDog.id]
                      ? <img src={photos[activeDog.id]} alt="" style={{ width:88,height:88,borderRadius:44,objectFit:"cover",border:"3px solid #e9d5ff",boxShadow:"0 2px 8px rgba(0,0,0,0.12)" }}/>
                      : <div style={{ width:88,height:88,borderRadius:44,background:"linear-gradient(135deg,#ede9fe,#ddd6fe)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:38 }}>🐕</div>
                    }
                    <label style={{ position:"absolute",bottom:0,right:0,background:"linear-gradient(135deg,#7c3aed,#06b6d4)",borderRadius:20,padding:"3px 8px",fontSize:11,color:"#fff",cursor:"pointer" }}>
                      📷
                      <input type="file" accept="image/*" style={{ display:"none" }} onChange={e=>handlePhoto(activeDog.id, e.target.files[0])}/>
                    </label>
                  </div>
                  <button onClick={()=>{setEditingDogId(activeDog.id);setDogForm({...activeDog});}} style={btnStyle("#7c3aed",true)}>Edit</button>
                </div>
                <div style={{ fontSize:20, fontWeight:"bold", color:"#1e1b4b" }}>{activeDog.name||activeDog.callName}</div>
                {activeDog.name&&activeDog.callName&&<div style={{ color:"#888", fontSize:14, marginTop:2 }}>"{activeDog.callName}"</div>}
                {activeDog.breed&&<div style={{ color:"#777", fontSize:13, marginTop:2 }}>{activeDog.breed}</div>}
                {activeDog.dob&&<div style={{ fontSize:13, color:"#666", marginTop:4 }}>🎂 DOB: {activeDog.dob}</div>}
                <div style={{ marginTop:16, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {ORG_IDS.map(({org,key,label})=>{
                    const val = activeDog[key];
                    return (
                      <div key={key} style={{ background:ORG_BG[org], borderRadius:10, padding:"10px 12px", borderLeft:`3px solid ${ORG_COLORS[org]}` }}>
                        <div style={{ fontSize:10, color:ORG_COLORS[org], fontWeight:"bold", marginBottom:2 }}>{org}</div>
                        <div style={{ fontSize:13, fontWeight:"bold", color:"#1e1b4b" }}>{val||<span style={{ color:"#ccc", fontWeight:"normal", fontSize:12 }}>Not set</span>}</div>
                        <div style={{ fontSize:9, color:"#bbb", marginTop:2 }}>{label}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop:16, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                  <StatCard label="Entered" value={Object.values(dogRegs).filter(v=>v?.status==="entered").length} icon="📋" small/>
                  <StatCard label="Results" value={myResults.length} icon="✅" small/>
                  <StatCard label="Titles" value={titlesEarned.length} icon="🏆" small/>
                </div>
                {dogs.length>1&&(
                  deleteConfirm===activeDog.id?(
                    <div style={{ marginTop:16, background:"#fff0f0", borderRadius:10, padding:12, border:"1px solid #ffcccc" }}>
                      <div style={{ fontSize:13, color:"#c0392b", marginBottom:8 }}>Remove {activeDog.callName}?</div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={()=>deleteDog(activeDog.id)} style={btnStyle("#c0392b")}>Yes, Remove</button>
                        <button onClick={()=>setDeleteConfirm(null)} style={btnStyle("#aaa")}>Cancel</button>
                      </div>
                    </div>
                  ):(
                    <button onClick={()=>setDeleteConfirm(activeDog.id)} style={{ ...btnStyle("#c0392b",true), marginTop:16, fontSize:12, padding:"6px 14px" }}>Remove this dog</button>
                  )
                )}
              </div>
            ))}
            <button onClick={addDog} style={{ ...btnStyle("#7c3aed",true), width:"100%", marginTop:14, padding:12, fontSize:14 }}>+ Add Another Dog</button>
          </div>
        )}
        {/* TRAINING */}
        {tab==="Training" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontWeight:"bold", fontSize:16, color:"#5b21b6" }}>🎯 Training Log · {activeDog?.callName}</div>
              <button onClick={()=>{ setTrainingForm(blankTrainingForm()); setEditingTrainingId(null); setShowTrainingForm(!showTrainingForm); setShowRunForm(false); }} style={{ ...btnStyle("#7c3aed"), background:"linear-gradient(135deg,#7c3aed,#06b6d4)", fontSize:12, padding:"6px 14px" }}>
                {showTrainingForm && !editingTrainingId ? "Cancel" : "+ Log Session"}
              </button>
            </div>

            {showTrainingForm && (
              <form onSubmit={addTrainingEntry} style={formStyle}>
                <div style={formTitle}>{editingTrainingId ? "✏️ Edit Session" : "New Training Session"}</div>

                {/* Date + Time + Type */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                  <div><label style={labelStyle}>Date</label><input type="date" style={inputStyle} value={trainingForm.date} onChange={e=>setTrainingForm({...trainingForm,date:e.target.value})}/></div>
                  <div><label style={labelStyle}>Time</label><input type="time" style={inputStyle} value={trainingForm.time||""} onChange={e=>setTrainingForm({...trainingForm,time:e.target.value})}/></div>
                  <div>
                    <label style={labelStyle}>Session Type</label>
                    <select style={inputStyle} value={trainingForm.type} onChange={e=>setTrainingForm({...trainingForm,type:e.target.value})}>
                      <option>Class</option><option>Private Lesson</option><option>Home Practice</option><option>Fun Match</option><option>Other</option>
                    </select>
                  </div>
                </div>

                <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:8, padding:"8px 12px", margin:"10px 0", fontSize:12, color:"#0369a1" }}>
                  💡 Just saw it on WhatsApp? Fill in date, time and type then hit Save — add runs and details later by tapping Edit!
                </div>

                <label style={labelStyle}>Location</label>
                <input style={inputStyle} value={trainingForm.location||""} onChange={e=>setTrainingForm({...trainingForm,location:e.target.value})} placeholder="Training center, home, park…"/>
                <label style={labelStyle}>Session Notes</label>
                <textarea style={{...inputStyle, height:60}} value={trainingForm.notes||""} onChange={e=>setTrainingForm({...trainingForm,notes:e.target.value})} placeholder="Overall session notes, patterns noticed…"/>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:10 }}>
                  <div>
                    <label style={labelStyle}>Overall Feel</label>
                    <select style={inputStyle} value={trainingForm.rating||"👍 Great"} onChange={e=>setTrainingForm({...trainingForm,rating:e.target.value})}>
                      <option>👍 Great</option><option>👌 Good</option><option>🤔 Mixed</option><option>😬 Rough</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>Video Link (optional)</label><input style={inputStyle} value={trainingForm.videoLink||""} onChange={e=>setTrainingForm({...trainingForm,videoLink:e.target.value})} placeholder="Google Drive or YouTube URL"/></div>
                </div>

                {/* ── RUNS ── */}
                <div style={{ margin:"14px 0 8px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontWeight:"bold", fontSize:13, color:"#5b21b6" }}>Runs ({trainingForm.runs?.length||0})</div>
                  <button type="button" onClick={()=>{ setRunForm(blankRunForm()); setEditingRunIdx(null); setShowRunForm(!showRunForm); }} style={{ ...btnStyle("#06b6d4",true), padding:"3px 12px", fontSize:11 }}>
                    {showRunForm && editingRunIdx===null ? "Cancel" : "+ Add Run"}
                  </button>
                </div>

                {/* Run form */}
                {showRunForm && (
                  <div style={{ background:"#f0fdff", border:"1px solid #a5f3fc", borderRadius:10, padding:12, marginBottom:10 }}>
                    <div style={{ fontWeight:"bold", fontSize:12, color:"#0e7490", marginBottom:8 }}>{editingRunIdx!==null ? "Edit Run" : `Run ${(trainingForm.runs?.length||0)+1}`}</div>

                    {/* Odors — multi select */}
                    <label style={labelStyle}>Odor(s) — tap to select multiple</label>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:6 }}>
                      {["Birch","Anise","Clove","Myrrh","Cypress","Vetiver"].map(o=>(
                        <button type="button" key={o} onClick={()=>setRunForm({...runForm, odors:toggleMulti(runForm.odors,o)})} style={{
                          background: runForm.odors.includes(o)?"linear-gradient(135deg,#7c3aed,#06b6d4)":"#fff",
                          color: runForm.odors.includes(o)?"#fff":"#7c3aed",
                          border:`1px solid ${runForm.odors.includes(o)?"transparent":"#ddd6fe"}`,
                          borderRadius:20, padding:"4px 12px", fontSize:12, cursor:"pointer", fontWeight: runForm.odors.includes(o)?"bold":"normal"
                        }}>{o}</button>
                      ))}
                    </div>

                    {/* Hide type */}
                    <label style={labelStyle}>Hide Type</label>
                    <div style={{ display:"flex", gap:5, marginBottom:6 }}>
                      {["Known","Blind","Both"].map(h=>(
                        <button type="button" key={h} onClick={()=>setRunForm({...runForm, hideType:h, blindOutcome: h==="Known"?"":runForm.blindOutcome})} style={{
                          background: runForm.hideType===h?"linear-gradient(135deg,#7c3aed,#06b6d4)":"#fff",
                          color: runForm.hideType===h?"#fff":"#7c3aed",
                          border:`1px solid ${runForm.hideType===h?"transparent":"#ddd6fe"}`,
                          borderRadius:20, padding:"4px 14px", fontSize:12, cursor:"pointer", fontWeight: runForm.hideType===h?"bold":"normal"
                        }}>{h}</button>
                      ))}
                    </div>

                    {/* Blind outcome — only when Blind or Both */}
                    {(runForm.hideType==="Blind"||runForm.hideType==="Both") && (
                      <>
                        <label style={labelStyle}>Blind Hide Outcome</label>
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:6 }}>
                          {[
                            {val:"Found · Full confidence", color:"#16a34a", bg:"#e8f8ee", border:"#86efac"},
                            {val:"Found · Unsure but called it", color:"#1d4ed8", bg:"#eff6ff", border:"#93c5fd"},
                            {val:"Dog showed · I held back", color:"#b45309", bg:"#fffbeb", border:"#fcd34d"},
                            {val:"False Alert", color:"#991b1b", bg:"#fee2e2", border:"#fca5a5"},
                          ].map(({val,color,bg,border})=>(
                            <button type="button" key={val} onClick={()=>setRunForm({...runForm,blindOutcome:val})} style={{
                              background: runForm.blindOutcome===val ? bg : "#fff",
                              color: runForm.blindOutcome===val ? color : "#888",
                              border: `1px solid ${runForm.blindOutcome===val ? border : "#eee"}`,
                              borderRadius:20, padding:"4px 12px", fontSize:11, cursor:"pointer",
                              fontWeight: runForm.blindOutcome===val?"bold":"normal"
                            }}>{val}</button>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Search elements — multi select */}
                    <label style={labelStyle}>Search Element(s) — tap to select multiple</label>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                      {["Interior","Exterior","Vehicle","Buried","Water"].map(el=>(
                        <button type="button" key={el} onClick={()=>setRunForm({...runForm, elements:toggleMulti(runForm.elements,el)})} style={{
                          background: runForm.elements.includes(el)?"linear-gradient(135deg,#7c3aed,#06b6d4)":"#fff",
                          color: runForm.elements.includes(el)?"#fff":"#7c3aed",
                          border:`1px solid ${runForm.elements.includes(el)?"transparent":"#ddd6fe"}`,
                          borderRadius:20, padding:"4px 12px", fontSize:12, cursor:"pointer", fontWeight: runForm.elements.includes(el)?"bold":"normal"
                        }}>{el}</button>
                      ))}
                    </div>

                    <label style={labelStyle}>Run Notes (optional)</label>
                    <input style={inputStyle} value={runForm.notes||""} onChange={e=>setRunForm({...runForm,notes:e.target.value})} placeholder="What happened on this run…"/>

                    <div style={{ display:"flex", gap:6, marginTop:8 }}>
                      <button type="button" onClick={saveRun} style={{ ...btnStyle("#7c3aed"), background:"linear-gradient(135deg,#7c3aed,#06b6d4)", fontSize:12, padding:"5px 14px" }}>
                        {editingRunIdx!==null?"Save Run":"Add Run"}
                      </button>
                      <button type="button" onClick={()=>{ setShowRunForm(false); setEditingRunIdx(null); setRunForm(blankRunForm()); }} style={{ ...btnStyle("#aaa"), fontSize:12, padding:"5px 14px" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Runs list */}
                {(trainingForm.runs||[]).map((run,idx)=>(
                  <div key={idx} style={{ background:"#faf5ff", borderRadius:8, padding:"8px 12px", marginBottom:6, border:"1px solid #e9d5ff", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:"bold", color:"#5b21b6", marginBottom:3 }}>Run {idx+1}</div>
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:3 }}>
                        {run.odors.map(o=><span key={o} style={{ background:"#ede9fe", color:"#7c3aed", borderRadius:20, padding:"1px 8px", fontSize:10, fontWeight:"bold" }}>{o}</span>)}
                        <span style={{ background:"#f0fdf4", color:"#166534", borderRadius:20, padding:"1px 8px", fontSize:10 }}>{run.hideType}</span>
                        {run.elements.map(el=><span key={el} style={{ background:"#f0f9ff", color:"#0369a1", borderRadius:20, padding:"1px 8px", fontSize:10 }}>{el}</span>)}
                      </div>
                      {run.blindOutcome&&<div style={{ fontSize:11, color:"#555", fontStyle:"italic" }}>→ {run.blindOutcome}</div>}
                      {run.notes&&<div style={{ fontSize:11, color:"#888", marginTop:2 }}>{run.notes}</div>}
                    </div>
                    <div style={{ display:"flex", gap:4, flexShrink:0, marginLeft:6 }}>
                      <button type="button" onClick={()=>{ setRunForm({...run}); setEditingRunIdx(idx); setShowRunForm(true); }} style={{ ...btnStyle("#7c3aed",true), padding:"2px 8px", fontSize:10 }}>Edit</button>
                      <button type="button" onClick={()=>deleteRun(idx)} style={{ ...btnStyle("#c0392b",true), padding:"2px 8px", fontSize:10 }}>Del</button>
                    </div>
                  </div>
                ))}

                <div style={{ display:"flex", gap:8, marginTop:14 }}>
                  <button type="submit" style={{ ...btnStyle("#7c3aed"), background:"linear-gradient(135deg,#7c3aed,#06b6d4)" }}>{editingTrainingId ? "Save Changes" : "Save Session"}</button>
                  <button type="button" onClick={()=>{ setShowTrainingForm(false); setEditingTrainingId(null); setTrainingForm(blankTrainingForm()); setShowRunForm(false); }} style={btnStyle("#aaa")}>Cancel</button>
                </div>
              </form>
            )}

            {/* Stats row */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
              <StatCard label="Total Sessions" value={myTraining.length} icon="🎯"/>
              <StatCard label="This Month" value={myTraining.filter(t=>t.date?.slice(0,7)===new Date().toISOString().slice(0,7)).length} icon="📅"/>
              <StatCard label="Total Runs" value={myTraining.reduce((a,t)=>a+(t.runs?.length||0),0)} icon="🏃"/>
            </div>

            {myTraining.length===0
              ? <div style={{ color:"#bbb", fontSize:13, textAlign:"center", marginTop:30 }}>No training logged yet — after each session jot a quick note here! 🐾</div>
              : myTraining.map(entry=>(
                <div key={entry.id} style={{ background:"#fff", borderRadius:12, padding:14, marginBottom:10, border:"1px solid #e9d5ff", boxShadow:"0 1px 6px rgba(0,0,0,0.05)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ flex:1, marginRight:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <div style={{ fontWeight:"bold", fontSize:14 }}>
                          {entry.date}{entry.time&&<span style={{ color:"#888", fontWeight:"normal", fontSize:12 }}> · {entry.time}</span>}
                        </div>
                        <span style={{ background:"#ede9fe", color:"#7c3aed", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:"bold" }}>{entry.type}</span>
                        <span style={{ fontSize:15 }}>{entry.rating?.split(" ")[0]}</span>
                      </div>
                      {entry.location&&<div style={{ fontSize:12, color:"#666", marginTop:3 }}>📍 {entry.location}</div>}
                      {entry.notes&&<div style={{ fontSize:12, color:"#555", marginTop:4, fontStyle:"italic" }}>{entry.notes}</div>}

                      {/* Runs summary */}
                      {(entry.runs?.length>0) ? (
                        <div style={{ marginTop:8 }}>
                          <div style={{ fontSize:11, color:"#5b21b6", fontWeight:"bold", marginBottom:4 }}>{entry.runs.length} Run{entry.runs.length>1?"s":""}</div>
                          {entry.runs.map((run,i)=>(
                            <div key={i} style={{ background:"#faf5ff", borderRadius:8, padding:"6px 10px", marginBottom:4, border:"1px solid #e9d5ff" }}>
                              <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center" }}>
                                <span style={{ fontSize:11, color:"#888", marginRight:2 }}>Run {i+1}:</span>
                                {run.odors?.map(o=><span key={o} style={{ background:"#ede9fe", color:"#7c3aed", borderRadius:20, padding:"1px 7px", fontSize:10, fontWeight:"bold" }}>{o}</span>)}
                                <span style={{ background:"#f0fdf4", color:"#166534", borderRadius:20, padding:"1px 7px", fontSize:10 }}>{run.hideType}</span>
                                {run.elements?.map(el=><span key={el} style={{ background:"#f0f9ff", color:"#0369a1", borderRadius:20, padding:"1px 7px", fontSize:10 }}>{el}</span>)}
                              </div>
                              {run.blindOutcome&&<div style={{ fontSize:10, color:"#666", marginTop:2, fontStyle:"italic" }}>→ {run.blindOutcome}</div>}
                              {run.notes&&<div style={{ fontSize:10, color:"#888", marginTop:1 }}>{run.notes}</div>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize:11, color:"#f59e0b", marginTop:4 }}>📝 Tap Edit to add runs</div>
                      )}

                      {entry.videoLink&&(
                        <button onClick={()=>window.open(entry.videoLink,"_blank")} style={{ display:"flex", alignItems:"center", gap:6, background:"#f0fdf4", color:"#16a34a", border:"1px solid #86efac", borderRadius:8, padding:"5px 10px", fontSize:11, cursor:"pointer", marginTop:6, fontWeight:"bold" }}>
                          🎥 Watch Training Video →
                        </button>
                      )}
                    </div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <button onClick={()=>startEditTraining(entry)} style={{ ...btnStyle("#7c3aed",true), padding:"3px 10px", fontSize:11 }}>Edit</button>
                      <button onClick={()=>deleteTrainingEntry(entry.id)} style={{ ...btnStyle("#c0392b",true), padding:"3px 10px", fontSize:11 }}>Delete</button>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* ACCOUNT */}
        {tab==="Account" && (
          <div>
            <div style={{ fontWeight:"bold", fontSize:16, marginBottom:16, color:"#5b21b6" }}>👤 Account Settings</div>

            {accountMsg && <div style={{ background:"#e8f8ee", color:"#27ae60", borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:13 }}>{accountMsg}</div>}
            {accountError && <div style={{ background:"#ffeaea", color:"#c0392b", borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:13 }}>{accountError}</div>}

            <div style={{ background:"#fff", borderRadius:12, padding:14, marginBottom:12, border:"1px solid #e9d5ff" }}>
              <div style={{ fontSize:13, color:"#888", marginBottom:4 }}>Signed in as</div>
              <div style={{ fontWeight:"bold", color:"#1e1b4b" }}>{user.displayName || "No name set"}</div>
              <div style={{ fontSize:13, color:"#666" }}>{user.email}</div>
            </div>

            {/* Change Name */}
            <form onSubmit={updateAccountName} style={formStyle}>
              <div style={formTitle}>Change Display Name</div>
              <label style={labelStyle}>New Name</label>
              <input required style={inputStyle} placeholder="Your name" value={accountForm.name} onChange={e=>{ setAccountMsg(""); setAccountError(""); setAccountForm({...accountForm,name:e.target.value}); }} />
              <button type="submit" style={{ ...btnStyle("#7c3aed"), background:"linear-gradient(135deg,#7c3aed,#06b6d4)", marginTop:10 }}>Update Name</button>
            </form>

            {/* Change Email */}
            <form onSubmit={updateAccountEmail} style={formStyle}>
              <div style={formTitle}>Change Email</div>
              <label style={labelStyle}>New Email</label>
              <input required type="email" style={inputStyle} placeholder="new@email.com" value={accountForm.email} onChange={e=>{ setAccountMsg(""); setAccountError(""); setAccountForm({...accountForm,email:e.target.value}); }} />
              <label style={labelStyle}>Current Password (to confirm)</label>
              <input required type="password" style={inputStyle} placeholder="••••••••" value={accountForm.currentPassword} onChange={e=>setAccountForm({...accountForm,currentPassword:e.target.value})} />
              <button type="submit" style={{ ...btnStyle("#7c3aed"), background:"linear-gradient(135deg,#7c3aed,#06b6d4)", marginTop:10 }}>Update Email</button>
            </form>

            {/* Change Password */}
            <form onSubmit={updateAccountPassword} style={formStyle}>
              <div style={formTitle}>Change Password</div>
              <label style={labelStyle}>Current Password</label>
              <input required type="password" style={inputStyle} placeholder="••••••••" value={accountForm.currentPassword} onChange={e=>{ setAccountMsg(""); setAccountError(""); setAccountForm({...accountForm,currentPassword:e.target.value}); }} />
              <label style={labelStyle}>New Password</label>
              <input required type="password" style={inputStyle} placeholder="At least 6 characters" value={accountForm.newPassword} onChange={e=>setAccountForm({...accountForm,newPassword:e.target.value})} />
              <button type="submit" style={{ ...btnStyle("#7c3aed"), background:"linear-gradient(135deg,#7c3aed,#06b6d4)", marginTop:10 }}>Update Password</button>
            </form>

            {/* Sign out */}
            <button onClick={handleLogout} style={{ ...btnStyle("#aaa",true), width:"100%", padding:12, marginBottom:12 }}>Sign Out</button>

            {/* Delete Account */}
            {!showDeleteAccount ? (
              <button onClick={()=>setShowDeleteAccount(true)} style={{ ...btnStyle("#c0392b",true), width:"100%", padding:12, fontSize:13 }}>Delete My Account</button>
            ) : (
              <form onSubmit={handleDeleteAccount} style={{ background:"#fff0f0", borderRadius:14, padding:18, border:"1px solid #ffcccc" }}>
                <div style={{ fontWeight:"bold", fontSize:15, color:"#c0392b", marginBottom:8 }}>⚠️ Delete Account</div>
                <p style={{ fontSize:13, color:"#666", margin:"0 0 12px" }}>This will permanently delete your account and all your dogs' data. This cannot be undone.</p>
                <label style={labelStyle}>Enter your password to confirm</label>
                <input required type="password" style={inputStyle} placeholder="••••••••" value={deletePassword} onChange={e=>{ setAccountError(""); setDeletePassword(e.target.value); }} />
                <div style={{ display:"flex", gap:8, marginTop:12 }}>
                  <button type="submit" style={btnStyle("#c0392b")}>Yes, Delete Everything</button>
                  <button type="button" onClick={()=>{ setShowDeleteAccount(false); setDeletePassword(""); setAccountError(""); }} style={btnStyle("#aaa")}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OrgBadge({org,size=11}) {
  return <span style={{ background:(ORG_COLORS[org]||"#999")+"22", color:ORG_COLORS[org]||"#999", borderRadius:20, padding:"2px 8px", fontSize:size, fontWeight:"bold", display:"inline-block" }}>{org}</span>;
}
function StatCard({label,value,icon,small}) {
  return (
    <div style={{ background:"#faf5ff", borderRadius:10, padding:small?"10px 8px":"14px 10px", textAlign:"center", border:"1px solid #e9d5ff" }}>
      <div style={{ fontSize:small?20:26 }}>{icon}</div>
      <div style={{ fontWeight:"bold", fontSize:small?18:22, color:"#5b21b6" }}>{value}</div>
      <div style={{ fontSize:10, color:"#999", marginTop:2 }}>{label}</div>
    </div>
  );
}
function ResultRow({r}) {
  return (
    <div style={{ padding:"10px 0", borderBottom:"1px solid #e9d5ff" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div><div style={{ fontSize:14, fontWeight:"bold" }}>{r.trial}</div><div style={{ fontSize:12, color:"#888" }}><OrgBadge org={r.org}/> · {r.date}</div></div>
        <div style={{ textAlign:"right" }}>
          <span style={{ background:r.result==="Pass"?"#e8f8ee":"#ffeaea", color:r.result==="Pass"?"#27ae60":"#c0392b", borderRadius:20, padding:"2px 10px", fontSize:11 }}>{r.result}</span>
          {r.title&&<div style={{ fontSize:11, color:"#e07b39", fontWeight:"bold", marginTop:2 }}>🏆 {r.title}</div>}
        </div>
      </div>
      {r.photoUrl&&<img src={r.photoUrl} alt="ribbon" style={{ width:"100%", maxHeight:160, objectFit:"cover", borderRadius:8, marginTop:8 }}/>}
      {r.videoLink&&(
        <button onClick={()=>window.open(r.videoLink,"_blank")} style={{ display:"flex", alignItems:"center", gap:6, background:"#f0fdf4", color:"#16a34a", border:"1px solid #86efac", borderRadius:8, padding:"5px 10px", fontSize:11, cursor:"pointer", marginTop:6, fontWeight:"bold" }}>
          🎥 Watch Run →
        </button>
      )}
    </div>
  );
}
function OrgFilter({value, onChange, dogRegs={}}) {
  const enteredCount = Object.values(dogRegs).filter(v => v?.status === "entered" || v?.status === "waitlist").length;
  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
      {["All","Entered",...ORGS].map(o=>(
        <button key={o} onClick={()=>onChange(o)} style={{
          background: value===o ? "linear-gradient(135deg,#7c3aed,#06b6d4)" : o==="Entered" ? "#e8f8ee" : "#ede9fe",
          color: value===o ? "#fff" : o==="Entered" ? "#27ae60" : "#7c3aed",
          border: o==="Entered" && value!==o ? "1px solid #27ae60" : "none",
          borderRadius:20, padding:"4px 12px", fontSize:12, cursor:"pointer", fontWeight: o==="Entered" ? "bold" : "normal"
        }}>
          {o==="Entered" ? `✓ Entered (${enteredCount})` : o}
        </button>
      ))}
    </div>
  );
}

const inputStyle = { width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #ddd", fontSize:14, boxSizing:"border-box", marginBottom:2, background:"#fafafa" };
const labelStyle = { fontSize:12, color:"#666", display:"block", marginBottom:4, marginTop:8 };
const formStyle  = { background:"#fff", borderRadius:14, padding:18, marginBottom:18, boxShadow:"0 2px 12px rgba(0,0,0,0.08)", border:"1px solid #e9d5ff" };
const formTitle  = { fontWeight:"bold", fontSize:15, marginBottom:8, color:"#5b21b6" };
function btnStyle(bg,outline=false) {
  return { background:outline?"transparent":bg, color:outline?bg:"#fff", border:outline?`2px solid ${bg}`:"none", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:"bold", cursor:"pointer" };
}
