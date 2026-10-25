"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  AudioWaveform,
  Bluetooth,
  BluetoothOff,
  Globe,
  Clapperboard,
  Ear,
  Gauge,
  Headphones,
  Loader2,
  Lock,
  MonitorUp,
  Radio,
  RadioTower,
  ShieldCheck,
  Timer,
  TriangleAlert,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import AmbientField from "@/components/AmbientField";

/* ———————————————— motion presets ———————————————— */

const rise = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] as const },
  }),
};

function Reveal({ children, i = 0, className }: { children: ReactNode; i?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={rise}
      custom={i}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </motion.div>
  );
}

/* ———————————————— page ———————————————— */

export default function Home() {
  const router = useRouter();
  const [sessionName, setSessionName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.createSession(sessionName || "Movie night");
      sessionStorage.setItem(`wl:${res.code}:host`, res.hostToken);
      router.push(`/room/${res.code}?host=${res.hostToken}`);
    } catch {
      setErr("Could not open a session — try again.");
      setBusy(false);
    }
  };

  const join = () => {
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) {
      setErr("Enter the 6-letter room code from the host screen.");
      return;
    }
    router.push(`/room/${c}`);
  };

  return (
    <div className="gridbg min-h-screen">
      {/* ——— nav ——— */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center border border-volt bg-volt/10">
            <AudioWaveform className="h-4 w-4 text-volt" />
          </span>
          <span className="font-mono text-xs font-medium uppercase tracking-[0.35em] text-bone">
            Wavelength
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="label hidden md:inline">Group audio, engineered — V1.0</span>
          <a href="#console" className="btn btn-volt !px-4 !py-2.5">
            Start
          </a>
        </div>
      </nav>

      {/* ——— hero ——— */}
      <header className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <Reveal i={0}>
              <div className="mb-6 flex items-center gap-3">
                <span className="dot dot-live" />
                <span className="label !text-volt">Silent cinema protocol</span>
                <div className="hairline w-16" />
                <span className="label">N° 001</span>
              </div>
            </Reveal>

            <motion.h1
              variants={rise}
              custom={1}
              initial="hidden"
              animate="show"
              className="display text-[13.5vw] leading-[0.9] sm:text-[5.6rem] lg:text-[6.4rem] xl:text-[7rem]"
            >
              One screen.
              <br />
              <span className="text-volt" style={{ textShadow: "0 0 60px rgba(200,255,61,0.25)" }}>
                Every
              </span>{" "}
              earbud.
            </motion.h1>

            <Reveal i={2}>
              <p className="mt-7 max-w-xl text-[15px] leading-relaxed text-fog">
                Movie night for a group, but your laptop pairs with{" "}
                <span className="text-bone">one</span> pair of earbuds. Wavelength
                routes around the bottleneck: it relays the sound peer-to-peer to
                every phone in the room — each listener pairs their own earbuds —
                and phase-locks all streams to the same millisecond.
              </p>
            </Reveal>

            {/* console */}
            <Reveal i={3}>
              <div id="console" className="panel ticks mt-9 max-w-xl scroll-mt-24">
                <div className="grid sm:grid-cols-2">
                  <div className="border-b border-line p-5 sm:border-b-0 sm:border-r">
                    <label className="label mb-3 flex items-center gap-2">
                      <Radio className="h-3.5 w-3.5 text-volt" /> Host a session
                    </label>
                    <input
                      value={sessionName}
                      onChange={(e) => setSessionName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void start()}
                      placeholder="Movie night"
                      className="input mb-3"
                      maxLength={40}
                    />
                    <button onClick={() => void start()} disabled={busy} className="btn btn-volt w-full">
                      {busy ? <Loader2 className="spin h-3.5 w-3.5" /> : <RadioTower className="h-3.5 w-3.5" />}
                      Open room
                    </button>
                  </div>
                  <div className="p-5">
                    <label className="label mb-3 flex items-center gap-2">
                      <Ear className="h-3.5 w-3.5 text-[#a793ff]" /> Join with code
                    </label>
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && join()}
                      placeholder="XKP9TR"
                      className="input code-input mb-3"
                    />
                    <button onClick={join} className="btn w-full">
                      Tune in <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {err ? (
                  <p className="border-t border-ember/40 bg-ember/5 px-4 py-2.5 font-mono text-[10px] tracking-[0.08em] text-ember">
                    {err}
                  </p>
                ) : null}
              </div>
            </Reveal>

            <Reveal i={4}>
              <div className="mt-7 flex flex-wrap gap-x-8 gap-y-3">
                <SpecChip icon={<Timer className="h-3.5 w-3.5" />} k="Link latency" v="~0.15 s" />
                <SpecChip icon={<Gauge className="h-3.5 w-3.5" />} k="Pipe" v="Opus 192K stereo" />
                <SpecChip icon={<Users className="h-3.5 w-3.5" />} k="Listeners" v="Up to 8" />
                <SpecChip icon={<Lock className="h-3.5 w-3.5" />} k="Installs" v="Zero" />
              </div>
            </Reveal>
          </div>

          {/* ambient field */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
            className="panel ticks hidden flex-col lg:flex"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="label">Ambient field / CH-01</span>
              <span className="flex items-center gap-2">
                <span className="dot dot-live" />
                <span className="label !text-volt">Standby</span>
              </span>
            </div>
            <AmbientField className="h-[380px] w-full xl:h-[430px]" />
            <div className="flex items-center justify-between border-t border-line px-4 py-3">
              <span className="num text-[10px] tracking-[0.2em] text-fog">
                SR 48K · CH 2 · OPUS 192K
              </span>
              <span className="num text-[10px] tracking-[0.2em] text-fog">DTLS · P2P</span>
            </div>
          </motion.div>
        </div>
      </header>

      <Marquee
        items={[
          "P2P AUDIO RELAY",
          "OPUS 192KBPS STEREO",
          "PHASE-LOCKED PLAYBACK",
          "NO INSTALLS",
          "AUDIO NEVER TOUCHS A SERVER",
          "ONE LAPTOP · EVERY EARBUD",
        ]}
      />

      {/* ——— the bottleneck ——— */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-3 flex items-center gap-3">
            <span className="label !text-volt">01</span>
            <div className="hairline w-10" />
            <span className="label">The bottleneck</span>
          </div>
          <h2 className="display max-w-3xl text-4xl sm:text-6xl">
            Bluetooth tops out at one pair.{" "}
            <span className="text-fog">Your crowd isn&apos;t the problem.</span>
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <Reveal i={1} className="panel p-6 sm:p-8">
            <div className="mb-5 flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <BluetoothOff className="h-4 w-4 text-ember" />
                <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-mist">
                  Classic A2DP
                </span>
              </span>
              <span className="label">1 sink</span>
            </div>
            <StarDiagram variant="bt" />
            <p className="mt-6 text-[13px] leading-relaxed text-fog">
              Desktop Bluetooth stacks were designed for a single listener: one
              A2DP audio sink, one latency budget. Pair more and the OS either
              refuses, stutters, or downgrades everything to mono-call quality.
            </p>
          </Reveal>

          <Reveal i={2} className="panel ticks ticks-volt p-6 sm:p-8">
            <div className="mb-5 flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <AudioWaveform className="h-4 w-4 text-volt" />
                <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-mist">
                  Wavelength relay
                </span>
              </span>
              <span className="label !text-volt">8 sinks</span>
            </div>
            <StarDiagram variant="wl" />
            <p className="mt-6 text-[13px] leading-relaxed text-fog">
              The laptop keeps its own earbuds and also becomes a tiny broadcast
              tower: every friend joins from their own phone over a direct WebRTC
              link, pairing{" "}
              <span className="text-bone">their</span> earbuds — a clean 1-to-1
              Bluetooth connection each, full quality, no OS fights.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ——— the lock ——— */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 sm:pb-28">
        <Reveal>
          <div className="mb-3 flex items-center gap-3">
            <span className="label !text-volt">02</span>
            <div className="hairline w-10" />
            <span className="label">The lock</span>
          </div>
          <h2 className="display max-w-3xl text-4xl sm:text-6xl">
            Every earbud, <span className="text-volt">one millisecond.</span>
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <Step
            n="01"
            icon={<MonitorUp className="h-5 w-5 text-volt" />}
            title="Host relays"
            body="The host shares any tab's audio — or drops in the film file itself. The mix is encoded raw: no echo cancellation, no noise gate, studio Opus."
          />
          <Step
            n="02"
            icon={<Headphones className="h-5 w-5 text-[#a793ff]" />}
            title="Friends tune in"
            body="Each friend opens the room code on their own phone and pairs their own earbuds to it. Nothing to install, nothing to sign up for."
          />
          <Step
            n="03"
            icon={<Gauge className="h-5 w-5 text-cyan" />}
            title="Phase lock"
            body="Every device measures its own link latency, then trims a precision delay so all listeners land on the same lock target. Explosions hit in unison."
          />
        </div>

        {/* sync budget */}
        <Reveal i={3} className="panel mt-5 p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-mist">
              Sync budget — a 5-listener session
            </span>
            <span className="label">Auto-tuned live</span>
          </div>
          <div className="flex h-9 w-full overflow-hidden border border-line">
            <div className="flex items-center justify-center border-r border-ink bg-volt/85" style={{ width: "38%" }}>
              <span className="num text-[9px] font-medium uppercase tracking-[0.14em] text-ink">
                Network ~65ms
              </span>
            </div>
            <div className="flex items-center justify-center border-r border-ink bg-pulse/80" style={{ width: "26%" }}>
              <span className="num text-[9px] font-medium uppercase tracking-[0.14em] text-bone">
                Buffer 45ms
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center bg-cyan/25">
              <span className="num text-[9px] font-medium uppercase tracking-[0.14em] text-cyan">
                Phase trim → all land on 180ms
              </span>
            </div>
          </div>
          <div className="mt-3 flex justify-between">
            <span className="num text-[10px] text-fog">HOST SCREEN — t0</span>
            <span className="num text-[10px] text-fog">
              LISTENER A · B · C · D · E — t0 + 180ms, &lt;10ms apart
            </span>
          </div>
          <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-fog">
            Perceived sync between listeners is what the brain actually notices —
            and ours is tighter than one video frame. Need frame-accurate lips?
            Theatre mode buffers the host&apos;s picture to the same target and
            the offset collapses to zero.
          </p>
        </Reveal>
      </section>

      <Marquee
        items={[
          "SILENT DISCO MODE",
          "lips locked",
          "ZERO CONFIG",
          "SHARED WALL · SHARED SOUND",
          "5X EARBUDS · 1 LAPTOP",
        ]}
        dim
      />

      {/* ——— modes ——— */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-3 flex items-center gap-3">
            <span className="label !text-volt">03</span>
            <div className="hairline w-10" />
            <span className="label">Two ways to broadcast</span>
          </div>
          <h2 className="display max-w-3xl text-4xl sm:text-6xl">Choose your mode.</h2>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <Reveal i={1} className="panel group p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <MonitorUp className="h-6 w-6 text-volt" />
              <span className="num border border-line bg-coal px-2 py-1 text-[10px] tracking-[0.2em] text-fog">
                M-01
              </span>
            </div>
            <h3 className="display mb-3 text-3xl">Tab Relay</h3>
            <p className="mb-6 text-[13px] leading-relaxed text-fog">
              Share the audio of any browser tab or window — Netflix, YouTube,
              Spotify, a local player. Reaches earbuds in roughly a blink
              (~0.15s), the same order as native Bluetooth, but ×5.
            </p>
            <ul className="flex flex-col gap-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
              <Li>Any source the laptop can play</Li>
              <Li>Raw audio — no echo cancellation</Li>
              <Li>All listeners phase-locked together</Li>
            </ul>
          </Reveal>

          <Reveal i={2} className="panel group p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <Clapperboard className="h-6 w-6 text-[#a793ff]" />
              <span className="num border border-line bg-coal px-2 py-1 text-[10px] tracking-[0.2em] text-fog">
                M-02
              </span>
            </div>
            <h3 className="display mb-3 text-3xl">Theatre File</h3>
            <p className="mb-6 text-[13px] leading-relaxed text-fog">
              Drop the actual movie file into the room. The host&apos;s picture is
              buffered by the exact lock target, so every earbud and the screen
              share one millisecond — lip sync indistinguishable from a cinema.
            </p>
            <ul className="flex flex-col gap-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
              <Li>Frame-accurate A/V alignment</Li>
              <Li>Host hears the film through the same lock</Li>
              <Li>File never leaves the laptop</Li>
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ——— fine print ——— */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="grid gap-5 md:grid-cols-3">
          <Fine
            icon={<Globe className="h-4 w-4 text-volt" />}
            title="Requirements"
            body="Host on Chrome or Edge (desktop). Listeners on any modern phone or laptop browser. Same Wi-Fi gives the tightest lock."
          />
          <Fine
            icon={<ShieldCheck className="h-4 w-4 text-volt" />}
            title="Privacy"
            body="Audio travels peer-to-peer over encrypted WebRTC. The server only carries the handshake and room roster — nothing is recorded or relayed."
          />
          <Fine
            icon={<TriangleAlert className="h-4 w-4 text-ember" />}
            title="Limits"
            body="Up to 8 listeners per room. Built for one physical space; the relay intentionally runs without internet relays, so restrictive NATs off-LAN may refuse."
          />
        </div>
      </section>

      {/* ——— footer ——— */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <Reveal>
            <div
              className="display select-none text-center text-[16vw] leading-none lg:text-[10rem]"
              style={{
                WebkitTextStroke: "1px rgba(237,239,243,0.18)",
                color: "transparent",
              }}
            >
              Wavelength
            </div>
          </Reveal>
          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-line pt-6 sm:flex-row">
            <span className="label">Built for movie night — 2026</span>
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-fog">
              <Bluetooth className="h-3.5 w-3.5 text-volt" />
              One laptop, every earbud, zero lag
            </span>
            <a href="#console" className="btn !py-2.5">
              Open a room <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ———————————————— pieces ———————————————— */

function SpecChip({ icon, k, v }: { icon: ReactNode; k: string; v: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="text-volt">{icon}</span>
      <span className="label">{k}</span>
      <span className="num text-[11px] uppercase tracking-[0.15em] text-bone">{v}</span>
    </span>
  );
}

function Li({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <ArrowRight className="h-3 w-3 flex-none text-volt" />
      {children}
    </li>
  );
}

function Step({ n, icon, title, body }: { n: string; icon: ReactNode; title: string; body: string }) {
  return (
    <Reveal i={Number(n)} className="panel ticks p-6 sm:p-7">
      <div className="mb-5 flex items-center justify-between">
        {icon}
        <span className="num text-xl text-linehi">{n}</span>
      </div>
      <h3 className="display mb-3 text-2xl">{title}</h3>
      <p className="text-[13px] leading-relaxed text-fog">{body}</p>
    </Reveal>
  );
}

function Fine({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <Reveal className="border border-line bg-panel p-5">
      <div className="mb-3 flex items-center gap-2.5">
        {icon}
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-mist">{title}</span>
      </div>
      <p className="text-[12px] leading-relaxed text-fog">{body}</p>
    </Reveal>
  );
}

function Marquee({ items, dim }: { items: string[]; dim?: boolean }) {
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-line bg-coal py-3">
      <div className="marquee">
        {row.map((item, i) => (
          <span
            key={i}
            className={`flex items-center font-mono text-[10px] uppercase tracking-[0.35em] ${dim ? "text-fog" : "text-mist"}`}
          >
            <span className="px-6">{item}</span>
            <span className="text-volt">//</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Network star: laptop at centre, listener nodes around it. */
function StarDiagram({ variant }: { variant: "bt" | "wl" }) {
  const cx = 200;
  const cy = 104;
  const nodes = [
    { x: 200, y: 22, ms: "92ms" },
    { x: 320, y: 78, ms: "118ms" },
    { x: 288, y: 172, ms: "141ms" },
    { x: 112, y: 172, ms: "87ms" },
    { x: 80, y: 78, ms: "133ms" },
  ];
  const wl = variant === "wl";
  return (
    <div className="border border-line bg-ink px-2 py-4">
      <svg viewBox="0 0 400 200" className="mx-auto w-full max-w-sm">
        {nodes.map((n, i) => {
          const active = wl || i === 0;
          return (
            <g key={i}>
              <line
                x1={cx}
                y1={cy}
                x2={n.x}
                y2={n.y}
                stroke={active ? (i % 2 ? "#7c5cff" : "#c8ff3d") : "#2c2c33"}
                strokeWidth={active ? 1.2 : 1}
                strokeDasharray={active ? "none" : "3 4"}
              />
              {wl ? (
                <text
                  x={(cx + n.x) / 2 + (n.x >= cx ? 7 : -7)}
                  y={(cy + n.y) / 2 - 4}
                  textAnchor={n.x >= cx ? "start" : "end"}
                  fill="#8e8e99"
                  fontSize="8"
                  fontFamily="var(--font-plex), monospace"
                  letterSpacing="0.12em"
                >
                  {n.ms}
                </text>
              ) : null}
              <rect
                x={n.x - 7}
                y={n.y - 12}
                width="14"
                height="24"
                fill={active ? "#121216" : "transparent"}
                stroke={active ? "#c8ff3d" : "#2c2c33"}
                strokeWidth="1"
              />
              <line
                x1={n.x - 3}
                y1={n.y - 8}
                x2={n.x + 3}
                y2={n.y - 8}
                stroke={active ? "#c8ff3d" : "#2c2c33"}
                strokeWidth="1"
              />
              {!active ? (
                <g stroke="#ff6a3d" strokeWidth="1.4">
                  <line x1={n.x - 6} y1={n.y + 18} x2={n.x + 6} y2={n.y + 30} />
                  <line x1={n.x + 6} y1={n.y + 18} x2={n.x - 6} y2={n.y + 30} />
                </g>
              ) : null}
            </g>
          );
        })}
        {/* host node */}
        <rect x={cx - 30} y={cy - 20} width="60" height="40" fill="#121216" stroke={wl ? "#c8ff3d" : "#8e8e99"} strokeWidth="1.2" />
        <rect x={cx - 22} y={cy - 12} width="44" height="22" fill="none" stroke="#32323a" strokeWidth="1" />
        <text
          x={cx}
          y={cy + 34}
          textAnchor="middle"
          fill={wl ? "#c8ff3d" : "#8e8e99"}
          fontSize="8"
          fontFamily="var(--font-plex), monospace"
          letterSpacing="0.18em"
        >
          {wl ? "LAPTOP + RELAY" : "LAPTOP"}
        </text>
      </svg>
    </div>
  );
}
