"use client";

import { useEffect, useRef } from "react";

/**
 * Generative "waveform orbit" — a circular spectrum rendered procedurally.
 * Pure sine-driven (idle), rendered on a dpr-aware 2D canvas.
 */
export default function AmbientField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, Math.floor(rect.width * dpr));
      h = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = w;
      canvas.height = h;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const N = 132;
    const start = performance.now();

    const frame = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h);

      // orbital grid rings
      for (let r = 0; r < 5; r++) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(237,239,243,0.045)";
        ctx.lineWidth = 1;
        ctx.arc(cx, cy, base * (0.14 + r * 0.088), 0, Math.PI * 2);
        ctx.stroke();
      }

      // radial spectrum bars
      const R0 = base * 0.24;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + t * 0.00012;
        let amp =
          0.3 +
          0.22 * Math.sin(i * 0.68 + t * 0.0011) +
          0.14 * Math.sin(i * 0.21 - t * 0.0017) +
          0.12 * Math.sin(i * 1.31 + t * 0.00062);
        amp = Math.max(0.04, Math.min(0.78, amp));
        const len = base * 0.02 + amp * base * 0.17;
        const x0 = cx + Math.cos(a) * R0;
        const y0 = cy + Math.sin(a) * R0;
        const x1 = cx + Math.cos(a) * (R0 + len);
        const y1 = cy + Math.sin(a) * (R0 + len);
        const violet = i % 5 === 0;
        ctx.beginPath();
        ctx.strokeStyle = violet
          ? `rgba(124,92,255,${0.25 + amp * 0.55})`
          : `rgba(200,255,61,${0.16 + amp * 0.6})`;
        ctx.lineWidth = i % 6 === 0 ? base * 0.006 : base * 0.0032;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      // breathing core
      const breath = 0.5 + 0.5 * Math.sin(t * 0.0012);
      const coreR = base * (0.085 + breath * 0.02);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.4);
      g.addColorStop(0, "rgba(200,255,61,0.20)");
      g.addColorStop(0.5, "rgba(124,92,255,0.07)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.fillStyle = g;
      ctx.arc(cx, cy, coreR * 2.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = "rgba(237,239,243,0.16)";
      ctx.lineWidth = 1;
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.stroke();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
