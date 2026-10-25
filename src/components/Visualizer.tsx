"use client";

import { useEffect, useRef } from "react";

/**
 * Live circular spectrum driven by an AnalyserNode. Falls back to a gentle
 * idle wave when no analyser is attached yet.
 */
export default function Visualizer({
  getAnalyser,
  className,
  accent = "volt",
}: {
  getAnalyser: () => AnalyserNode | null;
  className?: string;
  accent?: "volt" | "pulse";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const fft = new Uint8Array(128);
    let level = 0;

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

    const N = 96;
    const start = performance.now();
    const rgb = accent === "volt" ? "200,255,61" : "124,92,255";

    const frame = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h);
      const R0 = base * 0.26;

      const analyser = getAnalyser();
      let live = false;
      if (analyser) {
        analyser.getByteFrequencyData(fft);
        live = true;
        let sum = 0;
        for (let i = 0; i < fft.length; i++) sum += fft[i];
        const instant = sum / fft.length / 255;
        level += (instant - level) * 0.3;
      } else {
        level += (0 - level) * 0.05;
      }

      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 - Math.PI / 2;
        let amp: number;
        if (live) {
          const bin = Math.floor(
            Math.pow(i / N, 1.6) * (fft.length - 1)
          );
          amp = 0.06 + (fft[bin] / 255) * 0.94;
        } else {
          amp =
            0.16 +
            0.12 * Math.sin(i * 0.6 + t * 0.0012) +
            0.08 * Math.sin(i * 0.19 - t * 0.0018);
          amp = Math.max(0.05, amp);
        }
        const len = base * 0.015 + amp * base * 0.19;
        const x0 = cx + Math.cos(a) * R0;
        const y0 = cy + Math.sin(a) * R0;
        const x1 = cx + Math.cos(a) * (R0 + len);
        const y1 = cy + Math.sin(a) * (R0 + len);
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${rgb},${(0.14 + amp * 0.72).toFixed(3)})`;
        ctx.lineWidth = base * 0.004;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      // level halo
      const halo = base * (0.1 + level * 0.22);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, halo * 1.8);
      g.addColorStop(0, `rgba(${rgb},${(0.05 + level * 0.35).toFixed(3)})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.fillStyle = g;
      ctx.arc(cx, cy, halo * 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = "rgba(237,239,243,0.12)";
      ctx.lineWidth = 1;
      ctx.arc(cx, cy, base * 0.1, 0, Math.PI * 2);
      ctx.stroke();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [getAnalyser, accent]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
