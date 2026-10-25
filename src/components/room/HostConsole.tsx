"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Antenna,
  Clapperboard,
  Loader2,
  MonitorUp,
  Square,
  Users,
  Waves,
  X,
} from "lucide-react";
import { api, type PeerInfo } from "@/lib/api";
import { MeterTap } from "@/lib/audioEngine";
import {
  RTC_CONFIG,
  kbpsBetween,
  mungeOpus,
  sampleHostStats,
} from "@/lib/rtc";
import Visualizer from "@/components/Visualizer";
import TheatrePlayer from "@/components/room/TheatrePlayer";
import { AlignRail, Pill, SectionLabel, Stat } from "@/components/room/ui";

type Mode = "idle" | "relay" | "theatre";

interface PeerStats {
  kbps: number;
  rttMs: number;
  lossPct: number;
}

const MIN_ALIGN = 80;
const MAX_ALIGN = 420;
const ALIGN_PAD = 25;

export default function HostConsole({
  code,
  hostToken,
}: {
  code: string;
  hostToken: string;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [stats, setStats] = useState<Record<string, PeerStats>>({});
  const [alignMs, setAlignMs] = useState(180);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasStream, setHasStream] = useState(false);

  const pcsRef = useRef(new Map<string, RTCPeerConnection>());
  const sendersRef = useRef(new Map<string, RTCRtpSender>());
  const pendingIceRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const prevStatRef = useRef(new Map<string, { bytes: number; at: number }>());
  const streamRef = useRef<MediaStream | null>(null);
  const meterTapRef = useRef(new MeterTap());
  const lastSigRef = useRef(0);
  const modeRef = useRef<Mode>("idle");
  const alignRef = useRef(180);

  modeRef.current = mode;
  alignRef.current = alignMs;

  /* ————————— WebRTC star ————————— */

  const sendSignal = useCallback(
    (to: string, kind: string, payload: unknown) => {
      void api
        .sendSignal(code, { from: hostToken, to, kind, payload })
        .catch(() => {});
    },
    [code, hostToken]
  );

  const offerTo = useCallback(
    async (peerId: string, pc: RTCPeerConnection) => {
      if (pc.signalingState !== "stable") return;
      try {
        const offer = await pc.createOffer();
        offer.sdp = mungeOpus(offer.sdp ?? "");
        await pc.setLocalDescription(offer);
        sendSignal(peerId, "offer", {
          type: pc.localDescription?.type ?? "offer",
          sdp: pc.localDescription?.sdp ?? "",
        });
      } catch {
        /* peer vanished mid-negotiation */
      }
    },
    [sendSignal]
  );

  const attachTrack = useCallback((peerId: string, pc: RTCPeerConnection) => {
    const stream = streamRef.current;
    const track = stream?.getAudioTracks()[0];
    if (!track || !stream) return;
    const existing = sendersRef.current.get(peerId);
    if (existing) {
      void existing.replaceTrack(track);
    } else {
      sendersRef.current.set(peerId, pc.addTrack(track, stream));
    }
  }, []);

  const createPc = useCallback(
    (peerId: string) => {
      const prev = pcsRef.current.get(peerId);
      if (prev) return prev;
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcsRef.current.set(peerId, pc);
      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal(peerId, "candidate", e.candidate.toJSON());
      };
      pc.onnegotiationneeded = () => void offerTo(peerId, pc);
      attachTrack(peerId, pc);
      return pc;
    },
    [attachTrack, offerTo, sendSignal]
  );

  const dropPc = useCallback((peerId: string) => {
    pcsRef.current.get(peerId)?.close();
    pcsRef.current.delete(peerId);
    sendersRef.current.delete(peerId);
    pendingIceRef.current.delete(peerId);
    prevStatRef.current.delete(peerId);
  }, []);

  /* ————————— polling loops ————————— */

  useEffect(() => {
    let alive = true;

    const pollPeers = async () => {
      try {
        const { peers: fresh } = await api.peers(code, hostToken);
        if (!alive) return;
        setPeers(fresh);
        const freshIds = new Set(fresh.map((p) => p.id));
        // create connections for newcomers, drop the departed
        for (const p of fresh) createPc(p.id);
        for (const id of Array.from(pcsRef.current.keys())) {
          if (!freshIds.has(id)) dropPc(id);
        }
        // auto phase-lock target: slowest listener + slack
        if (fresh.length > 0) {
          const slowest = Math.max(...fresh.map((p) => p.latencyMs || 0));
          const target = Math.max(
            MIN_ALIGN,
            Math.min(MAX_ALIGN, slowest + ALIGN_PAD)
          );
          if (Math.abs(target - alignRef.current) > 12) setAlignMs(target);
        }
      } catch {
        /* keep last known roster */
      }
    };

    const pollSignals = async () => {
      try {
        const { signals } = await api.signals(code, hostToken, lastSigRef.current);
        if (!alive) return;
        for (const sig of signals) {
          lastSigRef.current = Math.max(lastSigRef.current, sig.id);
          const pc = pcsRef.current.get(sig.from);
          if (sig.kind === "answer" && pc) {
            try {
              await pc.setRemoteDescription(JSON.parse(sig.payload));
              const queued = pendingIceRef.current.get(sig.from) ?? [];
              pendingIceRef.current.delete(sig.from);
              for (const c of queued) await pc.addIceCandidate(c);
            } catch {
              /* stale answer */
            }
          } else if (sig.kind === "candidate") {
            const candidate = JSON.parse(sig.payload) as RTCIceCandidateInit | null;
            if (!candidate) continue;
            if (pc && pc.remoteDescription) {
              try {
                await pc.addIceCandidate(candidate);
              } catch {
                /* out-of-order candidate */
              }
            } else {
              const q = pendingIceRef.current.get(sig.from) ?? [];
              q.push(candidate);
              pendingIceRef.current.set(sig.from, q);
            }
          }
        }
      } catch {
        /* transient */
      }
    };

    const pollStats = async () => {
      const next: Record<string, PeerStats> = {};
      for (const [id, pc] of pcsRef.current) {
        if (pc.connectionState !== "connected") continue;
        const s = await sampleHostStats(pc);
        if (!s) continue;
        const prev = prevStatRef.current.get(id);
        const kbps = prev ? kbpsBetween(prev.bytes, prev.at, s.bytesSent, s.at) : 0;
        prevStatRef.current.set(id, { bytes: s.bytesSent, at: s.at });
        next[id] = {
          kbps,
          rttMs: Math.round(s.rttMs),
          lossPct: Math.round(s.fractionLost * 1000) / 10,
        };
      }
      if (alive) setStats(next);
    };

    const heartbeat = () => {
      void api
        .heartbeatHost(code, hostToken, modeRef.current, alignRef.current)
        .catch(() => {});
    };

    void pollPeers();
    heartbeat();
    const t1 = setInterval(pollPeers, 2000);
    const t2 = setInterval(pollSignals, 750);
    const t3 = setInterval(pollStats, 2000);
    const t4 = setInterval(heartbeat, 4000);

    return () => {
      alive = false;
      clearInterval(t1);
      clearInterval(t2);
      clearInterval(t3);
      clearInterval(t4);
    };
  }, [code, hostToken, createPc, dropPc]);

  // close all peer connections on unmount
  useEffect(() => {
    const pcs = pcsRef.current;
    const tap = meterTapRef.current;
    return () => {
      pcs.forEach((pc) => pc.close());
      tap.dispose();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // guard against closing the tab mid-broadcast
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (modeRef.current !== "idle") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);

  const kickPeer = useCallback(
    (peerId: string) => {
      dropPc(peerId);
      setPeers((prev) => prev.filter((p) => p.id !== peerId));
      void api.kick(code, hostToken, peerId).catch(() => {});
    },
    [code, hostToken, dropPc]
  );

  /* ————————— sources ————————— */

  const publishStream = useCallback(
    (stream: MediaStream | null) => {
      streamRef.current = stream;
      setHasStream(Boolean(stream?.getAudioTracks()[0]));
      if (stream) {
        meterTapRef.current.attach(stream);
        void meterTapRef.current.resume();
        for (const [id, pc] of pcsRef.current) attachTrack(id, pc);
      }
    },
    [attachTrack]
  );

  const startRelay = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
        },
      });
      const audio = display.getAudioTracks()[0];
      display.getVideoTracks().forEach((t) => t.stop());
      if (!audio) {
        setError(
          "No audio channel came through. When the picker opens, choose a browser tab and tick “Also share tab audio”."
        );
        return;
      }
      audio.onended = () => {
        // user hit the browser's "Stop sharing" bar
        publishStream(null);
        setMode("idle");
      };
      publishStream(new MediaStream([audio]));
      setMode("relay");
    } catch {
      setError("Screen share was cancelled — audio relay not started.");
    } finally {
      setBusy(false);
    }
  }, [publishStream]);

  const stopBroadcast = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    for (const sender of sendersRef.current.values()) {
      void sender.replaceTrack(null);
    }
    streamRef.current = null;
    setHasStream(false);
    setMode("idle");
  }, []);

  const live = mode !== "idle" && hasStream;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      {/* ——— left column ——— */}
      <div className="flex min-w-0 flex-col gap-5">
        {/* SOURCE */}
        <section className="panel ticks p-5 sm:p-6">
          <SectionLabel
            right={
              <Pill
                state={live ? "live" : "wait"}
                text={live ? "Broadcasting" : "Awaiting source"}
              />
            }
          >
            Audio Source
          </SectionLabel>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* RELAY */}
            <div
              className={`border p-4 transition-colors sm:p-5 ${
                mode === "relay" ? "ticks-volt ticks border-volt/70 bg-raise" : "border-line bg-coal"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <MonitorUp className="h-5 w-5 text-volt" />
                <span className="label">M-01</span>
              </div>
              <h3 className="display mb-2 text-xl">Tab Relay</h3>
              <p className="mb-5 text-[13px] leading-relaxed text-fog">
                Capture any tab or player — Netflix, VLC via a window, YouTube,
                Spotify. Listeners get it in ~0.15s, like their own Bluetooth.
              </p>
              {mode === "relay" ? (
                <button onClick={stopBroadcast} className="btn btn-danger w-full">
                  <Square className="h-3.5 w-3.5" /> Stop relay
                </button>
              ) : (
                <button
                  onClick={() => void startRelay()}
                  disabled={busy}
                  className="btn btn-volt w-full"
                >
                  {busy ? (
                    <Loader2 className="spin h-3.5 w-3.5" />
                  ) : (
                    <Antenna className="h-3.5 w-3.5" />
                  )}
                  Start relay
                </button>
              )}
            </div>

            {/* THEATRE */}
            <div
              className={`border p-4 transition-colors sm:p-5 ${
                mode === "theatre" ? "ticks-volt ticks border-volt/70 bg-raise" : "border-line bg-coal"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <Clapperboard className="h-5 w-5 text-[#a793ff]" />
                <span className="label">M-02</span>
              </div>
              <h3 className="display mb-2 text-xl">Theatre File</h3>
              <p className="mb-5 text-[13px] leading-relaxed text-fog">
                Drop the actual movie file in. The picture is buffered to the
                phase-lock target — frame-perfect lip sync for everyone.
              </p>
              <TheatrePicker
                active={mode === "theatre"}
                onActivate={() => setMode("theatre")}
                onStop={() => {
                  publishStream(null);
                  setMode("idle");
                }}
              />
            </div>
          </div>

          {error ? (
            <div className="mt-4 border border-ember/40 bg-ember/5 px-4 py-3 font-mono text-[11px] leading-relaxed tracking-[0.04em] text-ember">
              {error}
            </div>
          ) : null}

          {/* active theatre deck */}
          {mode === "theatre" ? (
            <TheatrePlayer
              key="theatre"
              alignDelayMs={alignMs}
              onStream={publishStream}
            />
          ) : null}
        </section>

        {/* BROADCAST METER */}
        <section className="panel p-5 sm:p-6">
          <SectionLabel
            right={
              <span className="label text-volt">
                {live ? "OPUS · 192 KBPS · STEREO · FEC" : "SILENCE"}
              </span>
            }
          >
            Broadcast Meter
          </SectionLabel>
          <div className="relative">
            <Visualizer
              getAnalyser={() => meterTapRef.current.analyser}
              className="h-44 w-full sm:h-52"
            />
            {!live ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-fog">
                  Start a source to light the meter
                </span>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* ——— right column ——— */}
      <div className="flex min-w-0 flex-col gap-5">
        {/* LISTENERS */}
        <section className="panel p-5 sm:p-6">
          <SectionLabel
            right={
              <span className="num flex items-center gap-2 text-[11px] text-mist">
                <Users className="h-3.5 w-3.5 text-volt" /> {peers.length}/8
              </span>
            }
          >
            Listeners
          </SectionLabel>

          {peers.length === 0 ? (
            <div className="border border-dashed border-line px-4 py-8 text-center">
              <p className="font-mono text-[11px] uppercase leading-loose tracking-[0.2em] text-fog">
                No listeners yet.
                <br />
                Share the room code above —
                <br />
                friends join from their phones.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line border border-line">
              {peers.map((p) => {
                const s = stats[p.id];
                return (
                  <li key={p.id} className="ledger px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`dot ${s ? "dot-live" : "dot-wait"}`}
                        />
                        <span className="truncate text-sm font-medium text-bone">
                          {p.label}
                        </span>
                      </span>
                      <span className="flex flex-none items-center gap-3">
                        <span className="num text-[11px] text-fog">
                          {s
                            ? `${s.kbps} kbps · ${s.rttMs} ms · ${s.lossPct}%`
                            : "handshaking…"}
                        </span>
                        <button
                          onClick={() => kickPeer(p.id)}
                          className="text-fog transition-colors hover:text-ember"
                          title={`Remove ${p.label}`}
                          aria-label={`Remove ${p.label}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-4 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-fog">
            Up to 8 simultaneous listeners per relay. Each device pairs its own
            earbuds — the laptop&apos;s Bluetooth is never touched.
          </p>
        </section>

        {/* PHASE LOCK */}
        <section className="panel p-5 sm:p-6">
          <SectionLabel
            right={<Waves className="h-3.5 w-3.5 text-[#a793ff]" />}
          >
            Phase Lock
          </SectionLabel>

          <div className="mb-5 grid grid-cols-2 gap-4">
            <Stat label="Lock target" value={`${alignMs}`} unit="ms" tone="pulse" />
            <Stat
              label="Slowest link"
              value={`${peers.length ? Math.max(...peers.map((p) => p.latencyMs || 0)) : 0}`}
              unit="ms"
            />
          </div>

          {peers.length === 0 ? (
            <p className="font-mono text-[10px] leading-relaxed tracking-[0.08em] text-fog">
              The lock target floats to the slowest listener + 25 ms of slack.
              Every device then trims its own delay to land on the same
              millisecond — sound hits all earbuds in unison.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {peers.map((p) => (
                <li key={p.id}>
                  <div className="mb-1 flex justify-between">
                    <span className="label" style={{ fontSize: 9 }}>
                      {p.label}
                    </span>
                    <span className="num text-[10px] text-fog">
                      {p.latencyMs} ms → +{Math.max(0, alignMs - p.latencyMs)} ms trim
                    </span>
                  </div>
                  <AlignRail latency={p.latencyMs} target={alignMs} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Inline picker button that starts theatre mode inside the source card. */
function TheatrePicker({
  active,
  onActivate,
  onStop,
}: {
  active: boolean;
  onActivate: () => void;
  onStop: () => void;
}) {
  if (active) {
    return (
      <button onClick={onStop} className="btn btn-danger w-full">
        <Square className="h-3.5 w-3.5" /> Eject & stop
      </button>
    );
  }
  return (
    <button onClick={onActivate} className="btn btn-pulse w-full">
      <Clapperboard className="h-3.5 w-3.5" /> Load film file
    </button>
  );
}
