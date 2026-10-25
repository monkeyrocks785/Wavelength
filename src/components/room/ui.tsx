"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

export function SectionLabel({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <span className="label">{children}</span>
      <div className="hairline flex-1" />
      {right}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone = "bone",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "bone" | "volt" | "pulse" | "fog";
}) {
  const color =
    tone === "volt"
      ? "text-volt"
      : tone === "pulse"
        ? "text-[#a793ff]"
        : tone === "fog"
          ? "text-fog"
          : "text-bone";
  return (
    <div className="min-w-0">
      <div className="label mb-1.5">{label}</div>
      <div className={`num text-lg leading-none ${color}`}>
        {value}
        {unit ? (
          <span className="ml-1 text-[10px] uppercase tracking-[0.15em] text-fog">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function Pill({ state, text }: { state: "live" | "wait" | "idle"; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 border border-line bg-coal px-3 py-1.5">
      <span
        className={`dot ${state === "live" ? "dot-live" : state === "wait" ? "dot-wait" : "dot-idle"}`}
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-mist">
        {text}
      </span>
    </span>
  );
}

export function CopyChip({ text, big }: { text: string; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="group inline-flex items-center gap-2.5 border border-line bg-coal px-3 py-1.5 transition-colors hover:border-volt"
      title="Copy room code"
    >
      <span
        className={`num text-bone ${big ? "text-xl tracking-[0.3em]" : "text-xs tracking-[0.25em]"}`}
      >
        {text}
      </span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-volt" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-fog transition-colors group-hover:text-volt" />
      )}
    </button>
  );
}

/**
 * Alignment rail — visualises where a listener sits against the session's
 * phase-lock target. Scale: 0 → 400 ms.
 */
export function AlignRail({
  latency,
  target,
}: {
  latency: number;
  target: number;
}) {
  const max = 420;
  const lx = Math.min(100, (latency / max) * 100);
  const tx = Math.min(100, (target / max) * 100);
  return (
    <div className="relative h-8 w-full">
      <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-line" />
      {/* target marker */}
      <div
        className="absolute top-0 h-full w-px bg-pulse"
        style={{ left: `${tx}%` }}
      />
      {/* latency position */}
      <div
        className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-volt shadow-[0_0_8px_rgba(200,255,61,0.7)]"
        style={{ left: `${lx}%` }}
      />
      <span className="label absolute -bottom-1 left-0" style={{ fontSize: 9 }}>
        0
      </span>
      <span className="label absolute -bottom-1 right-0" style={{ fontSize: 9 }}>
        {max}ms
      </span>
    </div>
  );
}
