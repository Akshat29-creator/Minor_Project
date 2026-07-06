"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity, Target, AlertTriangle, Upload, Crosshair, Terminal, Waves,
  Battery, Thermometer, Download, ShieldCheck, Play, Square, X, Sun,
  Moon, BarChart2, Clock, MessageSquare, ChevronLeft, ChevronRight, Zap
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type ScanData = { id: string; url: string; size: { w: number; h: number } | null; targets: any[] };

export default function AbyssalDashboard() {
  // ── existing state ──
  const [isScanning, setIsScanning] = useState(false);
  const [scans, setScans] = useState<ScanData[]>([]);
  const [viewMode, setViewMode] = useState<"RADAR" | "RAW">("RADAR");
  const [dispatchedTargets, setDispatchedTargets] = useState<Record<string, boolean>>({});
  const [wClass, setWClass] = useState(0.5);
  const [wDist, setWDist] = useState(0.3);
  const [wAngle, setWAngle] = useState(0.2);
  const [systemLogs, setSystemLogs] = useState<string[]>([
    "[SYSTEM] Awaiting Sonar Initialization...",
    "[SYSTEM] Abyssal Core v3.0 Online. Multi-Target Tracking + TTA Uncertainty Enabled.",
  ]);
  // ── new state ──
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoIntervalId, setDemoIntervalId] = useState<ReturnType<typeof setInterval> | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [annotations, setAnnotations] = useState<Record<string, string>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [isDayMode, setIsDayMode] = useState(false);
  const [missionStartTime, setMissionStartTime] = useState<number | null>(null);
  const [missionTime, setMissionTime] = useState("00:00:00");
  const [activeFrameIdx, setActiveFrameIdx] = useState(-1);
  // ── feature #1: ROV dispatch counter ──
  const [rovDispatchCount, setRovDispatchCount] = useState(0);
  // ── feature #2: Priority history per trackId for sparklines ──
  const [priorityHistory, setPriorityHistory] = useState<Record<string, number[]>>({});
  // ── feature #3: Session replay ──
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayIntervalId, setReplayIntervalId] = useState<ReturnType<typeof setInterval> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const redAlertFiredRef = useRef(false);
  const scansRef = useRef<ScanData[]>([]);
  scansRef.current = scans;

  // ── derived ──
  const CLASS_PRIORITY_SCORES: Record<string, number> = {
    "HUMAN BODY": 100, ROV: 90, PLANE: 80, CUBE: 30, BALL: 20,
    "SQUARE CAGE": 15, "CIRCLE CAGE": 15, CYLINDER: 10, "METAL BUCKET": 5, TYRE: 5,
  };
  const allTargets = scans.flatMap((s) => s.targets).map((tgt) => {
    const cs = (CLASS_PRIORITY_SCORES[tgt.class] || 10) / 100;
    const nd = Math.max(0, Math.min(1, (10 - tgt.distance_m) / 10));
    const na = Math.max(0, Math.min(1, 1 - Math.abs(tgt.bearing_deg) / 65));
    return { ...tgt, priority_score: Number(((cs * wClass + nd * wDist + na * wAngle) * 10).toFixed(2)) };
  });
  const sortedQueue = [...allTargets].sort((a, b) => {
    if (a.class === "HUMAN BODY" && b.class !== "HUMAN BODY") return -1;
    if (b.class === "HUMAN BODY" && a.class !== "HUMAN BODY") return 1;
    return b.priority_score - a.priority_score;
  });
  const isRedAlert = allTargets.some((t) => t.class === "HUMAN BODY");
  const humanCount = allTargets.filter((t) => t.class === "HUMAN BODY").length;
  const criticalCount = allTargets.filter((t) => t.priority_score >= 7.5).length;
  const avgPriority = allTargets.length ? allTargets.reduce((a, b) => a + b.priority_score, 0) / allTargets.length : 0;

  // ── frame-specific navigation ──
  const isAllView = activeFrameIdx === -1;
  const activeScan = isAllView ? null : scans[activeFrameIdx];
  const frameTargets = isAllView ? allTargets : allTargets.filter((t) => t.frame_idx === activeFrameIdx);
  const sortedFrameQueue = [...frameTargets].sort((a, b) => {
    if (a.class === "HUMAN BODY" && b.class !== "HUMAN BODY") return -1;
    if (b.class === "HUMAN BODY" && a.class !== "HUMAN BODY") return 1;
    return b.priority_score - a.priority_score;
  });
  const frameHumanCount = frameTargets.filter((t) => t.class === "HUMAN BODY").length;
  const frameCritCount = frameTargets.filter((t) => t.priority_score >= 7.5).length;

  // ── feature #4: Class breakdown chart data ──
  const classBreakdown = allTargets.reduce((acc, t) => {
    acc[t.class] = (acc[t.class] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const classBreakdownEntries = (Object.entries(classBreakdown) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxClassCount = Math.max(...classBreakdownEntries.map(([, c]) => c as number), 1);

  // ── Priority history updater (runs whenever new scans arrive) ──
  useEffect(() => {
    const newHistory: Record<string, number[]> = { ...priorityHistory };
    allTargets.forEach((t) => {
      const key = t.track_id || t.id;
      if (!newHistory[key]) newHistory[key] = [];
      const last = newHistory[key][newHistory[key].length - 1];
      if (last !== t.priority_score) newHistory[key] = [...(newHistory[key] || []).slice(-9), t.priority_score];
    });
    setPriorityHistory(newHistory);
  }, [allTargets.length]);

  // ── mission timer ──
  useEffect(() => {
    if (!missionStartTime) return;
    const iv = setInterval(() => {
      const s = Math.floor((Date.now() - missionStartTime) / 1000);
      setMissionTime(`${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(iv);
  }, [missionStartTime]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [systemLogs]);
  useEffect(() => { 
    if (scans.length > 0 && activeFrameIdx !== -1) {
        setActiveFrameIdx(Math.max(0, scans.length - 1)); 
    }
  }, [scans.length]);

  // ── audio ──
  const initAudio = () => {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
  };
  const playSonarPing = () => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine"; osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
    osc.start(); osc.stop(ctx.currentTime + 1.5);
  };
  const playRedAlert = () => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "square"; osc.frequency.setValueAtTime(300, t); osc.frequency.setValueAtTime(450, t + 0.5);
      gain.gain.setValueAtTime(0.1, t); gain.gain.setValueAtTime(0, t + 0.9);
      osc.start(t); osc.stop(t + 1);
    }
  };

  const addLog = (msg: string) =>
    setSystemLogs((prev) => [...prev.slice(-30), `[${new Date().toLocaleTimeString("en-US", { hour12: false })}] ${msg}`]);

  // ── export ──
  const exportMissionLog = () => {
    const headers = ["ID", "TrackID", "Class", "Confidence(%)", "Uncertainty(%)", "Dist(m)", "Bearing(deg)", "Priority", "Note", "Status"];
    const rows = allTargets.map((t) => [
      t.id, t.track_id || "N/A", t.class,
      t.confidence?.toFixed(1), t.confidence_uncertainty?.toFixed(2) || "0.00",
      t.distance_m?.toFixed(2), t.bearing_deg?.toFixed(2), t.priority_score?.toFixed(2),
      `"${annotations[t.id] || ""}"`,
      dispatchedTargets[t.id] ? "DISPATCHED" : "UNTRACKED",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `Mission_Log_${Date.now()}.csv`;
    a.click();
    addLog("[SYSTEM] Mission Log Exported.");
  };

  // ── save session ──
  const saveSession = async () => {
    try {
      await fetch("http://localhost:8000/api/sessions/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: allTargets, frame_count: scans.length }),
      });
      addLog("[SESSION] Mission data saved to database.");
    } catch { addLog("[ERROR] Failed to save session."); }
  };

  // ── file upload processing ──
  const getImageDimensions = (url: string): Promise<{ w: number; h: number }> =>
    new Promise((res) => {
      const img = new window.Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => res({ w: 512, h: 512 });
      img.src = url;
    });

  const processImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    initAudio(); setIsScanning(true); setScans([]); redAlertFiredRef.current = false;
    setMissionStartTime(Date.now());
    const files = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name));
    addLog(`[UPLINK] Receiving ${files.length} sonar image(s)...`);
    const incoming: ScanData[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      const scanId = `FRM-${i.toString().padStart(3, "0")}`;
      const form = new FormData();
      form.append("file", file); form.append("w_class", String(wClass));
      form.append("w_dist", String(wDist)); form.append("w_angle", String(wAngle));
      try {
        const res = await fetch("http://localhost:8000/api/detect", { method: "POST", body: form });
        const data = await res.json();
        if (data.status === "success") {
          const targets = data.targets.map((t: any) => ({ ...t, id: `${scanId}-${t.id}`, frame_idx: i }));
          if (targets.some((t: any) => t.class === "HUMAN BODY") && !redAlertFiredRef.current) {
            addLog(`[CRITICAL] HUMAN TARGET AT FRAME ${i}! RED ALERT.`); playRedAlert(); redAlertFiredRef.current = true;
          } else { playSonarPing(); }
          const size = await getImageDimensions(url);
          incoming.push({ id: scanId, url, size, targets });
          setScans([...incoming]);
        }
      } catch { addLog(`[ERROR] Frame ${i} failed.`); }
      await new Promise((r) => setTimeout(r, 800));
    }
    addLog(`[VISION] Scan complete. ${incoming.flatMap((s) => s.targets).length} objects detected.`);
    setIsScanning(false);
  };

  // ── DEMO MODE ──
  const runSimFrame = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:8000/api/simulate?w_class=${wClass}&w_dist=${wDist}&w_angle=${wAngle}`);
      const data = await res.json();
      if (data.status === "success") {
        const scanId = `SIM-${Date.now().toString().slice(-5)}`;
        const url = `data:image/jpeg;base64,${data.image_b64}`;
        const targets = data.targets.map((t: any, i: number) => ({
          ...t, id: `${scanId}-${t.id}`, frame_idx: scansRef.current.length,
        }));
        if (targets.some((t: any) => t.class === "HUMAN BODY") && !redAlertFiredRef.current) {
          addLog(`[CRITICAL] HUMAN BODY in ${data.frame_name}!`); playRedAlert(); redAlertFiredRef.current = true;
        } else { playSonarPing(); }
        const size = await getImageDimensions(url);
        setScans((prev) => [...prev.slice(-12), { id: scanId, url, size, targets }]);
        addLog(`[SIM] ${data.frame_name} → ${targets.length} targets`);
      }
    } catch { addLog("[ERROR] Simulate API error. Is backend running on :8000?"); }
  }, [wClass, wDist, wAngle]);

  const startDemo = () => {
    initAudio(); setScans([]); redAlertFiredRef.current = false; setActiveFrameIdx(-1);
    setIsDemoMode(true); setMissionStartTime(Date.now());
    addLog("[DEMO] Simulation Mode Active — Cycling UATD dataset...");
    runSimFrame();
    const id = setInterval(runSimFrame, 2500);
    setDemoIntervalId(id);
  };

  const stopDemo = () => {
    if (demoIntervalId) { clearInterval(demoIntervalId); setDemoIntervalId(null); }
    setIsDemoMode(false);
    addLog("[DEMO] Simulation stopped.");
    saveSession();
  };

  // ── Feature #3: Session Replay ──
  const startReplay = () => {
    if (scans.length < 2) return;
    setIsReplaying(true);
    setActiveFrameIdx(0);
    addLog("[REPLAY] Mission replay started.");
    let idx = 0;
    const id = setInterval(() => {
      idx++;
      if (idx >= scans.length) {
        clearInterval(id); setReplayIntervalId(null); setIsReplaying(false);
        setActiveFrameIdx(-1);
        addLog("[REPLAY] Replay complete.");
        return;
      }
      setActiveFrameIdx(idx);
    }, 1200);
    setReplayIntervalId(id);
  };

  const stopReplay = () => {
    if (replayIntervalId) { clearInterval(replayIntervalId); setReplayIntervalId(null); }
    setIsReplaying(false);
    setActiveFrameIdx(-1);
    addLog("[REPLAY] Replay stopped.");
  };

  // ── Feature #1: ROV dispatch wrapper ──
  const dispatchROV = (tgtId: string, cls: string, dist: string) => {
    initAudio();
    setDispatchedTargets((p) => ({ ...p, [tgtId]: true }));
    setRovDispatchCount((n) => n + 1);
    addLog(`[ACTION] ROV #${rovDispatchCount + 1} dispatched → ${cls} at ${dist}m`);
  };

  // ── theme ──
  const bg = isDayMode ? "bg-[#1a2030]" : "bg-[#0a0f14]";
  const panelBg = isDayMode ? "bg-[rgba(30,40,60,0.85)]" : "";

  // ── JSX ──
  return (
    <div className={`h-screen w-screen overflow-hidden p-4 flex flex-col gap-3 text-[var(--color-text-primary)] transition-all duration-700 ${isRedAlert ? "alert-active bg-[rgba(25,0,0,0.85)]" : bg}`}>

      {/* ── HEADER ── */}
      <header className={`glass-panel ${panelBg} p-3 shrink-0 flex items-center justify-between ${isRedAlert ? "border-[rgba(255,0,0,0.4)]" : ""}`}>
        <div className="flex items-center gap-4">
          <Crosshair className={`w-8 h-8 ${isRedAlert ? "text-[#ff5555] animate-spin" : "text-[var(--color-neon-cyan)]"}`} />
          <div>
            <h1 className="text-xl font-bold tracking-widest text-[#e6ebf4]">ABYSSAL NAVIGATOR <span className="text-xs opacity-40 ml-2">SRM INSTITUTE</span></h1>
            <p className={`text-[10px] tracking-[0.2em] font-mono uppercase ${isRedAlert ? "text-[#ff5555]" : "text-[var(--color-text-muted)]"}`}>
              DEEP-SEA RESCUE · TACTICAL ANALYSIS · TTA UNCERTAINTY ENGINE
            </p>
          </div>
        </div>

        {/* Stats row in header */}
        <div className="flex gap-5 items-center">
          <div className="hidden lg:flex gap-4 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-[var(--color-text-muted)]"><Clock className="w-3 h-3" />{missionTime}</span>
            <span className="flex items-center gap-1 text-[#ff5555]"><Target className="w-3 h-3" />{humanCount} HUM</span>
            <span className="flex items-center gap-1 text-[var(--color-safety-orange)]"><Zap className="w-3 h-3" />{criticalCount} CRIT</span>
            <span className="flex items-center gap-1 text-[var(--color-neon-cyan)]"><BarChart2 className="w-3 h-3" />AVG {avgPriority.toFixed(1)}</span>
            {/* Feature #1: ROV Dispatch Counter */}
            <span className="flex items-center gap-1 text-[#00ffaa] border border-[#00ffaa33] px-1.5 rounded font-bold">
              <ShieldCheck className="w-3 h-3" />ROV × {rovDispatchCount}
            </span>
          </div>
          <div className="flex flex-col text-right font-mono text-[10px] text-[var(--color-text-muted)]">
            <span className="flex items-center justify-end gap-1"><Waves className="w-3 h-3"/>DEPTH: 4,281.5m</span>
            <span className="flex items-center justify-end gap-1"><Thermometer className="w-3 h-3"/>TEMP: 2.1°C</span>
          </div>
          <div className="flex flex-col text-right font-mono text-[10px] text-[var(--color-text-muted)]">
            <span className="flex items-center justify-end gap-1"><Activity className="w-3 h-3"/>PRES: 428.4 BAR</span>
            <span className="flex items-center justify-end gap-1"><Battery className="w-3 h-3 text-[var(--color-neon-cyan)]"/>PWR: 87%</span>
          </div>
          {/* Day/Night toggle */}
          <button onClick={() => setIsDayMode(!isDayMode)} className="p-2 rounded-full border border-[rgba(255,255,255,0.1)] hover:border-[var(--color-neon-cyan)] transition-colors cursor-pointer" title="Toggle Day/Night Mode">
            {isDayMode ? <Sun className="w-4 h-4 text-yellow-400"/> : <Moon className="w-4 h-4 text-[var(--color-neon-cyan)]"/>}
          </button>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-full border ${isRedAlert ? "bg-[rgba(200,0,0,0.2)] border-red-500" : "bg-[var(--color-abyss-panel)] border-[rgba(255,255,255,0.05)]"}`}>
            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${isRedAlert ? "bg-red-500 shadow-[0_0_12px_red]" : "bg-[var(--color-neon-cyan)] shadow-[0_0_8px_var(--color-neon-cyan)]"}`}/>
            <span className={`text-xs font-mono tracking-widest ${isRedAlert ? "text-red-500" : "text-[var(--color-neon-cyan)]"}`}>{isRedAlert ? "RED ALERT" : (isDemoMode ? "DEMO" : "LIVE")}</span>
          </div>
        </div>
      </header>

      {/* ── MAIN GRID ── */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3">

        {/* LEFT: Triage Weights + Stats + Target List */}
        <div className={`col-span-3 glass-panel ${panelBg} p-4 flex flex-col gap-3 overflow-hidden ${isRedAlert ? "border-[rgba(255,0,0,0.2)]" : ""}`}>

          {/* Triage weights */}
          <div className="shrink-0 flex flex-col gap-1.5 pb-3 border-b border-[rgba(255,255,255,0.05)]">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-neon-cyan)] flex justify-between">
              <span>TRIAGE WEIGHTS</span><span className="text-[8px] text-[var(--color-text-muted)]">EQ.3</span>
            </h2>
            {[["CLASS (α)", wClass, setWClass], ["PROXIMITY (β)", wDist, setWDist], ["BEARING (γ)", wAngle, setWAngle]].map(([label, val, setter]: any) => (
              <div key={String(label)}>
                <div className="flex justify-between text-[9px] font-mono text-[var(--color-text-muted)]">
                  <span>{label}</span><span className="text-white">{Number(val).toFixed(2)}</span>
                </div>
                <input type="range" min="0" max="1" step="0.05" value={val} onChange={(e) => setter(Number(e.target.value))} className="w-full h-1 bg-[rgba(255,255,255,0.1)] appearance-none rounded"/>
              </div>
            ))}
          </div>

          {/* Mission stats mini-panel (Frame-specific) */}
          <div className="shrink-0 grid grid-cols-2 gap-1.5 pb-3 border-b border-[rgba(255,255,255,0.05)]">
            {[
              { label: "FRAME OBJ", value: frameTargets.length, color: "text-[var(--color-neon-cyan)]" },
              { label: "FRAME HUM", value: frameHumanCount, color: "text-[#ff5555]" },
              { label: "FRAME CRIT", value: frameCritCount, color: "text-[var(--color-safety-orange)]" },
              { label: "SESSION TOTAL", value: allTargets.length, color: "text-[#ffd700]" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[rgba(0,0,0,0.3)] rounded p-1.5 text-center">
                <div className={`text-base font-bold font-mono ${color}`}>{value}</div>
                <div className="text-[8px] text-[var(--color-text-muted)] tracking-widest">{label}</div>
              </div>
            ))}
          </div>

          {/* Feature #5: Class Breakdown Bar Chart */}
          {classBreakdownEntries.length > 0 && (
            <div className="shrink-0 pb-3 border-b border-[rgba(255,255,255,0.05)]">
              <h2 className="text-[9px] uppercase tracking-[0.2em] text-[var(--color-text-muted)] mb-2">CLASS DISTRIBUTION</h2>
              <div className="space-y-1">
                {classBreakdownEntries.map(([cls, cnt]) => {
                  const pct = (cnt / maxClassCount) * 100;
                  const isCrit = cls === "HUMAN BODY";
                  return (
                    <div key={cls}>
                      <div className="flex justify-between text-[8px] font-mono text-[var(--color-text-muted)] mb-0.5">
                        <span className={isCrit ? "text-[#ff5555]" : ""}>{cls}</span><span>{cnt}</span>
                      </div>
                      <div className="w-full bg-[rgba(255,255,255,0.05)] rounded-full h-1">
                        <div className="h-1 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: isCrit ? "#ff5555" : "var(--color-neon-cyan)" }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Target list */}
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-muted)] shrink-0 flex items-center justify-between">
            <span className="flex items-center gap-1"><Target className="w-3 h-3"/> OBJECTS ({frameTargets.length})</span>
            {allTargets.length > 0 && (
              <button onClick={exportMissionLog} className="text-[var(--color-neon-cyan)] hover:text-white transition-colors cursor-pointer" title="Export CSV">
                <Download className="w-3 h-3"/>
              </button>
            )}
          </h2>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {frameTargets.length === 0 && !isScanning && (
              <div className="text-xs text-[var(--color-text-muted)] text-center py-8 font-mono animate-pulse">NO TARGETS IN FRAME</div>
            )}
            {frameTargets.map((tgt, i) => {
              const isCrit = tgt.class === "HUMAN BODY";
              const isDisp = dispatchedTargets[tgt.id];
              return (
                <motion.div key={tgt.id} initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                  onClick={() => setSelectedTarget(tgt)}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${isDisp ? "bg-[rgba(0,255,0,0.08)] border-[#00ffaa]" : isCrit ? "bg-[rgba(255,0,0,0.08)] border-[#ff5555]" : "bg-[#1e272f] border-[rgba(255,255,255,0.03)] hover:border-[var(--color-neon-cyan)]"}`}>
                  <div className="flex justify-between mb-1">
                    <span className={`text-[9px] font-mono ${isCrit ? "text-[#ffaa55]" : "text-[var(--color-neon-cyan)]"}`}>{tgt.track_id || tgt.id}</span>
                    <span className="text-[9px] bg-[rgba(0,0,0,0.4)] px-1 rounded font-mono">{tgt.confidence?.toFixed(1)}%
                      {tgt.confidence_uncertainty > 0 && <span className="text-[var(--color-text-muted)]">±{tgt.confidence_uncertainty?.toFixed(1)}</span>}
                    </span>
                  </div>
                  <h3 className="font-bold text-xs tracking-wide">{isDisp ? "✓ SECURED" : tgt.class}</h3>
                  <div className="flex justify-between text-[9px] text-[var(--color-text-muted)] font-mono mt-1">
                    <span>{tgt.distance_m?.toFixed(1)}m</span><span>{tgt.bearing_deg?.toFixed(1)}°</span>
                    <span className="text-[var(--color-safety-orange)]">P:{tgt.priority_score}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* CENTER: Sonar Visualizer */}
        <div className={`col-span-6 glass-panel ${panelBg} flex flex-col items-center justify-center relative overflow-hidden ${isRedAlert ? "border-[rgba(255,0,0,0.3)] shadow-[0_0_60px_rgba(255,0,0,0.08)]" : ""}`}>
          <div className="absolute top-4 left-4 text-[10px] tracking-widest font-mono text-[var(--color-text-muted)] z-20">
            STATUS: <span className={isRedAlert ? "text-red-500" : "text-[var(--color-neon-cyan)]"}>{isDemoMode ? "SIMULATING..." : (isScanning ? "SCANNING..." : "READY")}</span>
          </div>
          {viewMode === "RADAR" && (
            <div className="absolute top-4 right-4 text-[10px] tracking-widest font-mono text-[var(--color-neon-cyan)] z-20 text-right">
              <div>RANGE: 10.0m</div><div>BLIND ZONE: 1.0m</div>
            </div>
          )}
          {/* Optical cam placeholder */}
          {viewMode === "RADAR" && (
            <div className="absolute top-14 right-4 w-36 h-24 border border-[rgba(255,255,255,0.1)] bg-[#050505] z-30 flex flex-col items-center justify-center rounded shadow-xl">
              <Activity className="w-3 h-3 text-[#ff5555] animate-pulse mb-1"/>
              <div className="text-[7px] font-mono text-[#ff5555] tracking-widest text-center">OPTICAL LINK OFFLINE<br/><span className="text-[var(--color-text-muted)]">DEPTH &gt;1000m</span></div>
            </div>
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-4 left-4 z-30 flex gap-2">
            <input type="file" ref={fileInputRef} onChange={processImages} className="hidden" accept="image/*" multiple/>
            <button onClick={() => { initAudio(); fileInputRef.current?.click(); }}
              className={`px-4 py-2 rounded text-[10px] tracking-widest font-mono font-bold transition-all cursor-pointer backdrop-blur-md border ${isRedAlert ? "bg-[rgba(255,0,0,0.2)] text-[#ff5555] border-[#ff5555]" : "bg-[var(--color-neon-cyan-dim)] text-[var(--color-neon-cyan)] border-[var(--color-neon-cyan)] shadow-[0_0_12px_var(--color-neon-cyan-dim)]"}`}>
              <Upload className="w-3 h-3 inline mr-1"/> UPLOAD
            </button>
            {!isDemoMode ? (
              <button onClick={startDemo}
                className="px-4 py-2 rounded text-[10px] tracking-widest font-mono font-bold transition-all cursor-pointer bg-[rgba(100,255,100,0.1)] text-[#00ffaa] border border-[#00ffaa] hover:bg-[#00ffaa] hover:text-black">
                <Play className="w-3 h-3 inline mr-1"/> SIMULATE
              </button>
            ) : (
              <button onClick={stopDemo}
                className="px-4 py-2 rounded text-[10px] tracking-widest font-mono font-bold animate-pulse cursor-pointer bg-[rgba(255,100,0,0.2)] text-[var(--color-safety-orange)] border border-[var(--color-safety-orange)]">
                <Square className="w-3 h-3 inline mr-1"/> STOP SIM
              </button>
            )}
          </div>

          {scans.length > 0 && !isScanning && (
            <div className="absolute bottom-4 right-4 z-20">
              <button onClick={() => { initAudio(); setViewMode(viewMode === "RADAR" ? "RAW" : "RADAR"); }}
                className="px-3 py-1.5 bg-[rgba(19,26,34,0.8)] border border-[rgba(255,255,255,0.2)] rounded text-[10px] tracking-widest text-[#e6ebf4] hover:border-[var(--color-neon-cyan)] transition-colors cursor-pointer font-bold">
                MODE: {viewMode === "RADAR" ? "RAW FEED" : "RADAR"}
              </button>
            </div>
          )}

          {/* Visualizer */}
          <div className="relative w-full h-full flex items-center justify-center bg-[#070b10] overflow-hidden">
            {/* RADAR View */}
            {viewMode === "RADAR" && (
              <div className={`relative w-[440px] h-[440px] border-2 rounded-full flex items-center justify-center overflow-hidden transition-colors ${isRedAlert ? "border-[rgba(255,0,0,0.3)] bg-[rgba(20,0,0,0.4)]" : "border-[rgba(0,229,255,0.2)] bg-[#0d141b]"}`}>
                {[300, 150].map((sz, ri) => (
                  <div key={ri} className={`absolute rounded-full border border-dashed ${isRedAlert ? "border-[rgba(255,0,0,0.25)]" : "border-[rgba(0,229,255,0.2)]"}`}
                    style={{ width: sz, height: sz }}>
                    <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-[8px] font-mono px-0.5 bg-[#0d141b] ${isRedAlert ? "text-[#ff5555]" : "text-[var(--color-text-muted)]"}`}>{ri === 0 ? "6.6m" : "3.3m"}</span>
                  </div>
                ))}
                <div className={`absolute w-full h-px opacity-40 ${isRedAlert ? "bg-[rgba(255,0,0,0.4)]" : "bg-[rgba(0,229,255,0.3)]"}`}/>
                <div className={`absolute h-full w-px opacity-40 ${isRedAlert ? "bg-[rgba(255,0,0,0.4)]" : "bg-[rgba(0,229,255,0.3)]"}`}/>
                <div className={`absolute w-full h-px opacity-15 rotate-45 ${isRedAlert ? "bg-red-500" : "bg-[var(--color-neon-cyan)]"}`}/>
                <div className={`absolute w-full h-px opacity-15 -rotate-45 ${isRedAlert ? "bg-red-500" : "bg-[var(--color-neon-cyan)]"}`}/>
                {/* Optical cam placeholder */}
                {(!isAllView && activeScan) ? (
                    <img src={activeScan.url} className="absolute w-full h-full object-cover opacity-[0.06] mix-blend-screen rounded-full" alt="ctx"/>
                ) : (
                    scans[0] && <img src={scans[0].url} className="absolute w-full h-full object-cover opacity-[0.03] mix-blend-screen rounded-full" alt="ctx"/>
                )}
                {/* Sweep */}
                <div className="absolute w-[880px] h-[880px] -top-[220px] origin-center z-10 pointer-events-none" style={{ animation: "radar-spin 4s linear infinite", background: isRedAlert ? "conic-gradient(from 0deg,transparent 70%,rgba(255,0,0,0.12) 95%,rgba(255,0,0,0.7) 100%)" : "conic-gradient(from 0deg,transparent 70%,rgba(0,229,255,0.12) 95%,rgba(0,229,255,0.7) 100%)", borderRadius: "50%"}}/>
                {/* Blips */}
                {frameTargets.map((tgt) => {
                  const r = (tgt.distance_m / 10) * 440;
                  const rad = (tgt.bearing_deg * Math.PI) / 180;
                  const fx = r * Math.sin(rad), fy = r * Math.cos(rad);
                  const isDisp = dispatchedTargets[tgt.id];
                  const isCrit = tgt.class === "HUMAN BODY";
                  const isHigh = tgt.priority_score >= 7.5 || isCrit;
                  const color = isDisp ? "#00FF00" : isCrit ? "#FF0000" : isHigh ? "#FF5722" : "#00E5FF";
                  return (
                    <motion.div key={`blip-${tgt.id}`} onClick={() => setSelectedTarget(tgt)}
                      initial={{ scale: 0, opacity: 0, x: fx, y: fy }}
                      animate={{ scale: [1, isCrit ? 1.6 : 1.2, 1], opacity: [0.85, 1, 0.85], x: fx, y: fy }}
                      transition={{ duration: isCrit ? 0.7 : 1.4, repeat: Infinity }}
                      className="absolute w-3 h-3 rounded-full z-30 cursor-pointer"
                      style={{ left: "calc(50% - 6px)", top: "-6px", backgroundColor: color, boxShadow: `0 0 ${isHigh ? 24 : 10}px 4px ${color}` }}
                      title={`${tgt.class} — P:${tgt.priority_score}`}>
                      <div className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: color, opacity: 0.7 }}/>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* RAW Feed View */}
            {viewMode === "RAW" && !isAllView && activeScan && (
              <div className="w-full h-full p-4 flex items-center justify-center">
                <div className="relative w-[80%] aspect-square bg-black border border-[rgba(0,229,255,0.35)] rounded-md overflow-hidden shrink-0">
                  <img src={activeScan.url} className="absolute inset-0 w-full h-full object-contain" alt="Sonar"/>
                  <div className="absolute top-0 right-0 px-2 py-1 bg-[rgba(0,229,255,0.35)] text-[10px] font-mono text-white rounded-bl">{activeScan.id}</div>
                  {activeScan.size && activeScan.targets.map((tgt) => {
                    const [x1, y1, x2, y2] = tgt.bbox;
                    const lp = (x1 / activeScan.size!.w) * 100, tp = (y1 / activeScan.size!.h) * 100;
                    const wp = ((x2 - x1) / activeScan.size!.w) * 100, hp = ((y2 - y1) / activeScan.size!.h) * 100;
                    const isDisp = dispatchedTargets[tgt.id];
                    const isCrit = tgt.class === "HUMAN BODY";
                    const color = isDisp ? "#00FF00" : isCrit ? "#FF0000" : tgt.priority_score >= 7.5 ? "#FF5722" : "#00E5FF";
                    const glowRadius = Math.round(Math.max(wp, hp) * 0.6);
                    const conf = tgt.confidence || 50;
                    const heatColor = conf >= 80 ? "#00ff88" : conf >= 60 ? "#ffd700" : "#ff5555";
                    return (
                      <div key={`box-${tgt.id}`} className="absolute border-[1.5px] z-30 cursor-pointer" onClick={() => setSelectedTarget(tgt)}
                        style={{ left: `${lp}%`, top: `${tp}%`, width: `${wp}%`, height: `${hp}%`, borderColor: color, backgroundColor: `${color}12`, boxShadow: `0 0 ${glowRadius}px ${heatColor}66, 0 0 ${glowRadius*2}px ${heatColor}22 inset` }}>
                        <div className="absolute -top-3.5 left-0 px-1 text-[7px] font-mono" style={{ backgroundColor: "rgba(5,10,15,0.85)", color, borderBottom: `1px solid ${color}` }}>
                          {isDisp ? "SECURED" : tgt.class} | {tgt.distance_m?.toFixed(1)}m
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {viewMode === "RAW" && isAllView && scans.length > 0 && (
              <div className="w-full h-full p-4 pb-20 pt-12 overflow-y-auto custom-scrollbar flex flex-wrap gap-3 content-start justify-center">
                {scans.map((scan) => (
                  <div key={scan.id} className="relative w-[44%] aspect-square bg-black border border-[rgba(0,229,255,0.35)] rounded-md overflow-hidden shrink-0">
                    <img src={scan.url} className="absolute inset-0 w-full h-full object-contain" alt="Sonar"/>
                    <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-[rgba(0,229,255,0.35)] text-[8px] font-mono text-white rounded-bl">{scan.id}</div>
                    {scan.size && scan.targets.map((tgt) => {
                      const [x1, y1, x2, y2] = tgt.bbox;
                      const lp = (x1 / scan.size!.w) * 100, tp = (y1 / scan.size!.h) * 100;
                      const wp = ((x2 - x1) / scan.size!.w) * 100, hp = ((y2 - y1) / scan.size!.h) * 100;
                      const isDisp = dispatchedTargets[tgt.id];
                      const isCrit = tgt.class === "HUMAN BODY";
                      const color = isDisp ? "#00FF00" : isCrit ? "#FF0000" : tgt.priority_score >= 7.5 ? "#FF5722" : "#00E5FF";
                      // Feature #4: confidence heatmap glow radius
                      const glowRadius = Math.round(Math.max(wp, hp) * 0.6);
                      const conf = tgt.confidence || 50;
                      const heatColor = conf >= 80 ? "#00ff88" : conf >= 60 ? "#ffd700" : "#ff5555";
                      return (
                        <div key={`box-${tgt.id}`} className="absolute border-[1.5px] z-30 cursor-pointer" onClick={() => setSelectedTarget(tgt)}
                          style={{ left: `${lp}%`, top: `${tp}%`, width: `${wp}%`, height: `${hp}%`, borderColor: color, backgroundColor: `${color}12`, boxShadow: `0 0 ${glowRadius}px ${heatColor}66, 0 0 ${glowRadius * 2}px ${heatColor}22 inset` }}>
                          <div className="absolute -top-3.5 left-0 px-1 text-[7px] font-mono" style={{ backgroundColor: "rgba(5,10,15,0.85)", color, borderBottom: `1px solid ${color}` }}>
                            {isDisp ? "SECURED" : tgt.class} | {tgt.distance_m?.toFixed(1)}m
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            <div className="absolute inset-0 scanline z-50 mix-blend-overlay opacity-25 pointer-events-none"/>
            <div className="crt-overlay absolute inset-0 z-40"/>
          </div>
        </div>

        {/* RIGHT: Tactical Queue + Annotations */}
        <div className={`col-span-3 glass-panel ${panelBg} p-4 flex flex-col gap-3 overflow-hidden ${isRedAlert ? "border-[rgba(255,0,0,0.3)] bg-[rgba(30,0,0,0.4)]" : ""}`}>
          <h2 className={`text-xs uppercase tracking-[0.3em] shrink-0 pb-2 border-b flex items-center gap-2 ${isRedAlert ? "text-red-500 border-[rgba(255,0,0,0.2)]" : "text-[var(--color-safety-orange)] border-[rgba(255,87,34,0.15)]"}`}>
            <AlertTriangle className={`w-4 h-4 ${isRedAlert ? "animate-pulse" : ""}`}/> Tactical Queue
          </h2>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
            {sortedFrameQueue.length === 0 && !isScanning && (
              <div className="text-xs text-[var(--color-text-muted)] text-center py-10 font-mono">AWAITING DATA</div>
            )}
            {sortedFrameQueue.map((tgt, i) => {
              const isCrit = tgt.class === "HUMAN BODY";
              const isHigh = tgt.priority_score >= 7.5 || isCrit;
              const isDisp = dispatchedTargets[tgt.id];
              const tier = isDisp ? "RECOVERED" : isCrit ? "EMERGENCY" : isHigh ? "CRITICAL" : tgt.priority_score >= 4 ? "HIGH" : "STANDARD";
              const tierColor = isDisp ? "#00ffaa" : isCrit ? "#FF0000" : isHigh ? "var(--color-safety-orange)" : "var(--color-neon-cyan)";
              const isEditingThis = editingNote === tgt.id;
              return (
                <motion.div key={`q-${tgt.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className={`border-l-4 p-2.5 relative ${isDisp ? "bg-[rgba(0,255,0,0.08)]" : isCrit ? "bg-[rgba(255,0,0,0.08)]" : "bg-[rgba(20,28,36,0.8)]"}`}
                  style={{ borderLeftColor: tierColor }}>
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded tracking-widest ${isDisp ? "bg-[#00ffaa] text-black font-bold" : isCrit ? "bg-red-600 text-white animate-pulse" : "bg-[rgba(0,0,0,0.4)]"}`} style={(!isCrit && !isDisp) ? { color: tierColor } : {}}>{tier}</span>
                    <span className="text-[10px] font-mono font-bold" style={{ color: tierColor }}>{tgt.priority_score?.toFixed(1)}/10</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className={`font-bold text-sm tracking-wide cursor-pointer hover:underline ${isDisp ? "line-through opacity-60" : ""}`} onClick={() => setSelectedTarget(tgt)}>{tgt.class}</div>
                    {!isDisp && (isHigh || isCrit) && (
                      <button onClick={() => { dispatchROV(tgt.id, tgt.class, tgt.distance_m?.toFixed(1)); }}
                        className="px-1.5 py-0.5 flex items-center gap-1 border border-[rgba(255,255,255,0.3)] rounded text-[8px] font-bold tracking-widest bg-[rgba(255,255,255,0.08)] hover:bg-white hover:text-black cursor-pointer transition-colors">
                        <ShieldCheck className="w-2.5 h-2.5"/> DEPLOY
                      </button>
                    )}
                  </div>
                  <div className="text-[9px] text-[var(--color-text-muted)] font-mono mt-1 flex justify-between">
                    <span>{tgt.track_id || tgt.id}</span>
                    <span>{tgt.distance_m?.toFixed(1)}m | {tgt.bearing_deg?.toFixed(1)}°</span>
                  </div>
                  {/* TTA Uncertainty badge */}
                  {(tgt.confidence_uncertainty || 0) > 0 && (
                    <div className="text-[8px] font-mono text-[#ffd700] mt-0.5">⚠ UNCERTAINTY ±{tgt.confidence_uncertainty?.toFixed(1)}%</div>
                  )}
                  {/* Annotation */}
                  <div className="mt-1.5">
                    {annotations[tgt.id] && !isEditingThis && (
                      <div className="text-[8px] font-mono text-[#00ffaa] bg-[rgba(0,255,100,0.08)] px-1.5 py-1 rounded border-l border-[#00ffaa]">📝 {annotations[tgt.id]}</div>
                    )}
                    {isEditingThis ? (
                      <div className="flex gap-1 mt-1">
                        <input autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { setAnnotations((p) => ({ ...p, [tgt.id]: noteText })); setEditingNote(null); setNoteText(""); } if (e.key === "Escape") { setEditingNote(null); setNoteText(""); }}}
                          className="flex-1 text-[9px] bg-[rgba(0,0,0,0.5)] border border-[rgba(255,255,255,0.2)] rounded px-1 py-0.5 font-mono text-white outline-none focus:border-[var(--color-neon-cyan)]" placeholder="Enter note... (Enter to save)"/>
                        <button onClick={() => { setAnnotations((p) => ({ ...p, [tgt.id]: noteText })); setEditingNote(null); setNoteText(""); }} className="text-[8px] px-1 bg-[var(--color-neon-cyan)] text-black rounded font-bold cursor-pointer">✓</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingNote(tgt.id); setNoteText(annotations[tgt.id] || ""); }}
                        className="mt-1 text-[8px] text-[var(--color-text-muted)] hover:text-[var(--color-neon-cyan)] transition-colors cursor-pointer flex items-center gap-1">
                        <MessageSquare className="w-2.5 h-2.5"/>{annotations[tgt.id] ? "EDIT NOTE" : "ADD NOTE"}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
          {allTargets.length > 0 && (
            <button onClick={saveSession} className="shrink-0 text-[9px] font-mono text-[var(--color-text-muted)] hover:text-[var(--color-neon-cyan)] transition-colors cursor-pointer border border-[rgba(255,255,255,0.08)] rounded py-1">
              💾 SAVE SESSION TO DB
            </button>
          )}
        </div>
      </div>

      {/* ── FRAME NAVIGATOR + LOG ── */}
      <div className="shrink-0 flex gap-3">
        {/* Frame Navigator */}
        {scans.length > 1 && (
          <div className={`glass-panel ${panelBg} px-3 py-2 flex items-center gap-3 shrink-0`}>
            <span className="text-[9px] font-mono text-[var(--color-text-muted)] tracking-widest">FRAME</span>
            <button onClick={() => setActiveFrameIdx(Math.max(-1, activeFrameIdx - 1))} disabled={activeFrameIdx === -1}
              className="disabled:opacity-30 cursor-pointer hover:text-[var(--color-neon-cyan)] transition-colors">
              <ChevronLeft className="w-4 h-4"/>
            </button>
            <span className="font-mono text-xs text-[var(--color-neon-cyan)] min-w-[6.5rem] text-center">{isAllView ? "ALL SCANS" : `${scans[activeFrameIdx]?.id} / ${scans.length}`}</span>
            <button onClick={() => setActiveFrameIdx(Math.min(scans.length - 1, activeFrameIdx + 1))} disabled={activeFrameIdx === scans.length - 1}
              className="disabled:opacity-30 cursor-pointer hover:text-[var(--color-neon-cyan)] transition-colors">
              <ChevronRight className="w-4 h-4"/>
            </button>
            <input type="range" min="-1" max={scans.length - 1} value={activeFrameIdx} onChange={(e) => setActiveFrameIdx(Number(e.target.value))}
              className="w-28 h-1 bg-[rgba(255,255,255,0.1)] appearance-none rounded"/>
            <span className="text-[8px] font-mono text-[var(--color-text-muted)]">{isAllView ? "Aggregate" : `${scans[activeFrameIdx]?.targets?.length || 0} tgts`}</span>
            {/* Feature #3: Replay button */}
            {!isDemoMode && (
              isReplaying ? (
                <button onClick={stopReplay} className="px-2 py-1 text-[8px] font-mono font-bold border border-[var(--color-safety-orange)] text-[var(--color-safety-orange)] rounded animate-pulse cursor-pointer bg-[rgba(255,87,34,0.1)]">
                  <Square className="w-2.5 h-2.5 inline mr-1"/>STOP
                </button>
              ) : (
                <button onClick={startReplay} className="px-2 py-1 text-[8px] font-mono font-bold border border-[#00ffaa] text-[#00ffaa] rounded cursor-pointer bg-[rgba(0,255,170,0.08)] hover:bg-[#00ffaa] hover:text-black transition-colors">
                  <Play className="w-2.5 h-2.5 inline mr-1"/>REPLAY
                </button>
              )
            )}
          </div>
        )}

        {/* System Log */}
        <div className={`flex-1 glass-panel ${panelBg} p-3 h-[110px] flex flex-col`}>
          <h3 className="text-[9px] uppercase tracking-[0.4em] text-[#a6abb4] mb-1.5 font-mono flex items-center gap-2 shrink-0">
            <Terminal className="w-3 h-3"/> Event Blackbox
          </h3>
          <div className="flex-1 overflow-y-auto font-mono text-[10px] leading-relaxed custom-scrollbar">
            {systemLogs.map((log, idx) => {
              const isWarn = log.includes("[CRITICAL]") || log.includes("[ERROR]");
              const isAction = log.includes("[ACTION]") || log.includes("[SESSION]");
              const isDemo = log.includes("[SIM]") || log.includes("[DEMO]");
              return (
                <div key={idx} className={isAction ? "text-[#00ffaa] pl-2 border-l-2 border-[#00ffaa]" : isWarn ? "text-[#ff5555] pl-2 border-l-2 border-[#ff5555]" : isDemo ? "text-[#ffd700] pl-2 border-l-2 border-[#ffd700]" : "text-[#8892b0] pl-2 border-l-2 border-transparent"}>
                  <span className="text-[var(--color-neon-cyan)] opacity-60 mr-2">{">"}</span>{log}
                </div>
              );
            })}
            <div ref={logEndRef}/>
          </div>
        </div>
      </div>

      {/* ── TARGET DETAIL MODAL ── */}
      <AnimatePresence>
        {selectedTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSelectedTarget(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel p-6 w-96 relative border border-[var(--color-neon-cyan)] shadow-[0_0_60px_rgba(0,229,255,0.15)]">
              <button onClick={() => setSelectedTarget(null)} className="absolute top-3 right-3 text-[var(--color-text-muted)] hover:text-white cursor-pointer"><X className="w-4 h-4"/></button>
              <h3 className="text-[10px] font-mono tracking-widest text-[var(--color-neon-cyan)] mb-1">{selectedTarget.track_id || selectedTarget.id}</h3>
              <div className={`text-2xl font-bold mb-4 tracking-wider ${selectedTarget.class === "HUMAN BODY" ? "text-[#ff5555]" : "text-white"}`}>{selectedTarget.class}</div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  ["CONFIDENCE", `${selectedTarget.confidence?.toFixed(1)}%`],
                  ["UNCERTAINTY", `±${selectedTarget.confidence_uncertainty?.toFixed(2) || "0.00"}%`],
                  ["DISTANCE", `${selectedTarget.distance_m?.toFixed(2)} m`],
                  ["BEARING", `${selectedTarget.bearing_deg?.toFixed(2)}°`],
                  ["PRIORITY", `${selectedTarget.priority_score?.toFixed(2)} / 10`],
                  ["VELOCITY", selectedTarget.velocity ? `dx:${selectedTarget.velocity.dx} dy:${selectedTarget.velocity.dy}` : "N/A"],
                ].map(([label, value]) => (
                  <div key={label} className="bg-[rgba(0,0,0,0.4)] rounded p-2.5">
                    <div className="text-[9px] text-[var(--color-text-muted)] font-mono tracking-widest mb-0.5">{label}</div>
                    <div className="text-sm font-bold font-mono text-[var(--color-neon-cyan)]">{value}</div>
                  </div>
                ))}
              </div>
              {/* BBOX */}
              <div className="bg-[rgba(0,0,0,0.3)] rounded p-2 mb-3 font-mono text-[9px] text-[var(--color-text-muted)]">
                BBOX: [{selectedTarget.bbox?.join(", ")}]
              </div>
              {/* Feature #2: Priority history sparkline */}
              {(() => {
                const key = selectedTarget.track_id || selectedTarget.id;
                const hist = priorityHistory[key];
                if (!hist || hist.length < 2) return null;
                const W = 280, H = 36, max = Math.max(...hist, 10), min = Math.min(...hist, 0);
                const pts = hist.map((v, i) => {
                  const x = (i / (hist.length - 1)) * W;
                  const y = H - ((v - min) / (max - min + 0.001)) * H;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(" ");
                return (
                  <div className="mb-3">
                    <div className="text-[9px] font-mono text-[var(--color-text-muted)] mb-1">PRIORITY HISTORY</div>
                    <svg width={W} height={H} className="w-full" style={{ height: 36 }}>
                      <polyline points={pts} fill="none" stroke="var(--color-neon-cyan)" strokeWidth="1.5" strokeLinejoin="round"/>
                      {hist.map((v, i) => (
                        <circle key={i} cx={(i/(hist.length-1))*W} cy={H - ((v-min)/(max-min+0.001))*H} r="2" fill="var(--color-neon-cyan)"/>
                      ))}
                    </svg>
                    <div className="flex justify-between text-[7px] font-mono text-[var(--color-text-muted)] mt-0.5">
                      <span>OLDEST</span><span>LATEST: {hist[hist.length-1]?.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })()}
              {/* Note in modal */}
              <div className="mt-2">
                <label className="text-[9px] font-mono text-[var(--color-text-muted)] tracking-widest">OPERATOR NOTE</label>
                <textarea value={annotations[selectedTarget.id] || ""} onChange={(e) => setAnnotations((p) => ({ ...p, [selectedTarget.id]: e.target.value }))}
                  className="w-full mt-1 bg-[rgba(0,0,0,0.5)] border border-[rgba(255,255,255,0.1)] rounded p-2 text-[10px] font-mono text-white resize-none outline-none focus:border-[var(--color-neon-cyan)] h-16"
                  placeholder="Add tactical note..."/>
              </div>
              {!dispatchedTargets[selectedTarget.id] && selectedTarget.priority_score >= 7.5 && (
                <button onClick={() => { dispatchROV(selectedTarget.id, selectedTarget.class, selectedTarget.distance_m?.toFixed(1)); setSelectedTarget(null); }}
                  className="mt-3 w-full py-2 bg-[var(--color-safety-orange-dim)] border border-[var(--color-safety-orange)] rounded text-[10px] font-bold tracking-widest text-[var(--color-safety-orange)] hover:bg-[var(--color-safety-orange)] hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-2">
                  <ShieldCheck className="w-4 h-4"/> DEPLOY ROV INTERCEPT
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}
