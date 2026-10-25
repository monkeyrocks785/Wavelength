"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Film, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { DelayedMonitor } from "@/lib/audioEngine";
import Visualizer from "@/components/Visualizer";

interface VideoWithCapture extends HTMLVideoElement {
  captureStream?: () => MediaStream;
}

interface FrameStamp {
  t: number;
  bmp: ImageBitmap;
}

const MAX_FRAMES = 12;

/**
 * Theatre deck — plays the film file on the host screen while its audio is
 * captured for relay. The picture is redrawn through a frame ring-buffer
 * delayed by the session's phase-lock target, and the host hears the film
 * through the same delay. Host + picture + every guest: one millisecond.
 */
export default function TheatrePlayer({
  alignDelayMs,
  onStream,
}: {
  alignDelayMs: number;
  onStream: (stream: MediaStream | null) => void;
}) {
  const videoRef = useRef<VideoWithCapture>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const framesRef = useRef<FrameStamp[]>([]);
  const monitorRef = useRef(new DelayedMonitor());
  const alignRef = useRef(alignDelayMs);
  const lastDrawnRef = useRef<ImageBitmap | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const [delayed, setDelayed] = useState(true);
  const [audioOnly, setAudioOnly] = useState(false);

  alignRef.current = alignDelayMs;

  useEffect(() => {
    monitorRef.current.setDelayMs(alignDelayMs);
  }, [alignDelayMs]);

  const clearFrames = useCallback(() => {
    for (const f of framesRef.current) f.bmp.close();
    framesRef.current = [];
    lastDrawnRef.current = null;
  }, []);

  /* frame capture loop — stamps each decoded frame with its wall-clock time */
  const startCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !("requestVideoFrameCallback" in video)) {
      setDelayed(false);
      return;
    }
    const cb = () => {
      const v = videoRef.current;
      if (!v) return;
      if (!v.paused && !v.ended && v.readyState >= 2) {
        void createImageBitmap(v).then((bmp) => {
          framesRef.current.push({ t: performance.now(), bmp });
          while (framesRef.current.length > MAX_FRAMES) {
            framesRef.current.shift()?.bmp.close();
          }
        });
      }
      v.requestVideoFrameCallback(cb);
    };
    video.requestVideoFrameCallback(cb);
  }, []);

  /* delayed redraw loop */
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const frames = framesRef.current;
      if (canvas && ctx && frames.length > 0) {
        const want = performance.now() - alignRef.current;
        let pick: FrameStamp = frames[0];
        for (let i = frames.length - 1; i >= 0; i--) {
          if (frames[i].t <= want) {
            pick = frames[i];
            break;
          }
        }
        if (pick.bmp !== lastDrawnRef.current) {
          ctx.drawImage(pick.bmp, 0, 0, canvas.width, canvas.height);
          lastDrawnRef.current = pick.bmp;
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const loadFile = useCallback(
    (file: File) => {
      const video = videoRef.current;
      if (!video) return;
      setWarn(null);
      clearFrames();
      const url = URL.createObjectURL(file);
      setFileName(file.name);
      video.src = url;
      video.muted = true;
      video.onloadedmetadata = () => {
        const isAudioOnly = video.videoHeight === 0;
        setAudioOnly(isAudioOnly);
        if (!isAudioOnly) {
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
          }
        }
        setDur(video.duration || 0);
        if (video.captureStream) {
          const cap = video.captureStream();
          if (cap.getAudioTracks().length === 0) {
            setWarn(
              "This file has no decodable audio track — guests will hear silence. Try another encode (AAC/Opus)."
            );
            onStream(null);
          } else {
            monitorRef.current.attach(cap);
            monitorRef.current.setVolume(volume);
            onStream(cap);
          }
        } else {
          setWarn(
            "This browser can't relay file audio (no captureStream). Use TAB RELAY with any player instead — the picture stays local."
          );
          onStream(null);
        }
        void video.play().then(() => {
          setPlaying(true);
          if (!isAudioOnly) startCapture();
        });
        monitorRef.current.resume();
      };
      video.ontimeupdate = () => setTime(video.currentTime);
      video.onseeking = () => clearFrames();
      video.onended = () => setPlaying(false);
    },
    [clearFrames, onStream, startCapture, volume]
  );

  // teardown — release the captured stream from the relay star
  useEffect(() => {
    const monitor = monitorRef.current;
    return () => {
      onStream(null);
      monitor.dispose();
      clearFrames();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setPlaying(true);
      monitorRef.current.resume();
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const seek = (v: number) => {
    const video = videoRef.current;
    if (!video) return;
    clearFrames();
    video.currentTime = v;
    setTime(v);
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!fileName) {
    return (
      <div className="mt-4 border border-dashed border-line bg-coal p-5">
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,audio/*,.mp4,.webm,.m4v"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadFile(f);
          }}
        />
        <button onClick={() => inputRef.current?.click()} className="btn btn-volt w-full">
          <Film className="h-4 w-4" /> Choose film file
        </button>
        <p className="mt-3 text-center font-mono text-[10px] leading-relaxed tracking-[0.12em] text-fog">
          MP4 / WEBM — or a bare audio file for music nights. The file never
          leaves this laptop.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 border border-line bg-ink">
      {/* source video (hidden while the delayed canvas renders it) */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={delayed ? "hidden" : "block w-full bg-black"}
      />

      {/* delayed picture / audio deck */}
      <div className="relative">
        {audioOnly ? (
          <div className="flex flex-col items-center justify-center gap-2 bg-ink py-6">
            <Visualizer
              getAnalyser={() => monitorRef.current.analyser}
              accent="pulse"
              className="h-48 w-full max-w-sm"
            />
            <span className="label">Audio deck — no picture, just the lock</span>
          </div>
        ) : delayed ? (
          <canvas ref={canvasRef} className="block w-full bg-black" />
        ) : null}
        <div className="absolute left-3 top-3 flex items-center gap-2 border border-line bg-ink/80 px-2.5 py-1 backdrop-blur">
          <span className="dot dot-live" />
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-mist">
            {audioOnly ? "Audio locked" : `Picture locked −${alignDelayMs}ms`}
          </span>
        </div>
      </div>

      {warn ? (
        <div className="border-t border-ember/40 bg-ember/5 px-4 py-2.5 font-mono text-[10px] leading-relaxed tracking-[0.06em] text-ember">
          {warn}
        </div>
      ) : null}

      {/* transport */}
      <div className="border-t border-line px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-4">
          <span className="num min-w-0 truncate text-[11px] tracking-[0.1em] text-mist">
            {fileName}
          </span>
          <span className="num flex-none text-[11px] text-fog">
            {fmt(time)} / {fmt(dur)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(1, dur)}
          step={0.1}
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
          className="fader"
          style={{ ["--fill" as string]: `${(time / Math.max(1, dur)) * 100}%` }}
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="btn flex-none !px-4 !py-2.5"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={() => {
              const m = !muted;
              setMuted(m);
              monitorRef.current.setVolume(m ? 0 : volume);
            }}
            className="btn flex-none !px-3 !py-2.5"
            aria-label="Mute monitor"
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
              monitorRef.current.setVolume(v);
            }}
            className="fader max-w-40"
            style={{ ["--fill" as string]: `${volume * 100}%` }}
            aria-label="Monitor volume"
          />
          <div className="ml-auto hidden w-24 sm:block">
            <Visualizer
              getAnalyser={() => monitorRef.current.analyser}
              accent="pulse"
              className="h-10 w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Browsers without requestVideoFrameCallback render the raw element (no picture delay). */
