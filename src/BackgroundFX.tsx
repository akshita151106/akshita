import { useEffect, useRef } from "react";

export default function BackgroundFX() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current!, ctx = c.getContext("2d")!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pts = Array.from({ length: 45 }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 4e-4, vy: (Math.random() - 0.5) * 4e-4,
      r: Math.random() * 1.6 + 0.4,
      c: Math.random() < 0.5 ? "34,211,238" : "168,85,247",
    }));
    let id = 0;
    const size = () => { c.width = innerWidth; c.height = innerHeight; };
    size();
    addEventListener("resize", size);

    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of pts) {
        if (!reduce) { p.x = (p.x + p.vx + 1) % 1; p.y = (p.y + p.vy + 1) % 1; }
        ctx.fillStyle = `rgba(${p.c},.5)`;
        ctx.beginPath(); ctx.arc(p.x * c.width, p.y * c.height, p.r, 0, 7); ctx.fill();
      }
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(id); removeEventListener("resize", size); };
  }, []);

  return <canvas ref={ref} className="fixed inset-0 -z-10 h-full w-full" aria-hidden />;
}
