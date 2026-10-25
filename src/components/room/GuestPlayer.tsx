"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ear,
  Loader2,
  Radio,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import { api } from "@/lib/api";
import { GuestEngine } from "@/lib/audioEngine";
import { RTC_CONFIG, sampleGuestStats } from "@/lib/rtc";
import Visualizer from "@/components/Visualizer";
import { Pill, SectionLabel, Stat } from "@/components/room/ui";

type Conn = "connecting" | "waiting" | "live" | "reconnecting";

export default function GuestPlayer({
  code,
  peerId,
  label,
}: {
  code: string;
  peerId: string;
  label: string;
}) {
  const [conn, setConn] = useState<Conn>("connecting");
  const [soundOn, setSoundOn] = useState(false);
  const [latency, setLatency] = useState(0);
  const [trim, setTrim] = useState(0);
  const [align, setAlign] = useState(180);
  const [loss, setLoss] = useState(0);
  const [hostAlive, setHostAlive] = useState(true);
  const [mode, setMode] = useState<string>("idle");
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [stuck, setStuck] = useState(false);

  const engineRef = useRef(new GuestEngine());
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const lastSigRef = useRef(0);
  const latencyRef = useRef(0);
  const alignRef = useRef(180);
  const connRef = useRef<Conn>("connecting");

  alignRef.current = align;
  connRef.current = conn;

  /* ————— signalling + media pipeline ————— */

  useEffect(() => {
    let alive = true;
    const engine = engineRef.current;
    engine.ensure();

    const handleOffer = async (payload: { type: RTCSdpType; sdp: string }, from: string) => {
      // A fresh offer always means a fresh connection (host restarted too).
      pcRef.current?.close();
      pendingIceRef.current = [];

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      pc.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        engine.attach(stream);
        setConn(pc.connectionState === "connected" ? "live" : "connecting");
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          void api
            .sendSignal(code, {
              from: peerId,
              to: from,
              kind: "candidate",
              payload: ev.candidate.toJSON(),
            })
            .catch(() => {});
        }
      };
      pc.onconnectionstatechange = () => {
        if (!alive) return;
        if (pc.connectionState === "connected") setConn("live");
        if (pc.connectionState === "connecting") setConn((c) => (c === "live" ? c : "connecting"));
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          setConn("reconnecting");
        }
      };

      try {
        await pc.setRemoteDescription(payload);
        const queued = pendingIceRef.current;
        pendingIceRef.current = [];
        for (const c of queued) await pc.addIceCandidate(c);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await api.sendSignal(code, {
          from: peerId,
          to: from,
          kind: "answer",
          payload: { type: pc.localDescription?.type ?? "answer", sdp: pc.localDescription?.sdp ?? "" },
        });
      } catch {
        setConn("reconnecting");
      }
    };

    const pollSignals = async () => {
      try {
        const { signals } = await api.signals(code, peerId, lastSigRef.current);
        if (!alive) return;
        for (const sig of signals) {
          lastSigRef.current = Math.max(lastSigRef.current, sig.id);
          if (sig.kind === "offer") {
            await handleOffer(JSON.parse(sig.payload), sig.from);
          } else if (sig.kind === "candidate") {
            const candidate = JSON.parse(sig.payload) as RTCIceCandidateInit | null;
            if (!candidate) continue;
            const pc = pcRef.current;
            if (pc && pc.remoteDescription) {
              try {
                await pc.addIceCandidate(candidate);
              } catch {
                /* out of order */
              }
            } else {
              pendingIceRef.current.push(candidate);
            }
          }
        }
        // no offer yet — we're waiting on the host
        setConn((c) => (c === "connecting" && !pcRef.current ? "waiting" : c));
      } catch {
        /* transient */
      }
    };

    const pollInfo = async () => {
      try {
        const info = await api.getSession(code);
        if (!alive) return;
        setMode(info.mode);
        setHostAlive(info.hostAlive);
        setAlign(info.alignDelayMs);
        // phase trim: add whatever our own link is missing to reach the target
        const extra = Math.max(0, info.alignDelayMs - latencyRef.current);
        engine.setDelayMs(extra);
      } catch {
        /* keep last state */
      }
    };

    const pollStats = async () => {
      const pc = pcRef.current;
      if (!pc || pc.connectionState !== "connected") return;
      const s = await sampleGuestStats(pc);
      if (!s || !alive) return;
      latencyRef.current = s.latencyMs;
      setLatency(s.latencyMs);
      setLoss(Math.round(s.lossPct * 10) / 10);
    };

    const heartbeat = () => {
      void api.heartbeatPeer(code, peerId, latencyRef.current).catch(() => {});
    };

    void pollInfo();
    heartbeat();
    const t1 = setInterval(pollSignals, 750);
    const t2 = setInterval(pollInfo, 2500);
    const t3 = setInterval(pollStats, 2000);
    const t4 = setInterval(heartbeat, 4000);

    const onHide = () => api.beaconLeave(code, peerId);
    window.addEventListener("pagehide", onHide);

    // watchdog: surface a network hint if the link never establishes
    const watchdog = setTimeout(() => {
      if (connRef.current !== "live") setStuck(true);
    }, 15_000);

    return () => {
      alive = false;
      clearInterval(t1);
      clearInterval(t2);
      clearInterval(t3);
      clearInterval(t4);
      clearTimeout(watchdog);
      window.removeEventListener("pagehide", onHide);
      pcRef.current?.close();
      engine.dispose();
    };
  }, [code, peerId]);

  useEffect(() => {
    if (conn === "live") setStuck(false);
  }, [conn]);

  // keep the trim readout in sync with the engine's actual delay
  useEffect(() => {
    const t = setInterval(() => setTrim(Math.round(engineRef.current.getDelayMs())), 800);
    return () => clearInterval(t);
  }, []);

  const enableSound = async () => {
    await engineRef.current.resume();
    setSoundOn(engineRef.current.running);
  };

  const statusPill = useMemo(() => {
    if (conn === "live" && hostAlive) return <Pill state="live" text="Locked & live" />;
    if (!hostAlive) return <Pill state="wait" text="Host reconnecting" />;
    if (conn === "reconnecting") return <Pill state="wait" text="Re-linking" />;
    return <Pill state="wait" text="Tuning in" />;
  }, [conn, hostAlive]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      {/* ——— the stage ——— */}
      <section className="panel ticks ticks-volt relative overflow-hidden p-5 sm:p-8">
        <SectionLabel right={statusPill}>
          {label} — Listening Post
        </SectionLabel>

        <div className="relative">
          <Visualizer
            getAnalyser={() => engineRef.current.analyser}
            accent="pulse"
            className="mx-auto h-[320px] w-full max-w-md sm:h-[400px]"
          />

          {/* center overlay states */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {!soundOn ? (
              <button
                onClick={() => void enableSound()}
                className="btn btn-volt pointer-events-auto"
              >
                <Ear className="h-4 w-4" /> Tap to enable sound
              </button>
            ) : conn === "live" ? null : (
              <span className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-fog">
                <Loader2 className="spin h-4 w-4 text-volt" />
                {hostAlive
                  ? mode === "idle"
                    ? "Waiting for the host to broadcast"
                    : "Locking onto the relay"
                  : "Host is reconnecting"}
              </span>
            )}
          </div>
        </div>

        <div className="mt-2 text-center">
          <p className="font-mono text-[10px] uppercase leading-loose tracking-[0.25em] text-fog">
            Audio is relayed peer-to-peer from the host —<br className="sm:hidden" />
            it never touches a server.
          </p>
        </div>
      </section>

      {/* ——— telemetry + controls ——— */}
      <div className="flex min-w-0 flex-col gap-5">
        <section className="panel p-5 sm:p-6">
          <SectionLabel right={<Waves className="h-3.5 w-3.5 text-[#a793ff]" />}>
            Sync Telemetry
          </SectionLabel>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Stat label="Link latency" value={String(latency)} unit="ms" />
            <Stat label="Phase trim" value={`+${trim}`} unit="ms" tone="pulse" />
            <Stat label="Lock target" value={String(align)} unit="ms" />
            <Stat label="Packet loss" value={String(loss)} unit="%" tone={loss > 2 ? "bone" : "fog"} />
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <Stat label="Codec" value="OPUS 192K STEREO" tone="volt" />
          </div>
          <p className="mt-4 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-fog">
            Your playback is delayed by the phase trim so that every listener in
            the room lands on the same millisecond as the lock target.
          </p>
          {stuck ? (
            <p className="mt-3 border border-ember/40 bg-ember/5 px-3 py-2.5 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-ember">
              Still tuning after 15s — the link is being blocked, most likely by
              a strict router. Move the host and this device onto the same
              Wi-Fi, then rejoin the room.
            </p>
          ) : null}
        </section>

        <section className="panel p-5 sm:p-6">
          <SectionLabel right={<Radio className="h-3.5 w-3.5 text-volt" />}>
            Your Monitor
          </SectionLabel>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const m = !muted;
                setMuted(m);
                engineRef.current.setVolume(m ? 0 : volume);
              }}
              className="btn flex-none !px-3 !py-3"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                setMuted(v === 0);
                engineRef.current.setVolume(v);
              }}
              className="fader"
              style={{ ["--fill" as string]: `${volume * 100}%` }}
              aria-label="Volume"
            />
          </div>
          {mode === "theatre" ? (
            <p className="mt-4 border border-pulse/40 bg-pulse/5 px-3 py-2.5 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-[#c9bfff]">
              THEATRE MODE — the host&apos;s picture is buffered to the same lock
              target. Lip sync is frame-accurate.
            </p>
          ) : (
            <p className="mt-4 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-fog">
              Pair your earbuds to this device like you always do — that&apos;s
              the whole trick.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

