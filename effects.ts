type Kind = "dot" | "confetti" | "emoji";
interface P {
  x: number; y: number; vx: number; vy: number;
  age: number; life: number; size: number;
  color: string; kind: Kind; rot: number; vr: number;
}
interface Ring { x: number; y: number; t: number; dur: number; r: number; color: string }

const COLORS = ["#22d3ee", "#a855f7", "#f0abfc", "#67e8f9", "#fde047", "#ffffff"];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = () => COLORS[(Math.random() * COLORS.length) | 0];

export class Effects {
  private ps: P[] = [];
  private rings: Ring[] = [];
  private last = 0;
  private u = 1; // scale relative to a 1280px-wide frame

  burst(x: number, y: number, W: number) {
    const u = (this.u = W / 1280);
    this.rings.push(
      { x, y, t: 0, dur: 1.2, r: 160 * u, color: "#22d3ee" },
      { x, y, t: -0.15, dur: 1.2, r: 230 * u, color: "#a855f7" }
    );
    for (let i = 0; i < 90; i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(120, 620) * u;
      this.ps.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: rnd(0.8, 1.6),
        size: rnd(2, 6) * u, color: pick(), kind: "dot", rot: 0, vr: 0 });
    }
    for (let i = 0; i < 80; i++) {
      const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), s = rnd(300, 900) * u;
      this.ps.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: rnd(1.2, 1.9),
        size: rnd(8, 16) * u, color: pick(), kind: "confetti", rot: rnd(0, 6), vr: rnd(-10, 10) });
    }
    for (let i = 0; i < 9; i++) {
      this.ps.push({ x: x + rnd(-60, 60) * u, y, vx: rnd(-120, 120) * u, vy: rnd(-380, -200) * u, age: 0,
        life: rnd(1.2, 1.9), size: rnd(36, 70) * u, color: "#fff", kind: "emoji", rot: 0, vr: 0 });
    }
  }

  pulse(x: number, y: number, W: number, color: string) {
    this.rings.push({ x, y, t: 0, dur: 0.8, r: (90 * W) / 1280, color });
  }

  clear() { this.ps = []; this.rings = []; }

  draw(ctx: CanvasRenderingContext2D, now: number) {
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;
    const drag = Math.pow(0.35, dt);
    const u = this.u;

    ctx.save();
    // Rings
    this.rings = this.rings.filter((r) => (r.t += dt) < r.dur);
    for (const r of this.rings) {
      if (r.t < 0) continue;
      const p = r.t / r.dur, e = 1 - Math.pow(1 - p, 3);
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = r.color; ctx.shadowColor = r.color; ctx.shadowBlur = 25;
      ctx.lineWidth = 1 + 6 * (1 - p);
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * e, 0, Math.PI * 2); ctx.stroke();
    }
    // Particles
    this.ps = this.ps.filter((p) => (p.age += dt) < p.life);
    for (const p of this.ps) {
      if (p.kind === "confetti") { p.vy += 1100 * u * dt; p.rot += p.vr * dt; }
      if (p.kind !== "emoji") { p.vx *= drag; p.vy *= p.kind === "dot" ? drag : 1; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = Math.max(0, 1 - Math.pow(p.age / p.life, 2));
      if (p.kind === "dot") {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      } else if (p.kind === "confetti") {
        ctx.shadowBlur = 0; ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
      } else {
        ctx.shadowBlur = 0;
        ctx.font = `${p.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("👍", p.x + Math.sin(p.age * 5) * 12 * u, p.y);
      }
    }
    ctx.restore();
  }
}
