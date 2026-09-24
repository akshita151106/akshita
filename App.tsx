import { useEffect, useRef, useState } from "react";
import { DrawingUtils, FaceLandmarker, GestureRecognizer, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { loadModels, closeModels, GESTURES, eyeDirection, type Models, type Dir } from "./vision";
import { Effects } from "./effects";
import BackgroundFX from "./BackgroundFX";

type Opts = { hands: boolean; face: boolean; person: boolean; fx: boolean };
type Stats = { people: number; hands: number; eyes: boolean; dir: Dir | "—"; gesture: string; fps: number };
type PersonBox = { x: number; y: number; w: number; h: number; score: number };

const EMPTY: Stats = { people: 0, hands: 0, eyes: false, dir: "—", gesture: "None", fps: 0 };
const CYAN = "#22d3ee";
const VIOLET = "#a855f7";
const ARROW: Record<Dir, string> = { Left: "◀", Right: "▶", Up: "▲", Down: "▼", Center: "●" };

// The preview is mirrored, so flip landmark x before drawing.
const mirror = (l: NormalizedLandmark[]) => l.map((p) => ({ ...p, x: 1 - p.x }));

function cameraMessage(e: unknown) {
  const n = (e as DOMException)?.name;
  if (n === "NotAllowedError" || n === "SecurityError")
    return "Camera access was blocked. Allow the camera in your browser's address bar, then press Start camera again.";
  if (n === "NotFoundError" || n === "OverconstrainedError")
    return "No camera was found. Connect a webcam and try again.";
  if (n === "NotReadableError") return "Another app is using the camera. Close it and try again.";
  return "The camera couldn't be started. Check your browser settings and try again.";
}

function drawBox(ctx: CanvasRenderingContext2D, p: PersonBox, i: number, lw: number) {
  const { x, y, w, h } = p;
  const k = Math.min(w, h) * 0.18;
  const fs = Math.max(14, ctx.canvas.width / 60);
  ctx.save();
  ctx.fillStyle = "rgba(168,85,247,.06)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = VIOLET; ctx.lineWidth = lw; ctx.shadowColor = VIOLET; ctx.shadowBlur = 12;
  ctx.beginPath();
  const corners: [number, number, number, number][] = [
    [x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.moveTo(cx + dx * k, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * k);
  }
  ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = "#e9d5ff";
  ctx.font = `600 ${fs}px "Chakra Petch", sans-serif`;
  ctx.fillText(`PERSON ${i + 1} (${Math.round(p.score * 100)}%)`, x + 8, y + fs + 6);
  ctx.restore();
}

function drawDir(ctx: CanvasRenderingContext2D, p: NormalizedLandmark, dir: Dir, W: number, H: number) {
  ctx.save();
  ctx.fillStyle = CYAN; ctx.shadowColor = CYAN; ctx.shadowBlur = 10;
  ctx.font = `${W / 45}px sans-serif`; ctx.textAlign = "center";
  ctx.fillText(ARROW[dir], p.x * W, p.y * H - W / 40);
  ctx.restore();
}

export default function App() {
  const [phase, setPhase] = useState<"hero" | "live" | "off">("hero");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opts, setOpts] = useState<Opts>({ hands: true, face: true, person: true, fx: true });
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [aspect, setAspect] = useState(16 / 9);
  const [fxKey, setFxKey] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const models = useRef<Models | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const effects = useRef(new Effects());
  const S = useRef({
    lastT: -1, lastTs: 0, frame: 0, persons: [] as PersonBox[],
    prevPeople: 0, prevHands: 0, thumbFrames: 0, lastFx: 0, scanAt: -1e9,
    fpsN: 0, fpsT: 0, fps: 0, lastUi: 0,
  });

  const stopStream = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  const start = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof WebAssembly === "undefined") {
      setError("This browser doesn't support the camera or WebAssembly features this app needs. Use a recent version of Chrome or Edge.");
      return;
    }
    setBusy(true);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" },
        audio: false,
      });
    } catch (e) {
      setError(cameraMessage(e)); setBusy(false); return;
    }
    try {
      models.current ??= await loadModels();
    } catch {
      stopStream();
      setError("The vision models couldn't be loaded. Check your internet connection and try again.");
      setBusy(false); return;
    }
    const t = stream.current!.getVideoTracks()[0].getSettings();
    if (t.width && t.height) setAspect(t.width / t.height);
    setBusy(false);
    setPhase("live");
  };

  const stop = () => {
    stopStream();
    if (videoRef.current) videoRef.current.srcObject = null;
    effects.current.clear();
    setStats(EMPTY);
    setPhase("off");
  };

  // Detection loop
  useEffect(() => {
    if (phase !== "live") return;
    const v = videoRef.current!, c = canvasRef.current!, ctx = c.getContext("2d")!;
    const utils = new DrawingUtils(ctx);
    const s = S.current;
    s.lastT = -1; s.fpsT = performance.now(); s.fpsN = 0;
    v.srcObject = stream.current;
    v.play().catch(() => setError("The video couldn't start playing."));
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const m = models.current, o = optsRef.current;
      if (!m || v.readyState < 2 || v.currentTime === s.lastT) return; // no new frame yet
      s.lastT = v.currentTime;

      const W = v.videoWidth, H = v.videoHeight;
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const now = performance.now();
      const ts = Math.max(now, s.lastTs + 1); s.lastTs = ts;
      const lw = Math.max(2, W / 500);
      ctx.clearRect(0, 0, W, H);

      // People: run the (heavier) detector on every 3rd frame and reuse the boxes in between
      if (o.person) {
        if (s.frame % 3 === 0) {
          s.persons = m.person.detectForVideo(v, ts).detections
            .map((d) => {
              const b = d.boundingBox!;
              return { x: W - b.originX - b.width, y: b.originY, w: b.width, h: b.height, score: d.categories[0]?.score ?? 0 };
            })
            .sort((a, b) => a.x - b.x);
        }
      } else s.persons = [];
      s.frame++;
      if (s.persons.length > s.prevPeople) s.scanAt = now; // someone entered: scan animation
      s.prevPeople = s.persons.length;
      s.persons.forEach((p, i) => drawBox(ctx, p, i, lw));

      // Face + eyes
      let faces = 0, dir: Dir | "—" = "—";
      if (o.face) {
        const r = m.face.detectForVideo(v, ts);
        faces = r.faceLandmarks.length;
        for (const raw of r.faceLandmarks) {
          const l = mirror(raw);
          utils.drawConnectors(l, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: "rgba(168,85,247,.45)", lineWidth: lw * 0.6 });
          for (const set of [
            FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
            FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
          ]) utils.drawConnectors(l, set, { color: CYAN, lineWidth: lw * 0.8 });
        }
        const cats = r.faceBlendshapes[0]?.categories;
        if (cats && faces) {
          dir = eyeDirection(cats);
          drawDir(ctx, mirror(r.faceLandmarks[0])[10], dir, W, H);
        }
      }

      // Hands + gestures
      let hands = 0;
      let top: { name: string; score: number; at: { x: number; y: number } | null } = { name: "None", score: 0, at: null };
      if (o.hands) {
        const r = m.gesture.recognizeForVideo(v, ts);
        hands = r.landmarks.length;
        for (let i = 0; i < hands; i++) {
          const l = mirror(r.landmarks[i]);
          utils.drawConnectors(l, GestureRecognizer.HAND_CONNECTIONS, { color: CYAN, lineWidth: lw });
          utils.drawLandmarks(l, { color: VIOLET, fillColor: "#fff", lineWidth: 1, radius: lw * 1.6 });
          const at = { x: ((l[0].x + l[9].x) / 2) * W, y: ((l[0].y + l[9].y) / 2) * H };
          if (hands > s.prevHands && i === hands - 1 && o.fx) effects.current.pulse(at.x, at.y, W, CYAN); // new hand
          const g = r.gestures[i]?.[0];
          if (g && g.categoryName !== "None" && g.score > top.score) top = { name: g.categoryName, score: g.score, at };
        }
      }
      s.prevHands = hands;

      // Thumbs-up: confident for 4 frames in a row, then a 2.5s cooldown
      const up = top.name === "Thumb_Up" && top.score >= 0.75;
      s.thumbFrames = up ? s.thumbFrames + 1 : 0;
      if (s.thumbFrames === 4 && now - s.lastFx > 2500 && o.fx && top.at) {
        s.lastFx = now;
        effects.current.burst(top.at.x, top.at.y, W);
        setFxKey((k) => k + 1);
      }

      if (o.fx) {
        // Scan sweep when a person enters
        const sp = (now - s.scanAt) / 1200;
        if (sp >= 0 && sp < 1) {
          const y = sp * H, g = ctx.createLinearGradient(0, y - 90, 0, y);
          g.addColorStop(0, "rgba(34,211,238,0)"); g.addColorStop(1, "rgba(34,211,238,.45)");
          ctx.fillStyle = g; ctx.fillRect(0, y - 90, W, 90);
          ctx.fillStyle = CYAN; ctx.fillRect(0, y, W, 2);
        }
        effects.current.draw(ctx, now);
      }

      // FPS + throttled UI state
      s.fpsN++;
      if (now - s.fpsT >= 500) { s.fps = Math.round((s.fpsN * 1000) / (now - s.fpsT)); s.fpsN = 0; s.fpsT = now; }
      if (now - s.lastUi >= 200) {
        s.lastUi = now;
        setStats({ people: s.persons.length, hands, eyes: faces > 0, dir, gesture: top.name, fps: s.fps });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, c.width, c.height); };
  }, [phase]);

  useEffect(() => () => {
    stopStream();
    if (models.current) closeModels(models.current);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else boxRef.current?.requestFullscreen?.();
  };
  const set = (k: keyof Opts) => (v: boolean) => setOpts((o) => ({ ...o, [k]: v }));

  const g = opts.hands && phase === "live" ? GESTURES[stats.gesture] : undefined;
  const anything = stats.people > 0 || stats.hands > 0 || stats.eyes;

  const errorBanner = error && (
    <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {error}
    </p>
  );

  return (
    <div className="relative isolate min-h-screen">
      <div className="grid-bg fixed inset-0 -z-10 opacity-60" aria-hidden />
      <div className="fixed left-1/2 top-[-20%] -z-10 h-[60vh] w-[60vw] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[140px]" aria-hidden />
      <BackgroundFX />

      {phase === "hero" ? (
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
          <h1 className="bg-gradient-to-r from-neon-cyan to-neon-violet bg-clip-text font-display text-5xl font-bold tracking-wide text-transparent sm:text-7xl">
            AI VISION LAB
          </h1>
          <p className="mt-4 text-lg text-slate-300">Real-time human interaction detection</p>
          <div className="mt-10 w-full max-w-sm">{errorBanner}</div>
          <button
            onClick={start}
            disabled={busy}
            className="rounded-xl bg-gradient-to-r from-neon-cyan to-neon-violet px-10 py-4 font-display text-lg font-semibold tracking-widest text-black shadow-[0_0_40px_rgba(34,211,238,.35)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neon-cyan disabled:opacity-60"
          >
            {busy ? "LOADING MODELS…" : "START CAMERA"}
          </button>
          <p className="mt-5 text-sm text-slate-400">Your camera feed is processed locally in your browser.</p>
        </main>
      ) : (
        <main className="mx-auto max-w-7xl px-4 py-6">
          <header className="mb-5 flex items-center justify-between">
            <h1 className="bg-gradient-to-r from-neon-cyan to-neon-violet bg-clip-text font-display text-2xl font-bold tracking-wide text-transparent">
              AI VISION LAB
            </h1>
            <span className="text-xs text-slate-400">Processed locally in your browser</span>
          </header>
          {errorBanner}

          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <section>
              <div
                ref={boxRef}
                className={`cam glass relative w-full overflow-hidden bg-black/70 ${phase === "live" ? "shadow-[0_0_50px_rgba(34,211,238,.22)]" : ""}`}
                style={{ aspectRatio: aspect }}
              >
                <video
                  ref={videoRef}
                  playsInline muted
                  className={`absolute inset-0 h-full w-full object-contain ${phase === "live" ? "" : "hidden"}`}
                  style={{ transform: "scaleX(-1)" }}
                />
                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-contain" />

                {phase === "off" && (
                  <div className="absolute inset-0 grid place-items-center text-slate-400">Camera is off. Press Start camera.</div>
                )}

                {phase === "live" && (
                  <>
                    <div className="absolute left-3 top-3 flex flex-wrap gap-2 text-xs">
                      <Chip on>Camera Active</Chip>
                      <Chip on={anything}>{anything ? "Detecting" : "Scanning"}</Chip>
                      <Chip on>{stats.fps} FPS</Chip>
                    </div>
                    {g && (
                      <div key={stats.gesture} className="pop absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-2xl border border-neon-cyan/40 bg-black/50 px-5 py-2 font-display text-2xl font-semibold tracking-wider text-white shadow-[0_0_30px_rgba(34,211,238,.35)] backdrop-blur-md sm:text-4xl">
                        <span className="mr-3" aria-hidden>{g.emoji}</span>{g.label}
                      </div>
                    )}
                    {opts.fx && fxKey > 0 && (
                      <div key={fxKey} className="pointer-events-none absolute inset-0" aria-hidden>
                        <div className="screen-glow absolute inset-0" />
                        <div className="thumb-text absolute inset-0 grid place-items-center text-center">
                          <div>
                            <div className="text-6xl sm:text-8xl">👍</div>
                            <div className="font-display text-4xl font-bold tracking-wider text-white drop-shadow-[0_0_24px_#22d3ee] sm:text-6xl">
                              THUMBS UP!
                            </div>
                            <div className="mt-2 text-2xl sm:text-3xl">✨ 🎉 ✨</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="glass mt-4 grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-6">
                <button
                  onClick={phase === "live" ? stop : start}
                  disabled={busy}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon-cyan disabled:opacity-60 ${
                    phase === "live"
                      ? "border border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                      : "bg-gradient-to-r from-neon-cyan to-neon-violet text-black hover:brightness-110"
                  }`}
                >
                  {busy ? "Starting…" : phase === "live" ? "Stop camera" : "Start camera"}
                </button>
                <Toggle label="Hand tracking" on={opts.hands} set={set("hands")} />
                <Toggle label="Face tracking" on={opts.face} set={set("face")} />
                <Toggle label="Person detection" on={opts.person} set={set("person")} />
                <Toggle label="Effects" on={opts.fx} set={set("fx")} />
                <button
                  onClick={toggleFullscreen}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition hover:border-neon-cyan/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon-cyan"
                >
                  Fullscreen
                </button>
              </div>
            </section>

            <aside className="glass h-fit p-5" aria-live="polite">
              <h2 className="mb-2 font-display text-sm font-semibold tracking-widest text-neon-cyan">COMPUTER VISION STATUS</h2>
              <Row icon="👤" label="People" value={opts.person ? stats.people : "Off"} />
              <Row icon="✋" label="Hands" value={opts.hands ? stats.hands : "Off"} />
              <Row icon="👁" label="Eyes" value={opts.face ? (stats.eyes ? "Detected" : "None") : "Off"} />
              <Row icon="👀" label="Direction" value={opts.face && stats.eyes ? stats.dir.toUpperCase() : "—"} />
              <Row icon="👍" label="Gesture" value={opts.hands ? (GESTURES[stats.gesture]?.label ?? "NONE") : "Off"} />
              <Row icon="⚡" label="FPS" value={phase === "live" ? stats.fps : "—"} />
            </aside>
          </div>
        </main>
      )}
    </div>
  );
}

function Chip({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1 backdrop-blur-md">
      <span className={`h-2 w-2 rounded-full ${on ? "bg-neon-cyan shadow-[0_0_8px_#22d3ee]" : "bg-slate-500"}`} />
      {children}
    </span>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-3 last:border-0">
      <span className="flex items-center gap-2 text-slate-300"><span aria-hidden>{icon}</span>{label}</span>
      <span className="font-display text-lg text-white">{value}</span>
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button
      role="switch" aria-checked={on} onClick={() => set(!on)}
      className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm transition hover:border-neon-cyan/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon-cyan"
    >
      <span>{label}</span>
      <span className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition ${on ? "bg-neon-cyan/80" : "bg-white/15"}`}>
        <span className={`block h-4 w-4 rounded-full bg-white transition ${on ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}
