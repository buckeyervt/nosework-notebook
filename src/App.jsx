import { useState, useEffect } from "react";
import { db } from "./firebase";
import { MASTER_TRIALS } from "./trials";
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch } from "firebase/firestore";

// ── Constants ────────────────────────────────────────────────
const ORGS = ["NACSW", "UKC", "AKC", "USCSS/Other"];
const ORG_COLORS = { NACSW: "#e07b39", UKC: "#3a7bd5", AKC: "#c0392b", "USCSS/Other": "#27ae60" };
const ORG_BG     = { NACSW: "#fdf4ff", UKC: "#eef4ff", AKC: "#fff0f0", "USCSS/Other": "#f0fdf4" };
const ADMIN_PIN  = "1234"; // ← Change this before sharing!

const ORG_IDS = [
  { org: "NACSW",        key: "nacsw",  label: "NACSW #",                    placeholder: "e.g. K040827"       },
  { org: "AKC",          key: "akc",    label: "AKC # (Canine Partners)",     placeholder: "e.g. MB25813301"    },
  { org: "UKC",          key: "ukc",    label: "UKC Performance Listing #",   placeholder: "e.g. PL025899"      },
  { org: "USCSS/Other",  key: "uscss",  label: "USCSS Member #",              placeholder: "e.g. your USCSS ID" },
];

// ── LocalStorage helpers ──────────────────────────────────────
const ls    = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const lsSet = (k, v)  => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const TABS = ["Dashboard", "Trials", "Results", "Titles", "My Dogs"];
const blankDog = () => ({ id: Date.now().toString(), callName:"", name:"", breed:"", dob:"", nacsw:"", akc:"", ukc:"", uscss:"" });

export default function App() {
  // ── Onboarding ──────────────────────────────────────────────
  const [isSetup, setIsSetup]     = useState(() => ls("nw_setup", false));
  const [setupStep, setSetupStep] = useState(0);
  const [setupDog, setSetupDog]   = useState(blankDog());

  // ── Core state ──────────────────────────────────────────────
  const [tab, setTab]                 = useState("Dashboard");
  const [dogs, setDogs]               = useState(() => ls("nw_dogs", []));
  const [activeDogId, setActiveDogId] = useState(() => ls("nw_activeDog", null));
  const [photos, setPhotos]           = useState(() => ls("nw_photos", {}));

  // Per-dog data — keyed by dogId
  const [registrations, setRegistrations] = useState(() => ls("nw_regs", {}));   // { dogId: { trialId: bool } }
  const [allResults, setAllResults]       = useState(() => ls("nw_results", {})); // { dogId: [ ...results ] }

  // ── Firebase trial calendar ──────────────────────────────────
  const [trials, setTrials]           = useState([]);
  const [trialsLoading, setTrialsLoading] = useState(true);

  // ── Admin ────────────────────────────────────────────────────
  const [showAdmin, setShowAdmin]         = useState(false);
  const [adminPin, setAdminPin]           = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminTab, setAdminTab]           = useState("list");
  const [trialForm, setTrialForm]         = useState({ org:"NACSW", name:"", date:"", location:"", level:"", entryDeadline:"", notes:"" });
  const [editingTrialId, setEditingTrialId] = useState(null);

  // ── UI ───────────────────────────────────────────────────────
  const [filterOrg, setFilterOrg]         = useState("All");
  const [showResultForm, setShowResultForm] = useState(false);
  const [resultForm, setResultForm]       = useState({ org:"NACSW", trial:"", date:"", level:"", result:"Pass", title:"", notes:"" });
  const [editingDogId, setEditingDogId]   = useState(null);
  const [dogForm, setDogForm]             = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const activeDog = dogs.find(d => d.id === activeDogId) || dogs[0];
  const today = new Date();

  // ── Persist ──────────────────────────────────────────────────
  useEffect(() => lsSet("nw_setup",   isSetup),        [isSetup]);
  useEffect(() => lsSet("nw_dogs",    dogs),            [dogs]);
  useEffect(() => lsSet("nw_activeDog", activeDogId),  [activeDogId]);
  useEffect(() => lsSet("nw_photos",  photos),          [photos]);
  useEffect(() => lsSet("nw_regs",    registrations),   [registrations]);
  useEffect(() => lsSet("nw_results", allResults),      [allResults]);

  // ── Firebase live sync ───────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "trials"), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(a.date)-new Date(b.date));
      setTrials(data); setTrialsLoading(false);
    }, () => { setTrials(MASTER_TRIALS); setTrialsLoading(false); });
    return () => unsub();
  }, []);

  // ── Seed Firebase ────────────────────────────────────────────
  async function seedTrials() {
    const batch = writeBatch(db);
    MASTER_TRIALS.forEach(t => batch.set(doc(db, "trials", t.id), t));
    await batch.commit();
    alert(`✅ ${MASTER_TRIALS.length} trials uploaded to Firebase!`);
  }

  // ── Onboarding ───────────────────────────────────────────────
  function finishSetup() {
    const dog = { ...setupDog, id: Date.now().toString() };
    setDogs([dog]); setActiveDogId(dog.id); setIsSetup(true);
  }

  // ── Dogs ─────────────────────────────────────────────────────
  function saveDog(e) {
    e.preventDefault();
    setDogs(dogs.map(d => d.id === editingDogId ? { ...dogForm } : d));
    setEditingDogId(null);
  }
  function addDog() {
    const dog = blankDog();
    setDogs([...dogs, dog]); setActiveDogId(dog.id); setEditingDogId(dog.id); setDogForm(dog);
  }
  function deleteDog(id) {
    const rem = dogs.filter(d => d.id !== id);
    setDogs(rem); if (activeDogId === id) setActiveDogId(rem[0]?.id || null); setDeleteConfirm(null);
  }

  // ── Per-dog registrations ─────────────────────────────────────
  function toggleReg(trialId) {
    if (!activeDog) return;
    setRegistrations(prev => ({ ...prev, [activeDog.id]: { ...(prev[activeDog.id]||{}), [trialId]: !(prev[activeDog.id]?.[trialId]) }}));
  }
  const dogRegs = activeDog ? (registrations[activeDog.id] || {}) : {};

  // ── Per-dog results ───────────────────────────────────────────
  function addResult(e) {
    e.preventDefault();
    if (!activeDog) return;
    setAllResults(prev => ({ ...prev, [activeDog.id]: [...(prev[activeDog.id]||[]), { ...resultForm, id: Date.now().toString() }] }));
    setShowResultForm(false);
    setResultForm({ org:"NACSW", trial:"", date:"", level:"", result:"Pass", title:"", notes:"" });
  }
  const myResults = activeDog ? (allResults[activeDog.id] || []) : [];

  // ── Admin trials ──────────────────────────────────────────────
  async function saveAdminTrial(e) {
    e.preventDefault();
    const id = editingTrialId || `t_${Date.now()}`;
    await setDoc(doc(db, "trials", id), { ...trialForm, id });
    setTrialForm({ org:"NACSW", name:"", date:"", location:"", level:"", entryDeadline:"", notes:"" });
    setEditingTrialId(null); setAdminTab("list");
    alert("✅ Saved! Everyone's app will update automatically.");
  }
  async function deleteTrial(id) {
    if (window.confirm("Delete this trial for everyone?")) await deleteDoc(doc(db, "trials", id));
  }

  // ── Derived ───────────────────────────────────────────────────
  const upcoming     = trials.filter(t => new Date(t.date) >= today);
  const deadlineSoon = trials.filter(t => { const d = (new Date(t.entryDeadline)-today)/86400000; return d >= 0 && d <= 14 && !dogRegs[t.id]; });
  const titlesEarned = myResults.filter(r => r.title).map(r => ({ org:r.org, title:r.title, date:r.date, trial:r.trial }));
  const filtered     = filterOrg === "All" ? trials : trials.filter(t => t.org === filterOrg);
  const daysUntil    = d => { const n = Math.ceil((new Date(d)-today)/86400000); return n<0?"Passed":n===0?"Today!":n===1?"Tomorrow":`${n} days`; };

  // ════════════════════════════════════════════════════════════
  // ONBOARDING
  // ════════════════════════════════════════════════════════════
  if (!isSetup) return (
    <div style={{ fontFamily:"Georgia,serif", background:"linear-gradient(135deg,#6b21a8,#7c3aed,#06b6d4)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#ffffff", borderRadius:20, padding:28, maxWidth:420, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:52 }}>🐾</div>
          <div style={{ fontSize:22, fontWeight:"bold", color:"#5b21b6" }}>NoseWork Notebook</div>
          <div style={{ fontSize:13, color:"#888", marginTop:4 }}>Texas · Oklahoma · Louisiana</div>
        </div>

        {setupStep === 0 && (
          <div style={{ textAlign:"center" }}>
            <p style={{ color:"#555", fontSize:14, lineHeight:1.6 }}>Track your dog's nose work trials, titles, and results. The regional trial calendar stays up-to-date for everyone automatically!</p>
            <button onClick={() => setSetupStep(1)} style={{ ...btnStyle("#7c3aed"), width:"100%", padding:14, fontSize:15, marginTop:16 }}>Get Started 🐕</button>
          </div>
        )}

        {setupStep === 1 && (
          <div>
            <div style={{ fontWeight:"bold", fontSize:15, color:"#5b21b6", marginBottom:4 }}>Your dog's basic info</div>
            <div style={{ fontSize:12, color:"#888", marginBottom:12 }}>You can edit this any time</div>
            <label style={labelStyle}>Call Name *</label>
            <input style={inputStyle} placeholder="e.g. Catie" value={setupDog.callName} onChange={e => setSetupDog({...setupDog, callName:e.target.value})} />
            <label style={labelStyle}>Registered Name</label>
            <input style={inputStyle} placeholder="Full registered name" value={setupDog.name} onChange={e => setSetupDog({...setupDog, name:e.target.value})} />
            <label style={labelStyle}>Breed</label>
            <input style={inputStyle} placeholder="e.g. Border Collie Mix" value={setupDog.breed} onChange={e => setSetupDog({...setupDog, breed:e.target.value})} />
            <label style={labelStyle}>Date of Birth</label>
            <input type="date" style={inputStyle} value={setupDog.dob} onChange={e => setSetupDog({...setupDog, dob:e.target.value})} />
            <button onClick={() => setSetupStep(2)} disabled={!setupDog.callName} style={{ ...btnStyle("#7c3aed"), width:"100%", padding:12, marginTop:16 }}>Next → Org IDs</button>
          </div>
        )}

        {setupStep === 2 && (
          <div>
            <div style={{ fontWeight:"bold", fontSize:15, color:"#5b21b6", marginBottom:4 }}>Organization IDs</div>
            <div style={{ fontSize:12, color:"#888", marginBottom:14 }}>Add whichever ones apply — all optional</div>
            {ORG_IDS.map(({ org, key, label, placeholder }) => (
              <div key={key}>
                <label style={{ ...labelStyle, display:"flex", alignItems:"center", gap:6 }}>
                  <OrgBadge org={org} size={10} /> {label}
                </label>
                <input style={inputStyle} placeholder={placeholder} value={setupDog[key]} onChange={e => setSetupDog({...setupDog, [key]:e.target.value})} />
              </div>
            ))}
            <button onClick={finishSetup} style={{ ...btnStyle("#7c3aed"), width:"100%", padding:12, marginTop:18 }}>Let's Go! 🐾</button>
          </div>
        )}

        {setupStep > 0 && <button onClick={() => setSetupStep(s=>s-1)} style={{ ...btnStyle("#aaa",true), width:"100%", marginTop:10, padding:8, fontSize:13 }}>← Back</button>}
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // ADMIN PANEL
  // ════════════════════════════════════════════════════════════
  if (showAdmin) return (
    <div style={{ fontFamily:"Georgia,serif", background:"#f0f4ff", minHeight:"100vh" }}>
      <div style={{ background:"linear-gradient(135deg,#6b21a8,#7c3aed,#06b6d4)", padding:"14px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ color:"#e0f2fe", fontWeight:"bold" }}>🔐 Admin Panel</div>
        <button onClick={() => { setShowAdmin(false); setAdminUnlocked(false); setAdminPin(""); }} style={{ ...btnStyle("#e0f2fe",true), color:"#e0f2fe", borderColor:"#e0f2fe", padding:"5px 12px", fontSize:12 }}>← Back</button>
      </div>
      <div style={{ padding:18, maxWidth:700, margin:"0 auto" }}>
        {!adminUnlocked ? (
          <div style={formStyle}>
            <div style={formTitle}>🔒 Enter Admin PIN</div>
            <p style={{ fontSize:13, color:"#888" }}>Only the calendar admin (Tina) should have this PIN.</p>
            <input type="password" style={inputStyle} placeholder="PIN" value={adminPin} onChange={e => setAdminPin(e.target.value)}
              onKeyDown={e => e.key==="Enter" && (adminPin===ADMIN_PIN ? setAdminUnlocked(true) : alert("Wrong PIN"))} />
            <button onClick={() => adminPin===ADMIN_PIN ? setAdminUnlocked(true) : alert("Wrong PIN")} style={{ ...btnStyle("#7c3aed"), marginTop:10 }}>Unlock</button>
          </div>
        ) : (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
              {[["list","📋 All Trials"],["add","➕ Add Trial"],["seed","🚀 Seed DB"]].map(([t,l]) => (
                <button key={t} onClick={() => { setAdminTab(t); if(t!=="add"){ setEditingTrialId(null); setTrialForm({org:"NACSW",name:"",date:"",location:"",level:"",entryDeadline:"",notes:""}); }}}
                  style={{ ...btnStyle(adminTab===t?"#7c3aed":"#aaa"), padding:"6px 14px", fontSize:13 }}>{l}</button>
              ))}
            </div>

            {(adminTab === "add" || editingTrialId) && (
              <form onSubmit={saveAdminTrial} style={formStyle}>
                <div style={formTitle}>{editingTrialId ? "✏️ Edit Trial" : "➕ New Trial"}</div>
                <label style={labelStyle}>Organization</label>
                <select style={inputStyle} value={trialForm.org} onChange={e => setTrialForm({...trialForm, org:e.target.value})}>
                  {ORGS.map(o => <option key={o}>{o}</option>)}
                </select>
                <label style={labelStyle}>Trial Name *</label>
                <input required style={inputStyle} value={trialForm.name} onChange={e => setTrialForm({...trialForm, name:e.target.value})} placeholder="Full name & host club" />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div><label style={labelStyle}>Trial Date *</label><input required type="date" style={inputStyle} value={trialForm.date} onChange={e => setTrialForm({...trialForm, date:e.target.value})} /></div>
                  <div><label style={labelStyle}>Entry Deadline</label><input type="date" style={inputStyle} value={trialForm.entryDeadline} onChange={e => setTrialForm({...trialForm, entryDeadline:e.target.value})} /></div>
                </div>
                <label style={labelStyle}>Location</label>
                <input style={inputStyle} value={trialForm.location} onChange={e => setTrialForm({...trialForm, location:e.target.value})} placeholder="Venue, City, TX" />
                <label style={labelStyle}>Level / Classes</label>
                <input style={inputStyle} value={trialForm.level} onChange={e => setTrialForm({...trialForm, level:e.target.value})} placeholder="e.g. NW1/NW2/NW3, Novice A, All levels" />
                <label style={labelStyle}>Notes</label>
                <textarea style={{...inputStyle, height:56}} value={trialForm.notes} onChange={e => setTrialForm({...trialForm, notes:e.target.value})} placeholder="Entry link, contact email, special notes…" />
                <div style={{ display:"flex", gap:8, marginTop:12 }}>
                  <button type="submit" style={btnStyle("#7c3aed")}>💾 Save for Everyone</button>
                  {editingTrialId && <button type="button" onClick={()=>{setEditingTrialId(null);setAdminTab("list");}} style={btnStyle("#aaa")}>Cancel</button>}
                </div>
              </form>
            )}

            {adminTab === "seed" && !editingTrialId && (
              <div style={formStyle}>
                <div style={formTitle}>🚀 Seed Database</div>
                <p style={{ fontSize:13, color:"#666" }}>Run once when first setting up Firebase. Uploads all {MASTER_TRIALS.length} trials. Safe to re-run.</p>
                <button onClick={seedTrials} style={{ ...btnStyle("#c0392b"), marginTop:8 }}>Upload {MASTER_TRIALS.length} Trials to Firebase</button>
              </div>
            )}

            {adminTab === "list" && !editingTrialId && (
              <div>
                <div style={{ fontWeight:"bold", fontSize:14, marginBottom:10, color:"#5b21b6" }}>All Trials ({trials.length})</div>
                {trials.map(t => (
                  <div key={t.id} style={{ background:ORG_BG[t.org]||"#fff", borderLeft:`4px solid ${ORG_COLORS[t.org]}`, borderRadius:10, padding:"10px 12px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ flex:1, marginRight:8 }}>
                      <div style={{ fontSize:13, fontWeight:"bold" }}>{t.name}</div>
                      <div style={{ fontSize:11, color:"#888" }}>{t.date} · {t.location}</div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <button onClick={()=>{ setEditingTrialId(t.id); setTrialForm({...t}); setAdminTab("add"); window.scrollTo(0,0); }} style={{ ...btnStyle("#3a7bd5",true), padding:"3px 10px", fontSize:11 }}>Edit</button>
                      <button onClick={()=>deleteTrial(t.id)} style={{ ...btnStyle("#c0392b",true), padding:"3px 10px", fontSize:11 }}>Del</button>
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

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#6b21a8,#7c3aed,#06b6d4)", padding:"14px 18px 0", boxShadow:"0 4px 20px rgba(0,0,0,0.25)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {activeDog && photos[activeDog.id]
              ? <img src={photos[activeDog.id]} alt="" style={{ width:36, height:36, borderRadius:18, objectFit:"cover", border:"2px solid #ede9fe" }} />
              : <div style={{ fontSize:28 }}>🐾</div>
            }
            <div>
              <div style={{ color:"#e0f2fe", fontSize:17, fontWeight:"bold" }}>NoseWork Notebook</div>
              <div style={{ color:"#a5f3fc", fontSize:11 }}>
                {activeDog?.callName || "Set up your dog"} · TX/OK/LA
                {dogs.length > 1 && <span style={{ marginLeft:6, opacity:0.7 }}>· {dogs.length} dogs</span>}
              </div>
            </div>
          </div>
          <button onClick={() => setShowAdmin(true)} style={{ background:"transparent", border:"none", color:"#a5f3fc", fontSize:22, cursor:"pointer", padding:4 }}>⚙️</button>
        </div>
        <div style={{ display:"flex", gap:2, overflowX:"auto" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ background:tab===t?"rgba(255,255,255,0.25)":"transparent", color:tab===t?"#fff":"rgba(255,255,255,0.7)", border:"none", borderRadius:"8px 8px 0 0", padding:"7px 10px", fontSize:11, fontWeight:tab===t?"bold":"normal", cursor:"pointer", whiteSpace:"nowrap" }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:"16px 14px", maxWidth:700, margin:"0 auto" }}>

        {/* DASHBOARD */}
        {tab === "Dashboard" && (
          <div>
            {deadlineSoon.length > 0 && (
              <div style={{ background:"#fff3cd", border:"1px solid #e0a800", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
                <div style={{ fontWeight:"bold", color:"#7a5500", marginBottom:6 }}>⚠️ Entry Deadlines Soon</div>
                {deadlineSoon.map(t => (
                  <div key={t.id} style={{ fontSize:13, color:"#5a3e00", display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span>{t.name.split("–")[0].trim()} <OrgBadge org={t.org} /></span>
                    <b>{daysUntil(t.entryDeadline)}</b>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:18 }}>
              <StatCard label="Entered" value={Object.values(dogRegs).filter(Boolean).length} icon="📋" />
              <StatCard label="Titles" value={titlesEarned.length} icon="🏆" />
              <StatCard label="Upcoming" value={upcoming.length} icon="📅" />
            </div>
            {upcoming[0] && (
              <div style={{ background:ORG_BG[upcoming[0].org]||"#fff", borderRadius:12, padding:16, marginBottom:16, borderLeft:`5px solid ${ORG_COLORS[upcoming[0].org]}`, boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize:10, color:"#999", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Next Trial</div>
                <div style={{ fontWeight:"bold", fontSize:15 }}>{upcoming[0].name}</div>
                <div style={{ fontSize:13, color:"#666", marginTop:5, display:"flex", gap:10, flexWrap:"wrap" }}>
                  <span>📅 {upcoming[0].date}</span>
                  <span>📍 {upcoming[0].location}</span>
                  <span style={{ color:dogRegs[upcoming[0].id]?"#27ae60":"#e07b39", fontWeight:"bold" }}>{dogRegs[upcoming[0].id]?"✓ Entered":"Not Entered"}</span>
                </div>
              </div>
            )}
            {trialsLoading && <div style={{ textAlign:"center", color:"#bbb", fontSize:13, padding:16 }}>Syncing calendar…</div>}
            <div style={{ fontWeight:"bold", fontSize:14, marginBottom:10, color:"#5b21b6" }}>Recent Results — {activeDog?.callName}</div>
            {myResults.length === 0
              ? <div style={{ color:"#bbb", fontSize:13 }}>No results yet — go sniff some stuff! 🐾</div>
              : myResults.slice(-3).reverse().map(r => <ResultRow key={r.id} r={r} />)
            }
          </div>
        )}

        {/* TRIALS */}
        {tab === "Trials" && (
          <div>
            <OrgFilter value={filterOrg} onChange={setFilterOrg} />
            <div style={{ fontSize:11, color:"#bbb", margin:"6px 0 12px", textAlign:"right" }}>{trialsLoading ? "⏳ Syncing…" : `${filtered.length} trials · live calendar`}</div>
            {filtered.map(t => (
              <div key={t.id} style={{ background:ORG_BG[t.org]||"#fff", borderRadius:12, padding:14, marginBottom:10, borderLeft:`5px solid ${ORG_COLORS[t.org]}`, boxShadow:"0 1px 6px rgba(0,0,0,0.05)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ flex:1, marginRight:8 }}>
                    <div style={{ fontWeight:"bold", fontSize:14 }}>{t.name}</div>
                    <div style={{ fontSize:11, color:"#888", marginTop:2 }}><OrgBadge org={t.org} /> · {t.level}</div>
                    <div style={{ fontSize:12, color:"#555", marginTop:5 }}>📅 <b>{t.date}</b> · 📍 {t.location}</div>
                    {t.entryDeadline && <div style={{ fontSize:11, color:new Date(t.entryDeadline)<today?"#c0392b":"#e07b39", marginTop:3 }}>📌 Deadline: {t.entryDeadline} · {daysUntil(t.entryDeadline)}</div>}
                    {t.notes && <div style={{ fontSize:11, color:"#999", marginTop:4, fontStyle:"italic" }}>{t.notes}</div>}
                  </div>
                  <button onClick={() => toggleReg(t.id)} style={{ background:dogRegs[t.id]?"#e8f8ee":"#fff8f0", color:dogRegs[t.id]?"#27ae60":"#e07b39", border:`1px solid ${dogRegs[t.id]?"#27ae60":"#e07b39"}`, borderRadius:20, padding:"4px 12px", fontSize:12, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
                    {dogRegs[t.id] ? "✓ In" : "Enter?"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* RESULTS */}
        {tab === "Results" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <OrgFilter value={filterOrg} onChange={setFilterOrg} />
              <button onClick={() => setShowResultForm(!showResultForm)} style={btnStyle("#7c3aed")}>+ Add Result</button>
            </div>
            {showResultForm && (
              <form onSubmit={addResult} style={formStyle}>
                <div style={formTitle}>Log Result — {activeDog?.callName}</div>
                <label style={labelStyle}>Organization</label>
                <select style={inputStyle} value={resultForm.org} onChange={e => setResultForm({...resultForm,org:e.target.value})}>{ORGS.map(o=><option key={o}>{o}</option>)}</select>
                <label style={labelStyle}>Trial Name</label>
                <input required style={inputStyle} value={resultForm.trial} onChange={e => setResultForm({...resultForm,trial:e.target.value})} placeholder="e.g. KCGV May Scent Work Trial" />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div><label style={labelStyle}>Date</label><input required type="date" style={inputStyle} value={resultForm.date} onChange={e=>setResultForm({...resultForm,date:e.target.value})} /></div>
                  <div><label style={labelStyle}>Level</label><input style={inputStyle} value={resultForm.level} onChange={e=>setResultForm({...resultForm,level:e.target.value})} placeholder="Novice A" /></div>
                </div>
                <label style={labelStyle}>Result</label>
                <select style={inputStyle} value={resultForm.result} onChange={e=>setResultForm({...resultForm,result:e.target.value})}>
                  <option>Pass</option><option>NCA</option><option>False Alert</option><option>DNF</option><option>Incomplete</option>
                </select>
                <label style={labelStyle}>Title Earned (if any)</label>
                <input style={inputStyle} value={resultForm.title} onChange={e=>setResultForm({...resultForm,title:e.target.value})} placeholder="e.g. NW1, SBN, SIN…" />
                <label style={labelStyle}>Notes</label>
                <textarea style={{...inputStyle,height:56}} value={resultForm.notes} onChange={e=>setResultForm({...resultForm,notes:e.target.value})} placeholder="How did it go?" />
                <div style={{ display:"flex", gap:8, marginTop:10 }}>
                  <button type="submit" style={btnStyle("#7c3aed")}>Save</button>
                  <button type="button" onClick={()=>setShowResultForm(false)} style={btnStyle("#aaa")}>Cancel</button>
                </div>
              </form>
            )}
            {(filterOrg==="All"?myResults:myResults.filter(r=>r.org===filterOrg)).slice().reverse().map(r => (
              <div key={r.id} style={{ background:ORG_BG[r.org]||"#fff", borderRadius:12, padding:14, marginBottom:10, borderLeft:`5px solid ${ORG_COLORS[r.org]}` }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <div><div style={{ fontWeight:"bold" }}>{r.trial}</div><div style={{ fontSize:12, color:"#888" }}><OrgBadge org={r.org} /> · {r.level} · {r.date}</div></div>
                  <div style={{ textAlign:"right" }}>
                    <span style={{ background:r.result==="Pass"?"#e8f8ee":"#ffeaea", color:r.result==="Pass"?"#27ae60":"#c0392b", borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:"bold" }}>{r.result}</span>
                    {r.title && <div style={{ fontSize:11, color:"#e07b39", fontWeight:"bold", marginTop:4 }}>🏆 {r.title}</div>}
                  </div>
                </div>
                {r.notes && <div style={{ fontSize:12, color:"#777", marginTop:6, fontStyle:"italic" }}>{r.notes}</div>}
              </div>
            ))}
            {myResults.length === 0 && <div style={{ color:"#bbb", fontSize:13, textAlign:"center", marginTop:30 }}>No results logged yet!</div>}
          </div>
        )}

        {/* TITLES */}
        {tab === "Titles" && (
          <div>
            <div style={{ fontWeight:"bold", fontSize:16, marginBottom:16, color:"#5b21b6" }}>🏆 {activeDog?.callName}'s Titles</div>
            {ORGS.map(org => {
              const orgTitles = titlesEarned.filter(t => t.org === org);
              return (
                <div key={org} style={{ background:ORG_BG[org], borderRadius:12, padding:16, marginBottom:12, borderLeft:`5px solid ${ORG_COLORS[org]}` }}>
                  <div style={{ fontWeight:"bold", fontSize:14, marginBottom:8 }}><OrgBadge org={org} size={13}/> {org}</div>
                  {orgTitles.length === 0
                    ? <div style={{ color:"#ccc", fontSize:13 }}>No titles yet — you've got this! 🐕</div>
                    : orgTitles.map((t,i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, background:"rgba(255,255,255,0.6)", borderRadius:8, padding:"8px 12px" }}>
                          <span style={{ fontSize:20 }}>🏅</span>
                          <div><div style={{ fontWeight:"bold" }}>{t.title}</div><div style={{ fontSize:11, color:"#888" }}>{t.trial} · {t.date}</div></div>
                        </div>
                      ))
                  }
                </div>
              );
            })}
          </div>
        )}

        {/* MY DOGS */}
        {tab === "My Dogs" && (
          <div>
            {dogs.length > 1 && (
              <div style={{ display:"flex", gap:8, marginBottom:16, overflowX:"auto", paddingBottom:4 }}>
                {dogs.map(d => (
                  <button key={d.id} onClick={() => setActiveDogId(d.id)} style={{ background:activeDogId===d.id?"#7c3aed":"#e9d5ff", color:activeDogId===d.id?"#fff":"#7c3aed", border:"none", borderRadius:20, padding:"6px 16px", fontSize:13, cursor:"pointer", whiteSpace:"nowrap", fontWeight:activeDogId===d.id?"bold":"normal" }}>
                    {d.callName||"Unnamed"}
                  </button>
                ))}
              </div>
            )}

            {activeDog && (editingDogId === activeDog.id ? (
              <form onSubmit={saveDog} style={formStyle}>
                <div style={formTitle}>Edit {dogForm.callName||"Dog"}</div>
                <label style={labelStyle}>Call Name *</label>
                <input required style={inputStyle} value={dogForm.callName||""} onChange={e=>setDogForm({...dogForm,callName:e.target.value})} />
                <label style={labelStyle}>Registered Name</label>
                <input style={inputStyle} value={dogForm.name||""} onChange={e=>setDogForm({...dogForm,name:e.target.value})} />
                <label style={labelStyle}>Breed</label>
                <input style={inputStyle} value={dogForm.breed||""} onChange={e=>setDogForm({...dogForm,breed:e.target.value})} />
                <label style={labelStyle}>Date of Birth</label>
                <input type="date" style={inputStyle} value={dogForm.dob||""} onChange={e=>setDogForm({...dogForm,dob:e.target.value})} />

                {/* ── Org ID section ── */}
                <div style={{ background:"#f0fdff", borderRadius:10, padding:"12px 14px", marginTop:14, border:"1px solid #ddd6fe" }}>
                  <div style={{ fontWeight:"bold", fontSize:13, color:"#5b21b6", marginBottom:10 }}>Organization IDs</div>
                  {ORG_IDS.map(({ org, key, label, placeholder }) => (
                    <div key={key}>
                      <label style={{ ...labelStyle, display:"flex", alignItems:"center", gap:6 }}>
                        <OrgBadge org={org} size={10}/> {label}
                      </label>
                      <input style={inputStyle} placeholder={placeholder} value={dogForm[key]||""} onChange={e=>setDogForm({...dogForm,[key]:e.target.value})} />
                    </div>
                  ))}
                </div>

                <div style={{ display:"flex", gap:8, marginTop:14 }}>
                  <button type="submit" style={btnStyle("#7c3aed")}>Save</button>
                  <button type="button" onClick={()=>setEditingDogId(null)} style={btnStyle("#aaa")}>Cancel</button>
                </div>
              </form>
            ) : (
              <div style={{ background:"#fff", borderRadius:16, padding:20, boxShadow:"0 2px 12px rgba(0,0,0,0.08)" }}>
                {/* Photo + edit button */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                  <div style={{ position:"relative" }}>
                    {photos[activeDog.id]
                      ? <img src={photos[activeDog.id]} alt="" style={{ width:88, height:88, borderRadius:44, objectFit:"cover", border:"3px solid #e9d5ff", boxShadow:"0 2px 8px rgba(0,0,0,0.12)" }} />
                      : <div style={{ width:88, height:88, borderRadius:44, background:"#e9d5ff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:38 }}>🐕</div>
                    }
                    <label style={{ position:"absolute", bottom:0, right:0, background:"#7c3aed", borderRadius:20, padding:"3px 8px", fontSize:11, color:"#fff", cursor:"pointer" }}>
                      📷
                      <input type="file" accept="image/*" style={{ display:"none" }} onChange={e => {
                        const f = e.target.files[0]; if(!f) return;
                        const r = new FileReader(); r.onload = ev => setPhotos(p=>({...p,[activeDog.id]:ev.target.result})); r.readAsDataURL(f);
                      }} />
                    </label>
                  </div>
                  <button onClick={()=>{ setEditingDogId(activeDog.id); setDogForm({...activeDog}); }} style={btnStyle("#7c3aed",true)}>Edit</button>
                </div>

                {/* Name & basics */}
                <div style={{ fontSize:20, fontWeight:"bold", color:"#5b21b6" }}>{activeDog.name || activeDog.callName}</div>
                {activeDog.name && activeDog.callName && <div style={{ color:"#888", fontSize:14, marginTop:2 }}>"{activeDog.callName}"</div>}
                {activeDog.breed && <div style={{ color:"#777", fontSize:13, marginTop:2 }}>{activeDog.breed}</div>}
                {activeDog.dob && <div style={{ fontSize:13, color:"#666", marginTop:4 }}>🎂 DOB: {activeDog.dob}</div>}

                {/* Org ID cards — 2x2 grid */}
                <div style={{ marginTop:16, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {ORG_IDS.map(({ org, key, label }) => {
                    const val = activeDog[key];
                    return (
                      <div key={key} style={{ background:ORG_BG[org], borderRadius:10, padding:"10px 12px", borderLeft:`3px solid ${ORG_COLORS[org]}` }}>
                        <div style={{ fontSize:10, color:ORG_COLORS[org], fontWeight:"bold", marginBottom:2 }}>{org}</div>
                        <div style={{ fontSize:13, fontWeight:"bold", color:"#5b21b6" }}>{val || <span style={{ color:"#ccc", fontWeight:"normal", fontSize:12 }}>Not set</span>}</div>
                        <div style={{ fontSize:9, color:"#bbb", marginTop:2 }}>{label}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Stats */}
                <div style={{ marginTop:16, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                  <StatCard label="Entered" value={Object.values(dogRegs).filter(Boolean).length} icon="📋" small />
                  <StatCard label="Results" value={myResults.length} icon="✅" small />
                  <StatCard label="Titles" value={titlesEarned.length} icon="🏆" small />
                </div>

                {/* Delete dog */}
                {dogs.length > 1 && (
                  deleteConfirm === activeDog.id ? (
                    <div style={{ marginTop:16, background:"#fff0f0", borderRadius:10, padding:12, border:"1px solid #ffcccc" }}>
                      <div style={{ fontSize:13, color:"#c0392b", marginBottom:8 }}>Remove {activeDog.callName}?</div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={()=>deleteDog(activeDog.id)} style={btnStyle("#c0392b")}>Yes, Remove</button>
                        <button onClick={()=>setDeleteConfirm(null)} style={btnStyle("#aaa")}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={()=>setDeleteConfirm(activeDog.id)} style={{ ...btnStyle("#c0392b",true), marginTop:16, fontSize:12, padding:"6px 14px" }}>Remove this dog</button>
                  )
                )}
              </div>
            ))}

            <button onClick={addDog} style={{ ...btnStyle("#7c3aed",true), width:"100%", marginTop:14, padding:12, fontSize:14 }}>+ Add Another Dog</button>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────
function OrgBadge({ org, size=11 }) {
  return <span style={{ background:(ORG_COLORS[org]||"#999")+"22", color:ORG_COLORS[org]||"#999", borderRadius:20, padding:"2px 8px", fontSize:size, fontWeight:"bold", display:"inline-block" }}>{org}</span>;
}
function StatCard({ label, value, icon, small }) {
  return (
    <div style={{ background:"#f0fdff", borderRadius:10, padding:small?"10px 8px":"14px 10px", textAlign:"center", border:"1px solid #ddd6fe" }}>
      <div style={{ fontSize:small?20:26 }}>{icon}</div>
      <div style={{ fontWeight:"bold", fontSize:small?18:22, color:"#5b21b6" }}>{value}</div>
      <div style={{ fontSize:10, color:"#999", marginTop:2 }}>{label}</div>
    </div>
  );
}
function ResultRow({ r }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #ddd6fe" }}>
      <div><div style={{ fontSize:14, fontWeight:"bold" }}>{r.trial}</div><div style={{ fontSize:12, color:"#888" }}><OrgBadge org={r.org}/> · {r.date}</div></div>
      <div style={{ textAlign:"right" }}>
        <span style={{ background:r.result==="Pass"?"#e8f8ee":"#ffeaea", color:r.result==="Pass"?"#27ae60":"#c0392b", borderRadius:20, padding:"2px 10px", fontSize:11 }}>{r.result}</span>
        {r.title && <div style={{ fontSize:11, color:"#e07b39", fontWeight:"bold", marginTop:2 }}>🏆 {r.title}</div>}
      </div>
    </div>
  );
}
function OrgFilter({ value, onChange }) {
  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
      {["All",...ORGS].map(o => (
        <button key={o} onClick={()=>onChange(o)} style={{ background:value===o?"#7c3aed":"#e9d5ff", color:value===o?"#fff":"#7c3aed", border:"none", borderRadius:20, padding:"4px 12px", fontSize:12, cursor:"pointer" }}>{o}</button>
      ))}
    </div>
  );
}

const inputStyle = { width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #ddd", fontSize:14, boxSizing:"border-box", marginBottom:2, background:"#fafafa" };
const labelStyle = { fontSize:12, color:"#666", display:"block", marginBottom:4, marginTop:8 };
const formStyle  = { background:"#fff", borderRadius:14, padding:18, marginBottom:18, boxShadow:"0 2px 12px rgba(0,0,0,0.08)", border:"1px solid #ddd6fe" };
const formTitle  = { fontWeight:"bold", fontSize:15, marginBottom:8, color:"#5b21b6" };
function btnStyle(bg, outline=false) {
  if (!outline && bg === "#7c3aed") {
    return { background:"linear-gradient(135deg,#7c3aed,#06b6d4)", color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:"bold", cursor:"pointer" };
  }
  return { background:outline?"transparent":bg, color:outline?bg:"#fff", border:outline?`2px solid ${bg}`:"none", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:"bold", cursor:"pointer" };
}
