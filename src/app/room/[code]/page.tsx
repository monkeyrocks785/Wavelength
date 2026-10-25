"use client";

import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  AudioWaveform,
  Check,
  DoorOpen,
  Headphones,
  Link2,
  Loader2,
  RadioTower,
  Users,
} from "lucide-react";
import { api, type SessionInfo } from "@/lib/api";
import HostConsole from "@/components/room/HostConsole";
import GuestPlayer from "@/components/room/GuestPlayer";
import { CopyChip, Pill } from "@/components/room/ui";

type Role = "loading" | "missing" | "identify" | "host" | "guest";

/** Copies the full join URL — friends tap and land straight in the room. */
function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        const url = `${window.location.origin}/room/${code}`;
        navigator.clipboard?.writeText(url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="hidden items-center gap-1.5 border border-line bg-coal px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fog transition-colors hover:border-volt hover:text-volt sm:flex"
      title="Copy invite link"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
      Invite
    </button>
  );
}

export default function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="spin h-6 w-6 text-volt" />
        </div>
      }
    >
      <Room code={code.toUpperCase()} />
    </Suspense>
  );
}

function Room({ code }: { code: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [role, setRole] = useState<Role>("loading");
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const pollRef = useRef<number>(0);

  // bootstrap session + identity
  useEffect(() => {
    let alive = true;
    const boot = async () => {
      try {
        const s = await api.getSession(code);
        if (!alive) return;
        setInfo(s);
        const fromUrl = search.get("host");
        const stored =
          typeof window !== "undefined"
            ? sessionStorage.getItem(`wl:${code}:host`)
            : null;
        const token = fromUrl ?? stored;
        if (token) {
          sessionStorage.setItem(`wl:${code}:host`, token);
          setHostToken(token);
          setRole("host");
        } else {
          const remembered = localStorage.getItem("wl:callsign") ?? "";
          setName(remembered);
          setRole("identify");
        }
      } catch {
        if (alive) setRole("missing");
      }
    };
    void boot();
    // clean the ?host= param from the address bar (keep it in storage only)
    if (search.get("host") && typeof window !== "undefined") {
      window.history.replaceState(null, "", `/room/${code}`);
    }
    return () => {
      alive = false;
    };
  }, [code, search]);

  // light session polling for the header telemetry
  useEffect(() => {
    if (role === "loading" || role === "missing") return;
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.getSession(code);
        if (alive) setInfo(s);
      } catch {
        /* keep stale */
      }
    };
    void tick();
    pollRef.current = window.setInterval(tick, 3000);
    return () => {
      alive = false;
      window.clearInterval(pollRef.current);
    };
  }, [code, role]);

  const join = useCallback(async () => {
    setJoining(true);
    setJoinErr(null);
    try {
      const res = await api.join(code, name || "Listener");
      localStorage.setItem("wl:callsign", name || "Listener");
      setPeerId(res.peerId);
      setRole("guest");
    } catch (e) {
      setJoinErr(e instanceof Error ? e.message : "Could not join");
    } finally {
      setJoining(false);
    }
  }, [code, name]);

  const leave = useCallback(() => {
    if (role === "guest" && peerId) void api.leave(code, peerId).catch(() => {});
    router.push("/");
  }, [code, peerId, role, router]);

  const modePill = useMemo(() => {
    if (!info) return null;
    if (role === "host" || role === "guest") {
      if (info.mode === "idle") return <Pill state="wait" text="Standing by" />;
      if (!info.hostAlive) return <Pill state="wait" text="Host away" />;
      return <Pill state="live" text={info.mode === "theatre" ? "Theatre" : "Relay live"} />;
    }
    return <Pill state={info.hostAlive ? "live" : "wait"} text={info.hostAlive ? "Open" : "Warming up"} />;
  }, [info, role]);

  return (
    <div className="gridbg min-h-screen">
      {/* ——— header console ——— */}
      <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-5 sm:px-6">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-fog transition-colors hover:text-volt"
            aria-label="Back to Wavelength"
          >
            <ArrowLeft className="h-4 w-4" />
            <AudioWaveform className="h-4 w-4 text-volt" />
          </button>
          <div className="hairline h-5 w-px" />
          <div className="min-w-0">
            <div className="label !text-[9px]">Room</div>
            <div className="truncate text-sm font-medium leading-tight text-bone">
              {info?.name ?? code}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="num hidden items-center gap-1.5 border border-line bg-coal px-2.5 py-1.5 text-[10px] text-mist sm:flex">
              <Users className="h-3.5 w-3.5 text-volt" />
              {info?.listeners ?? 0}
            </span>
            {modePill}
            <InviteLink code={code} />
            <CopyChip text={code} />
            {role === "host" || role === "guest" ? (
              <button
                onClick={leave}
                className="flex items-center gap-1.5 border border-line bg-coal px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fog transition-colors hover:border-ember hover:text-ember"
              >
                <DoorOpen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Leave</span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* ——— body ——— */}
      <main className="mx-auto max-w-6xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10">
        {role === "loading" ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="spin h-6 w-6 text-volt" />
          </div>
        ) : role === "missing" ? (
          <div className="panel ticks mx-auto mt-16 max-w-md p-8 text-center">
            <RadioTower className="mx-auto mb-4 h-8 w-8 text-ember" />
            <h1 className="display mb-3 text-3xl">Signal lost</h1>
            <p className="mb-6 font-mono text-[11px] uppercase leading-loose tracking-[0.2em] text-fog">
              Room {code} doesn&apos;t exist
              <br />
              or has gone quiet.
            </p>
            <button onClick={() => router.push("/")} className="btn btn-volt w-full">
              Back to base
            </button>
          </div>
        ) : role === "identify" ? (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
            className="panel ticks mx-auto mt-10 max-w-md p-6 sm:p-8"
          >
            <div className="mb-1 flex items-center gap-2">
              <Headphones className="h-4 w-4 text-volt" />
              <span className="label">Joining session</span>
            </div>
            <h1 className="display mb-5 text-3xl sm:text-4xl">
              {info?.name ?? "Wavelength"}
            </h1>
            <p className="mb-6 text-[13px] leading-relaxed text-fog">
              Pair your earbuds to this device, grab your call sign, and tap in.
              The host&apos;s laptop will relay its audio straight to you —
              phase-locked with everyone else in the room.
            </p>
            <label className="label mb-2 block">Your call sign</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 24))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void join();
              }}
              placeholder="e.g. MOOSE"
              className="input mb-4"
              maxLength={24}
              autoFocus
            />
            {joinErr ? (
              <p className="mb-4 border border-ember/40 bg-ember/5 px-3 py-2 font-mono text-[10px] tracking-[0.08em] text-ember">
                {joinErr}
              </p>
            ) : null}
            <button
              onClick={() => void join()}
              disabled={joining}
              className="btn btn-volt w-full"
            >
              {joining ? (
                <Loader2 className="spin h-4 w-4" />
              ) : (
                <Headphones className="h-4 w-4" />
              )}
              Tune in
            </button>
            <p className="mt-4 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-fog">
              Best with Chrome / Edge / Safari — sound on
            </p>
          </motion.div>
        ) : role === "host" && hostToken ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <HostConsole code={code} hostToken={hostToken} />
          </motion.div>
        ) : role === "guest" && peerId ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <GuestPlayer code={code} peerId={peerId} label={name || "Listener"} />
          </motion.div>
        ) : null}
      </main>
    </div>
  );
}
