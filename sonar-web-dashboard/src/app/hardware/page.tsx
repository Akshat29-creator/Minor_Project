"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Activity, Target, AlertTriangle, Crosshair, Terminal, Waves,
  Battery, Thermometer, Download, ShieldCheck, Play, Square, X, Sun,
  Moon, BarChart2, Clock, MessageSquare, ChevronLeft, ChevronRight, Zap,
  Wifi, WifiOff, Cable, Cpu, Radio, Camera, Settings, RotateCcw,
  CheckCircle2, XCircle, Loader2, RefreshCw, Gauge, MonitorSpeaker
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type ScanData = { id: string; url: string; size: { w: number; h: number } | null; targets: any[]; sonar_data?: any };
type HWComponent = { connected: boolean; [key: string]: any };
type HWStatus = {
  esp32: HWComponent;
  servo: HWComponent;
  sonar: HWComponent;
  camera: HWComponent;
};

const API_BASE = "http://localhost:8000";

type TabKey = "LIVE" | "HARDWARE";

export default function HardwareDashboard() {
  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<TabKey>("LIVE");

  // ── Detection state ──
  const [isLive, setIsLive] = useState(false);
  const [scans, setScans] = useState<ScanData[]>([]);
  const [viewMode, setViewMode] = useState<"RADAR" | "RAW">("RADAR");
  const [dispatchedTargets, setDispatchedTargets] = useState<Record<string, boolean>>({});
  const [wClass, setWClass] = useState(0.5);
  const [wDist, setWDist] = useState(0.3);
  const [wAngle, setWAngle] = useState(0.2);
  const [systemLogs, setSystemLogs] = useState<string[]>([
    "[SYSTEM] Hardware Dashboard v1.0 Online.",
    "[SYSTEM] Waiting for hardware connection...",
  ]);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [annotations, setAnnotations] = useState<Record<string, string>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [isDayMode, setIsDayMode] = useState(false);
  const [missionStartTime, setMissionStartTime] = useState<number | null>(null);
  const [missionTime, setMissionTime] = useState("00:00:00");
  const [activeFrameIdx, setActiveFrameIdx] = useState(-1);
  const [rovDispatchCount, setRovDispatchCount] = useState(0);
  const [priorityHistory, setPriorityHistory] = useState<Record<string, number[]>>({});

  // ── Hardware state ──
  const [hwStatus, setHwStatus] = useState<HWStatus>({
    esp32: { connected: false },
    servo: { connected: false },
    sonar: { connected: false },
    camera: { connected: false },
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [availablePorts, setAvailablePorts] = useState<any[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [connectionAnim, setConnectionAnim] = useState<Record<string, "idle" | "connecting" | "connected" | "error">>({
    esp32: "idle", servo: "idle", sonar: "idle", camera: "idle",
  });

  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const redAlertFiredRef = useRef(false);
  const scansRef = useRef<ScanData[]>([]);
  scansRef.current = scans;

  const allConnected = hwStatus.esp32.connected && hwStatus.servo.connected && hwStatus.sonar.connected && hwStatus.camera.connected;

  // ── Derived ──
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

  const classBreakdown = allTargets.reduce((acc, t) => {
    acc[t.class] = (acc[t.class] || 0) + 1; return acc;
  }, {} as Record<string, number>);
  const classBreakdownEntries = (Object.entries(classBreakdown) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxClassCount = Math.max(...classBreakdownEntries.map(([, c]) => c as number), 1);

  // ── Effects ──
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

  // Poll hardware status every 3s on hardware tab
  useEffect(() => {
    if (activeTab !== "HARDWARE") return;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/hardware/status`);
        const data = await res.json();
        if (data.components) {
          setHwStatus(data.components);
          // Update connection animation states
          const newAnim: Record<string, "idle" | "connecting" | "connected" | "error"> = {};
          for (const key of ["esp32", "servo", "sonar", "camera"]) {
            newAnim[key] = (data.components as any)[key]?.connected ? "connected" : "idle";
          }
          setConnectionAnim(newAnim);
        }
      } catch { }
    };
    fetchStatus();
    const iv = setInterval(fetchStatus, 3000);
    return () => clearInterval(iv);
  }, [activeTab]);

  // ── Audio ──
  const initAudio = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
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
    setSystemLogs((prev) => [...prev.slice(-40), `[${new Date().toLocaleTimeString("en-US", { hour12: false })}] ${msg}`]);

  // ── Hardware Functions ──
  const scanPorts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/hardware/scan-ports`);
      const data = await res.json();
      setAvailablePorts(data.ports || []);
      addLog(`[HARDWARE] Scanned ${data.ports?.length || 0} COM ports.`);
    } catch { addLog("[ERROR] Failed to scan COM ports."); }
  };

  const connectHardware = async () => {
    setIsConnecting(true);
    setConnectionAnim({ esp32: "connecting", servo: "connecting", sonar: "connecting", camera: "connecting" });
    addLog("[HARDWARE] Initiating connection sequence...");

    try {
      const res = await fetch(`${API_BASE}/api/hardware/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: selectedPort || null }),
      });
      const data = await res.json();

      // Animate connection results with delay
      setTimeout(() => {
        setConnectionAnim(prev => ({
          ...prev,
          esp32: data.esp32?.connected ? "connected" : "error",
        }));
        addLog(data.esp32?.connected ? `[HARDWARE] ESP32 connected: ${data.esp32.message}` : `[ERROR] ESP32: ${data.esp32?.message}`);
      }, 800);

      setTimeout(() => {
        setConnectionAnim(prev => ({
          ...prev,
          servo: data.esp32?.connected ? "connected" : "error",
        }));
        if (data.esp32?.connected) addLog("[HARDWARE] MG90S Servo link established.");
      }, 1600);

      setTimeout(() => {
        setConnectionAnim(prev => ({
          ...prev,
          sonar: data.esp32?.connected ? "connected" : "error",
        }));
        if (data.esp32?.connected) addLog("[HARDWARE] JSN-SR04T Sonar bridge active.");
      }, 2400);

      setTimeout(() => {
        setConnectionAnim(prev => ({
          ...prev,
          camera: data.camera?.connected ? "connected" : "error",
        }));
        addLog(data.camera?.connected ? "[HARDWARE] Camera feed established." : "[WARNING] Camera not detected.");

        // Refresh status
        fetchHwStatus();
        setIsConnecting(false);
      }, 3200);

    } catch {
      addLog("[ERROR] Connection failed. Is the backend running?");
      setConnectionAnim({ esp32: "error", servo: "error", sonar: "error", camera: "error" });
      setIsConnecting(false);
    }
  };

  const disconnectHardware = async () => {
    try {
      await fetch(`${API_BASE}/api/hardware/disconnect`, { method: "POST" });
      setHwStatus({ esp32: { connected: false }, servo: { connected: false }, sonar: { connected: false }, camera: { connected: false } });
      setConnectionAnim({ esp32: "idle", servo: "idle", sonar: "idle", camera: "idle" });
      addLog("[HARDWARE] All devices disconnected.");
    } catch { addLog("[ERROR] Disconnect failed."); }
  };

  const fetchHwStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/hardware/status`);
      const data = await res.json();
      if (data.components) setHwStatus(data.components);
    } catch { }
  };

  // ── Live Detection ──
  const captureFrame = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/hardware/live-frame?w_class=${wClass}&w_dist=${wDist}&w_angle=${wAngle}`);
      const data = await res.json();
      if (data.status === "success") {
        const scanId = `LIVE-${Date.now().toString().slice(-5)}`;
        const url = `data:image/jpeg;base64,${data.image_b64}`;
        const targets = data.targets.map((t: any, i: number) => ({
          ...t, id: `${scanId}-${t.id}`, frame_idx: scansRef.current.length,
        }));
        if (targets.some((t: any) => t.class === "HUMAN BODY") && !redAlertFiredRef.current) {
          addLog(`[CRITICAL] HUMAN BODY DETECTED — LIVE FEED! RED ALERT.`);
          playRedAlert();
          redAlertFiredRef.current = true;
        } else {
          playSonarPing();
        }
        const img = new window.Image();
        const size = await new Promise<{ w: number; h: number }>((resolve) => {
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({ w: 640, h: 480 });
          img.src = url;
        });
        setScans((prev) => [...prev.slice(-20), { id: scanId, url, size, targets, sonar_data: data.sonar_data }]);
        addLog(`[LIVE] Frame captured → ${targets.length} targets | ${data.sonar_data ? "Sonar OK" : "No sonar"}`);
      }
    } catch {
      addLog("[ERROR] Live frame capture failed. Check hardware connection.");
    }
  }, [wClass, wDist, wAngle]);

  const startLive = () => {
    if (!allConnected) {
      addLog("[WARNING] Cannot start live — not all hardware connected.");
      return;
    }
    initAudio();
    setScans([]);
    redAlertFiredRef.current = false;
    setActiveFrameIdx(-1);
    setIsLive(true);
    setMissionStartTime(Date.now());
    addLog("[LIVE] Live detection mode started. Capturing frames...");
    captureFrame();
    const id = setInterval(captureFrame, 2000);
    liveIntervalRef.current = id;
  };

  const stopLive = () => {
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
    setIsLive(false);
    addLog("[LIVE] Live detection stopped.");
  };

  // ── Misc ──
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
    a.download = `HW_Mission_Log_${Date.now()}.csv`;
    a.click();
    addLog("[SYSTEM] Mission Log Exported.");
  };

  const dispatchROV = (tgtId: string, cls: string, dist: string) => {
    initAudio();
    setDispatchedTargets((p) => ({ ...p, [tgtId]: true }));
    setRovDispatchCount((n) => n + 1);
    addLog(`[ACTION] ROV #${rovDispatchCount + 1} dispatched → ${cls} at ${dist}m`);
  };

  const bg = isDayMode ? "bg-[#1a2030]" : "bg-[#0a0f14]";
  const panelBg = isDayMode ? "bg-[rgba(30,40,60,0.85)]" : "";

  // ── Connection Status Icon ──
  const ConnStatusIcon = ({ status }: { status: "idle" | "connecting" | "connected" | "error" }) => {
    if (status === "connecting") return <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />;
    if (status === "connected") return <CheckCircle2 className="w-5 h-5 text-[#00ff88]" />;
    if (status === "error") return <XCircle className="w-5 h-5 text-[#ff5555]" />;
    return <div className="w-5 h-5 rounded-full border-2 border-[rgba(255,255,255,0.2)]" />;
  };

  // ── Hardware Component Card ──
  const HWCard = ({ name, icon: Icon, status, details, animStatus }: {
    name: string; icon: any; status: HWComponent; details: [string, string][]; animStatus: "idle" | "connecting" | "connected" | "error"
  }) => {
    const borderColor = animStatus === "connected" ? "border-[#00ff88]/40" : animStatus === "connecting" ? "border-yellow-400/40" : animStatus === "error" ? "border-[#ff5555]/40" : "border-[rgba(255,255,255,0.05)]";
    const glowColor = animStatus === "connected" ? "shadow-[0_0_20px_rgba(0,255,136,0.1)]" : animStatus === "error" ? "shadow-[0_0_20px_rgba(255,85,85,0.1)]" : "";
    
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }}
        className={`relative bg-[rgba(10,18,28,0.8)] backdrop-blur-md border ${borderColor} rounded-xl p-5 transition-all duration-500 ${glowColor}`}
      >
        {/* Pulse ring on connecting */}
        {animStatus === "connecting" && (
          <div className="absolute inset-0 rounded-xl border-2 border-yellow-400/30 animate-ping pointer-events-none" />
        )}
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${animStatus === "connected" ? "bg-[#00ff88]/10" : "bg-[rgba(255,255,255,0.05)]"}`}>
              <Icon className={`w-6 h-6 ${animStatus === "connected" ? "text-[#00ff88]" : "text-[var(--color-text-muted)]"}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-widest font-mono">{name}</h3>
              <p className={`text-[10px] font-mono tracking-wider ${animStatus === "connected" ? "text-[#00ff88]" : animStatus === "connecting" ? "text-yellow-400" : "text-[var(--color-text-muted)]"}`}>
                {animStatus === "connected" ? "ONLINE" : animStatus === "connecting" ? "CONNECTING..." : animStatus === "error" ? "OFFLINE" : "STANDBY"}
              </p>
            </div>
          </div>
          <ConnStatusIcon status={animStatus} />
        </div>
        
        <div className="space-y-2">
          {details.map(([label, value]) => (
            <div key={label} className="flex justify-between text-[10px] font-mono">
              <span className="text-[var(--color-text-muted)] tracking-widest">{label}</span>
              <span className={animStatus === "connected" ? "text-[#00ff88]" : "text-[var(--color-text-muted)]"}>{value}</span>
            </div>
          ))}
        </div>

        {/* Connection animation bar */}
        <div className="mt-4 h-1 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${animStatus === "connected" ? "bg-[#00ff88]" : animStatus === "connecting" ? "bg-yellow-400" : animStatus === "error" ? "bg-[#ff5555]" : "bg-transparent"}`}
            initial={{ width: "0%" }}
            animate={{ width: animStatus === "connecting" ? ["0%", "60%", "30%", "80%", "50%"] : animStatus === "connected" ? "100%" : animStatus === "error" ? "100%" : "0%" }}
            transition={{ duration: animStatus === "connecting" ? 2 : 0.5, repeat: animStatus === "connecting" ? Infinity : 0 }}
          />
        </div>
      </motion.div>
    );
  };

  return (
    <div className={`h-screen w-screen overflow-hidden p-4 flex flex-col gap-3 text-[var(--color-text-primary)] transition-all duration-700 ${isRedAlert ? "alert-active bg-[rgba(25,0,0,0.85)]" : bg}`}>

      {/* ── HEADER ── */}
      <header className={`glass-panel ${panelBg} p-3 shrink-0 flex items-center justify-between ${isRedAlert ? "border-[rgba(255,0,0,0.4)]" : ""}`}>
        <div className="flex items-center gap-4">
          <Crosshair className={`w-8 h-8 ${isRedAlert ? "text-[#ff5555] animate-spin" : "text-[var(--color-neon-cyan)]"}`} />
          <div>
            <h1 className="text-xl font-bold tracking-widest text-[#e6ebf4]">ABYSSAL NAVIGATOR <span className="text-xs opacity-40 ml-2">HARDWARE MODE</span></h1>
            <p className={`text-[10px] tracking-[0.2em] font-mono uppercase ${isRedAlert ? "text-[#ff5555]" : "text-[var(--color-text-muted)]"}`}>
              LIVE DETECTION · HARDWARE-IN-THE-LOOP · SERIAL BRIDGE
            </p>
          </div>
        </div>

        <div className="flex gap-5 items-center">
          {/* Tab switcher */}
          <div className="flex bg-[rgba(0,0,0,0.3)] rounded-lg p-0.5 border border-[rgba(255,255,255,0.05)]">
            {(["LIVE", "HARDWARE"] as TabKey[]).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 text-[10px] font-mono tracking-widest rounded-md transition-all cursor-pointer ${activeTab === tab ? "bg-[var(--color-neon-cyan)]/15 text-[var(--color-neon-cyan)] border border-[var(--color-neon-cyan)]/30" : "text-[var(--color-text-muted)] hover:text-white"}`}>
                {tab === "LIVE" ? <><Radio className="w-3 h-3 inline mr-1" />LIVE FEED</> : <><Settings className="w-3 h-3 inline mr-1" />HARDWARE</>}
              </button>
            ))}
          </div>

          <div className="hidden lg:flex gap-4 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-[var(--color-text-muted)]"><Clock className="w-3 h-3" />{missionTime}</span>
            <span className="flex items-center gap-1 text-[#ff5555]"><Target className="w-3 h-3" />{humanCount} HUM</span>
            <span className="flex items-center gap-1 text-[var(--color-safety-orange)]"><Zap className="w-3 h-3" />{criticalCount} CRIT</span>
            <span className="flex items-center gap-1 text-[#00ffaa] border border-[#00ffaa33] px-1.5 rounded font-bold"><ShieldCheck className="w-3 h-3" />ROV × {rovDispatchCount}</span>
          </div>

          <Link href="/dashboard" className="px-3 py-1.5 text-[10px] font-mono tracking-widest border border-[rgba(255,255,255,0.1)] rounded text-[var(--color-text-muted)] hover:text-[var(--color-neon-cyan)] hover:border-[var(--color-neon-cyan)] transition-all">
            DEMO MODE
          </Link>

          <button onClick={() => setIsDayMode(!isDayMode)} className="p-2 rounded-full border border-[rgba(255,255,255,0.1)] hover:border-[var(--color-neon-cyan)] transition-colors cursor-pointer">
            {isDayMode ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-[var(--color-neon-cyan)]" />}
          </button>

          <div className={`flex items-center gap-2 px-3 py-2 rounded-full border ${allConnected ? (isRedAlert ? "bg-[rgba(200,0,0,0.2)] border-red-500" : "bg-[var(--color-abyss-panel)] border-[#00ff88]") : "bg-[var(--color-abyss-panel)] border-[rgba(255,255,255,0.05)]"}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${allConnected ? (isRedAlert ? "bg-red-500 shadow-[0_0_12px_red] animate-pulse" : "bg-[#00ff88] shadow-[0_0_8px_#00ff88] animate-pulse") : "bg-[#ff5555]"}`} />
            <span className={`text-xs font-mono tracking-widest ${allConnected ? (isRedAlert ? "text-red-500" : isLive ? "text-[#00ff88]" : "text-[var(--color-neon-cyan)]") : "text-[#ff5555]"}`}>
              {isRedAlert ? "RED ALERT" : isLive ? "LIVE" : allConnected ? "READY" : "DISCONNECTED"}
            </span>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <AnimatePresence mode="wait">
        {activeTab === "HARDWARE" ? (
          <motion.div key="hardware-tab" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="flex-1 min-h-0 grid grid-cols-12 gap-3 overflow-hidden">

            {/* HARDWARE STATUS PANEL */}
            <div className={`col-span-8 glass-panel ${panelBg} p-6 overflow-y-auto custom-scrollbar`}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold tracking-widest flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-[var(--color-neon-cyan)]" /> HARDWARE STATUS
                  </h2>
                  <p className="text-[10px] font-mono text-[var(--color-text-muted)] tracking-widest mt-1">
                    {allConnected ? "ALL SYSTEMS NOMINAL — READY FOR LIVE DETECTION" : "CONNECT ALL COMPONENTS TO ENABLE LIVE MODE"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={scanPorts}
                    className="px-3 py-1.5 text-[10px] font-mono tracking-widest border border-[rgba(255,255,255,0.15)] rounded text-[var(--color-text-muted)] hover:text-[var(--color-neon-cyan)] hover:border-[var(--color-neon-cyan)] transition-all cursor-pointer flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> SCAN PORTS
                  </button>
                  {!allConnected ? (
                    <button onClick={connectHardware} disabled={isConnecting}
                      className="px-4 py-1.5 text-[10px] font-mono tracking-widest font-bold bg-[var(--color-neon-cyan)]/10 border border-[var(--color-neon-cyan)]/30 text-[var(--color-neon-cyan)] rounded hover:bg-[var(--color-neon-cyan)]/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1">
                      {isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cable className="w-3 h-3" />}
                      {isConnecting ? "CONNECTING..." : "CONNECT ALL"}
                    </button>
                  ) : (
                    <button onClick={disconnectHardware}
                      className="px-4 py-1.5 text-[10px] font-mono tracking-widest font-bold bg-[#ff5555]/10 border border-[#ff5555]/30 text-[#ff5555] rounded hover:bg-[#ff5555]/20 transition-all cursor-pointer flex items-center gap-1">
                      <WifiOff className="w-3 h-3" /> DISCONNECT
                    </button>
                  )}
                </div>
              </div>

              {/* Port selector */}
              {availablePorts.length > 0 && (
                <div className="mb-4 bg-[rgba(0,0,0,0.3)] rounded-lg p-3 border border-[rgba(255,255,255,0.05)]">
                  <label className="text-[9px] font-mono text-[var(--color-text-muted)] tracking-widest block mb-1.5">SELECT ESP32 PORT</label>
                  <select value={selectedPort} onChange={(e) => setSelectedPort(e.target.value)}
                    className="w-full bg-[rgba(0,0,0,0.5)] border border-[rgba(255,255,255,0.1)] rounded px-3 py-2 text-xs font-mono text-white outline-none focus:border-[var(--color-neon-cyan)] appearance-none cursor-pointer">
                    <option value="">AUTO-DETECT</option>
                    {availablePorts.map((p) => (
                      <option key={p.device} value={p.device}>{p.device} — {p.description}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Component Cards Grid */}
              <div className="grid grid-cols-2 gap-4">
                <HWCard name="ESP32 MCU" icon={Cpu} status={hwStatus.esp32} animStatus={connectionAnim.esp32}
                  details={[
                    ["PORT", hwStatus.esp32.port || "—"],
                    ["BAUD", String(hwStatus.esp32.baud || 115200)],
                    ["LAST SEEN", hwStatus.esp32.last_seen ? new Date(hwStatus.esp32.last_seen).toLocaleTimeString() : "—"],
                  ]} />
                <HWCard name="MG90S SERVO" icon={RotateCcw} status={hwStatus.servo} animStatus={connectionAnim.servo}
                  details={[
                    ["ANGLE", `${hwStatus.servo.current_angle || 0}°`],
                    ["LAST SWEEP", hwStatus.servo.last_sweep ? new Date(hwStatus.servo.last_sweep).toLocaleTimeString() : "—"],
                    ["RANGE", "0° — 180°"],
                  ]} />
                <HWCard name="JSN-SR04T SONAR" icon={Radio} status={hwStatus.sonar} animStatus={connectionAnim.sonar}
                  details={[
                    ["LAST DIST", hwStatus.sonar.last_distance_cm ? `${hwStatus.sonar.last_distance_cm} cm` : "—"],
                    ["ECHO COUNT", String(hwStatus.sonar.echo_count || 0)],
                    ["RANGE", "20cm — 600cm"],
                  ]} />
                <HWCard name="USB CAMERA" icon={Camera} status={hwStatus.camera} animStatus={connectionAnim.camera}
                  details={[
                    ["DEVICE", hwStatus.camera.device_id !== null && hwStatus.camera.device_id !== undefined ? `CAM-${hwStatus.camera.device_id}` : "—"],
                    ["RESOLUTION", hwStatus.camera.resolution || "—"],
                    ["FORMAT", "RGB / JPEG"],
                  ]} />
              </div>

              {/* System Readiness Bar */}
              <div className="mt-6 bg-[rgba(0,0,0,0.3)] rounded-lg p-4 border border-[rgba(255,255,255,0.05)]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-mono text-[var(--color-text-muted)] tracking-widest">SYSTEM READINESS</span>
                  <span className={`text-[10px] font-mono font-bold ${allConnected ? "text-[#00ff88]" : "text-[#ff5555]"}`}>
                    {[hwStatus.esp32, hwStatus.servo, hwStatus.sonar, hwStatus.camera].filter(c => c.connected).length}/4 ONLINE
                  </span>
                </div>
                <div className="flex gap-2">
                  {[
                    { name: "ESP32", connected: hwStatus.esp32.connected },
                    { name: "SERVO", connected: hwStatus.servo.connected },
                    { name: "SONAR", connected: hwStatus.sonar.connected },
                    { name: "CAMERA", connected: hwStatus.camera.connected },
                  ].map((c) => (
                    <div key={c.name} className="flex-1">
                      <div className={`h-2 rounded-full transition-all duration-700 ${c.connected ? "bg-[#00ff88] shadow-[0_0_8px_rgba(0,255,136,0.5)]" : "bg-[rgba(255,255,255,0.1)]"}`} />
                      <div className={`text-[8px] font-mono text-center mt-1 tracking-widest ${c.connected ? "text-[#00ff88]" : "text-[var(--color-text-muted)]"}`}>{c.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT: Connection Log */}
            <div className={`col-span-4 glass-panel ${panelBg} p-4 flex flex-col`}>
              <h3 className="text-[10px] uppercase tracking-[0.3em] text-[var(--color-text-muted)] mb-3 font-mono flex items-center gap-2 shrink-0">
                <Terminal className="w-3.5 h-3.5" /> CONNECTION LOG
              </h3>
              <div className="flex-1 overflow-y-auto font-mono text-[10px] leading-relaxed custom-scrollbar">
                {systemLogs.map((log, idx) => {
                  const isWarn = log.includes("[CRITICAL]") || log.includes("[ERROR]");
                  const isHw = log.includes("[HARDWARE]");
                  const isOk = log.includes("[LIVE]") || log.includes("[ACTION]");
                  return (
                    <div key={idx} className={isOk ? "text-[#00ffaa] pl-2 border-l-2 border-[#00ffaa]" : isWarn ? "text-[#ff5555] pl-2 border-l-2 border-[#ff5555]" : isHw ? "text-[var(--color-neon-cyan)] pl-2 border-l-2 border-[var(--color-neon-cyan)]" : "text-[#8892b0] pl-2 border-l-2 border-transparent"}>
                      <span className="text-[var(--color-neon-cyan)] opacity-60 mr-2">{">"}</span>{log}
                    </div>
                  );
                })}
                <div ref={logEndRef} />
              </div>
            </div>
          </motion.div>
        ) : (
          /* ── LIVE DETECTION TAB ── */
          <motion.div key="live-tab" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
            className="flex-1 min-h-0 grid grid-cols-12 gap-3">

            {/* LEFT: Triage Weights + Stats + Target List */}
            <div className={`col-span-3 glass-panel ${panelBg} p-4 flex flex-col gap-3 overflow-hidden ${isRedAlert ? "border-[rgba(255,0,0,0.2)]" : ""}`}>
              <div className="shrink-0 flex flex-col gap-1.5 pb-3 border-b border-[rgba(255,255,255,0.05)]">
                <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-neon-cyan)] flex justify-between">
                  <span>TRIAGE WEIGHTS</span><span className="text-[8px] text-[var(--color-text-muted)]">EQ.3</span>
                </h2>
                {[["CLASS (α)", wClass, setWClass], ["PROXIMITY (β)", wDist, setWDist], ["BEARING (γ)", wAngle, setWAngle]].map(([label, val, setter]: any) => (
                  <div key={String(label)}>
                    <div className="flex justify-between text-[9px] font-mono text-[var(--color-text-muted)]">
                      <span>{label}</span><span className="text-white">{Number(val).toFixed(2)}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05" value={val} onChange={(e) => setter(Number(e.target.value))} className="w-full h-1 bg-[rgba(255,255,255,0.1)] appearance-none rounded" />
                  </div>
                ))}
              </div>

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
                            <div className="h-1 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: isCrit ? "#ff5555" : "var(--color-neon-cyan)" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-muted)] shrink-0 flex items-center justify-between">
                <span className="flex items-center gap-1"><Target className="w-3 h-3" /> OBJECTS ({frameTargets.length})</span>
                {allTargets.length > 0 && (
                  <button onClick={exportMissionLog} className="text-[var(--color-neon-cyan)] hover:text-white transition-colors cursor-pointer" title="Export CSV">
                    <Download className="w-3 h-3" />
                  </button>
                )}
              </h2>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {frameTargets.length === 0 && !isLive && (
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
                        <span className="text-[9px] bg-[rgba(0,0,0,0.4)] px-1 rounded font-mono">{tgt.confidence?.toFixed(1)}%</span>
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
                STATUS: <span className={isRedAlert ? "text-red-500" : "text-[var(--color-neon-cyan)]"}>{isLive ? "LIVE SCANNING..." : "READY"}</span>
              </div>

              {/* Hardware connection indicator */}
              <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                {allConnected ? (
                  <div className="flex items-center gap-1.5 bg-[rgba(0,255,136,0.1)] border border-[#00ff88]/30 rounded px-2 py-1">
                    <Wifi className="w-3 h-3 text-[#00ff88]" />
                    <span className="text-[9px] font-mono text-[#00ff88] tracking-widest">HW LINK</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-[rgba(255,85,85,0.1)] border border-[#ff5555]/30 rounded px-2 py-1">
                    <WifiOff className="w-3 h-3 text-[#ff5555]" />
                    <span className="text-[9px] font-mono text-[#ff5555] tracking-widest">NO LINK</span>
                  </div>
                )}
              </div>

              {/* Live controls */}
              <div className="absolute bottom-4 left-4 z-30 flex gap-2">
                {!isLive ? (
                  <button onClick={startLive}
                    className={`px-4 py-2 rounded text-[10px] tracking-widest font-mono font-bold transition-all cursor-pointer flex items-center gap-1 ${allConnected ? "bg-[rgba(0,255,136,0.15)] text-[#00ff88] border border-[#00ff88] hover:bg-[#00ff88] hover:text-black" : "bg-[rgba(255,255,255,0.05)] text-[var(--color-text-muted)] border border-[rgba(255,255,255,0.1)] cursor-not-allowed opacity-50"}`}
                    disabled={!allConnected}>
                    <Play className="w-3 h-3" /> START LIVE
                  </button>
                ) : (
                  <button onClick={stopLive}
                    className="px-4 py-2 rounded text-[10px] tracking-widest font-mono font-bold animate-pulse cursor-pointer bg-[rgba(255,100,0,0.2)] text-[var(--color-safety-orange)] border border-[var(--color-safety-orange)] flex items-center gap-1">
                    <Square className="w-3 h-3" /> STOP LIVE
                  </button>
                )}
              </div>

              {scans.length > 0 && !isLive && (
                <div className="absolute bottom-4 right-4 z-20">
                  <button onClick={() => { initAudio(); setViewMode(viewMode === "RADAR" ? "RAW" : "RADAR"); }}
                    className="px-3 py-1.5 bg-[rgba(19,26,34,0.8)] border border-[rgba(255,255,255,0.2)] rounded text-[10px] tracking-widest text-[#e6ebf4] hover:border-[var(--color-neon-cyan)] transition-colors cursor-pointer font-bold">
                    MODE: {viewMode === "RADAR" ? "RAW FEED" : "RADAR"}
                  </button>
                </div>
              )}

              {/* Visualizer */}
              <div className="relative w-full h-full flex items-center justify-center bg-[#070b10] overflow-hidden">
                {viewMode === "RADAR" && (
                  <div className={`relative w-[440px] h-[440px] border-2 rounded-full flex items-center justify-center overflow-hidden transition-colors ${isRedAlert ? "border-[rgba(255,0,0,0.3)] bg-[rgba(20,0,0,0.4)]" : "border-[rgba(0,229,255,0.2)] bg-[#0d141b]"}`}>
                    {[300, 150].map((sz, ri) => (
                      <div key={ri} className={`absolute rounded-full border border-dashed ${isRedAlert ? "border-[rgba(255,0,0,0.25)]" : "border-[rgba(0,229,255,0.2)]"}`} style={{ width: sz, height: sz }}>
                        <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-[8px] font-mono px-0.5 bg-[#0d141b] ${isRedAlert ? "text-[#ff5555]" : "text-[var(--color-text-muted)]"}`}>{ri === 0 ? "6.6m" : "3.3m"}</span>
                      </div>
                    ))}
                    <div className={`absolute w-full h-px opacity-40 ${isRedAlert ? "bg-[rgba(255,0,0,0.4)]" : "bg-[rgba(0,229,255,0.3)]"}`} />
                    <div className={`absolute h-full w-px opacity-40 ${isRedAlert ? "bg-[rgba(255,0,0,0.4)]" : "bg-[rgba(0,229,255,0.3)]"}`} />
                    <div className={`absolute w-full h-px opacity-15 rotate-45 ${isRedAlert ? "bg-red-500" : "bg-[var(--color-neon-cyan)]"}`} />
                    <div className={`absolute w-full h-px opacity-15 -rotate-45 ${isRedAlert ? "bg-red-500" : "bg-[var(--color-neon-cyan)]"}`} />
                    {(!isAllView && activeScan) ? (
                      <img src={activeScan.url} className="absolute w-full h-full object-cover opacity-[0.06] mix-blend-screen rounded-full" alt="ctx" />
                    ) : (
                      scans[scans.length - 1] && <img src={scans[scans.length - 1].url} className="absolute w-full h-full object-cover opacity-[0.06] mix-blend-screen rounded-full" alt="ctx" />
                    )}
                    <div className="absolute w-[880px] h-[880px] -top-[220px] origin-center z-10 pointer-events-none" style={{ animation: "radar-spin 4s linear infinite", background: isRedAlert ? "conic-gradient(from 0deg,transparent 70%,rgba(255,0,0,0.12) 95%,rgba(255,0,0,0.7) 100%)" : "conic-gradient(from 0deg,transparent 70%,rgba(0,229,255,0.12) 95%,rgba(0,229,255,0.7) 100%)", borderRadius: "50%" }} />
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
                          <div className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: color, opacity: 0.7 }} />
                        </motion.div>
                      );
                    })}
                  </div>
                )}
                {viewMode === "RAW" && !isAllView && activeScan && (
                  <div className="w-full h-full p-4 flex items-center justify-center">
                    <div className="relative w-[80%] aspect-square bg-black border border-[rgba(0,229,255,0.35)] rounded-md overflow-hidden shrink-0">
                      <img src={activeScan.url} className="absolute inset-0 w-full h-full object-contain" alt="Live" />
                      <div className="absolute top-0 right-0 px-2 py-1 bg-[rgba(0,229,255,0.35)] text-[10px] font-mono text-white rounded-bl">{activeScan.id}</div>
                      {activeScan.size && activeScan.targets.map((tgt) => {
                        const [x1, y1, x2, y2] = tgt.bbox;
                        const lp = (x1 / activeScan.size!.w) * 100, tp = (y1 / activeScan.size!.h) * 100;
                        const wp = ((x2 - x1) / activeScan.size!.w) * 100, hp = ((y2 - y1) / activeScan.size!.h) * 100;
                        const isDisp = dispatchedTargets[tgt.id];
                        const isCrit = tgt.class === "HUMAN BODY";
                        const color = isDisp ? "#00FF00" : isCrit ? "#FF0000" : tgt.priority_score >= 7.5 ? "#FF5722" : "#00E5FF";
                        return (
                          <div key={`box-${tgt.id}`} className="absolute border-[1.5px] z-30 cursor-pointer" onClick={() => setSelectedTarget(tgt)}
                            style={{ left: `${lp}%`, top: `${tp}%`, width: `${wp}%`, height: `${hp}%`, borderColor: color, backgroundColor: `${color}12` }}>
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
                    {scans.slice(-8).map((scan) => (
                      <div key={scan.id} className="relative w-[44%] aspect-square bg-black border border-[rgba(0,229,255,0.35)] rounded-md overflow-hidden shrink-0">
                        <img src={scan.url} className="absolute inset-0 w-full h-full object-contain" alt="Live" />
                        <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-[rgba(0,229,255,0.35)] text-[8px] font-mono text-white rounded-bl">{scan.id}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="absolute inset-0 scanline z-50 mix-blend-overlay opacity-25 pointer-events-none" />
                <div className="crt-overlay absolute inset-0 z-40" />
              </div>
            </div>

            {/* RIGHT: Tactical Queue */}
            <div className={`col-span-3 glass-panel ${panelBg} p-4 flex flex-col gap-3 overflow-hidden ${isRedAlert ? "border-[rgba(255,0,0,0.3)] bg-[rgba(30,0,0,0.4)]" : ""}`}>
              <h2 className={`text-xs uppercase tracking-[0.3em] shrink-0 pb-2 border-b flex items-center gap-2 ${isRedAlert ? "text-red-500 border-[rgba(255,0,0,0.2)]" : "text-[var(--color-safety-orange)] border-[rgba(255,87,34,0.15)]"}`}>
                <AlertTriangle className={`w-4 h-4 ${isRedAlert ? "animate-pulse" : ""}`} /> Tactical Queue
              </h2>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {sortedFrameQueue.length === 0 && !isLive && (
                  <div className="text-xs text-[var(--color-text-muted)] text-center py-10 font-mono">AWAITING LIVE DATA</div>
                )}
                {sortedFrameQueue.map((tgt, i) => {
                  const isCrit = tgt.class === "HUMAN BODY";
                  const isHigh = tgt.priority_score >= 7.5 || isCrit;
                  const isDisp = dispatchedTargets[tgt.id];
                  const tier = isDisp ? "RECOVERED" : isCrit ? "EMERGENCY" : isHigh ? "CRITICAL" : tgt.priority_score >= 4 ? "HIGH" : "STANDARD";
                  const tierColor = isDisp ? "#00ffaa" : isCrit ? "#FF0000" : isHigh ? "var(--color-safety-orange)" : "var(--color-neon-cyan)";
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
                            <ShieldCheck className="w-2.5 h-2.5" /> DEPLOY
                          </button>
                        )}
                      </div>
                      <div className="text-[9px] text-[var(--color-text-muted)] font-mono mt-1 flex justify-between">
                        <span>{tgt.track_id || tgt.id}</span>
                        <span>{tgt.distance_m?.toFixed(1)}m | {tgt.bearing_deg?.toFixed(1)}°</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BOTTOM: Frame Nav + Log ── */}
      {activeTab === "LIVE" && (
        <div className="shrink-0 flex gap-3">
          {scans.length > 1 && (
            <div className={`glass-panel ${panelBg} px-3 py-2 flex items-center gap-3 shrink-0`}>
              <span className="text-[9px] font-mono text-[var(--color-text-muted)] tracking-widest">FRAME</span>
              <button onClick={() => setActiveFrameIdx(Math.max(-1, activeFrameIdx - 1))} disabled={activeFrameIdx === -1}
                className="disabled:opacity-30 cursor-pointer hover:text-[var(--color-neon-cyan)] transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono text-xs text-[var(--color-neon-cyan)] min-w-[6.5rem] text-center">{isAllView ? "ALL SCANS" : `${scans[activeFrameIdx]?.id} / ${scans.length}`}</span>
              <button onClick={() => setActiveFrameIdx(Math.min(scans.length - 1, activeFrameIdx + 1))} disabled={activeFrameIdx === scans.length - 1}
                className="disabled:opacity-30 cursor-pointer hover:text-[var(--color-neon-cyan)] transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
              <input type="range" min="-1" max={scans.length - 1} value={activeFrameIdx} onChange={(e) => setActiveFrameIdx(Number(e.target.value))}
                className="w-28 h-1 bg-[rgba(255,255,255,0.1)] appearance-none rounded" />
              <span className="text-[8px] font-mono text-[var(--color-text-muted)]">{isAllView ? "Aggregate" : `${scans[activeFrameIdx]?.targets?.length || 0} tgts`}</span>
            </div>
          )}
          <div className={`flex-1 glass-panel ${panelBg} p-3 h-[110px] flex flex-col`}>
            <h3 className="text-[9px] uppercase tracking-[0.4em] text-[#a6abb4] mb-1.5 font-mono flex items-center gap-2 shrink-0">
              <Terminal className="w-3 h-3" /> Event Blackbox
            </h3>
            <div className="flex-1 overflow-y-auto font-mono text-[10px] leading-relaxed custom-scrollbar">
              {systemLogs.map((log, idx) => {
                const isWarn = log.includes("[CRITICAL]") || log.includes("[ERROR]");
                const isAction = log.includes("[ACTION]") || log.includes("[SESSION]");
                const isHw = log.includes("[HARDWARE]") || log.includes("[LIVE]");
                return (
                  <div key={idx} className={isAction ? "text-[#00ffaa] pl-2 border-l-2 border-[#00ffaa]" : isWarn ? "text-[#ff5555] pl-2 border-l-2 border-[#ff5555]" : isHw ? "text-[var(--color-neon-cyan)] pl-2 border-l-2 border-[var(--color-neon-cyan)]" : "text-[#8892b0] pl-2 border-l-2 border-transparent"}>
                    <span className="text-[var(--color-neon-cyan)] opacity-60 mr-2">{">"}</span>{log}
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* ── TARGET DETAIL MODAL ── */}
      <AnimatePresence>
        {selectedTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSelectedTarget(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel p-6 w-96 relative border border-[var(--color-neon-cyan)] shadow-[0_0_60px_rgba(0,229,255,0.15)]">
              <button onClick={() => setSelectedTarget(null)} className="absolute top-3 right-3 text-[var(--color-text-muted)] hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
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
              <div className="bg-[rgba(0,0,0,0.3)] rounded p-2 mb-3 font-mono text-[9px] text-[var(--color-text-muted)]">
                BBOX: [{selectedTarget.bbox?.join(", ")}]
              </div>
              {!dispatchedTargets[selectedTarget.id] && selectedTarget.priority_score >= 7.5 && (
                <button onClick={() => { dispatchROV(selectedTarget.id, selectedTarget.class, selectedTarget.distance_m?.toFixed(1)); setSelectedTarget(null); }}
                  className="mt-3 w-full py-2 bg-[var(--color-safety-orange-dim)] border border-[var(--color-safety-orange)] rounded text-[10px] font-bold tracking-widest text-[var(--color-safety-orange)] hover:bg-[var(--color-safety-orange)] hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> DEPLOY ROV INTERCEPT
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
