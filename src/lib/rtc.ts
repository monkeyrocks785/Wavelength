/**
 * WebRTC helpers: config, Opus SDP upgrades and stats sampling.
 * Plain TypeScript — used by both the host console and the guest player.
 */

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
};

export const OPUS_KBPS = 192;

/**
 * Rewrite an SDP offer to force a studio-grade Opus pipe:
 * full-band stereo at a high average bitrate with in-band FEC.
 */
export function mungeOpus(sdp: string, kbps = OPUS_KBPS): string {
  const rtpMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/);
  if (!rtpMatch) return sdp;
  const pt = rtpMatch[1];

  const stereoParams = `maxaveragebitrate=${kbps * 1000};stereo=1;sprop-stereo=1;useinbandfec=1;usedtx=0`;
  const fmtpRe = new RegExp(`a=fmtp:${pt} ([^\\r\\n]+)`);

  if (fmtpRe.test(sdp)) {
    return sdp.replace(fmtpRe, (m, params: string) => {
      const filtered = params
        .split(";")
        .filter(
          (p) =>
            !/^\s*(maxaveragebitrate|stereo|sprop-stereo|useinbandfec|usedtx)=/.test(p)
        )
        .join(";");
      return `a=fmtp:${pt} ${filtered ? filtered + ";" : ""}${stereoParams}`;
    });
  }
  // No fmtp line yet — insert one right after the opus rtpmap.
  return sdp.replace(
    `a=rtpmap:${pt} opus/48000/2`,
    `a=rtpmap:${pt} opus/48000/2\r\na=fmtp:${pt} minptime=10;${stereoParams}`
  );
}

/** Raw sample from a host-side peer connection (one outbound audio stream). */
export interface HostSample {
  at: number;
  bytesSent: number;
  rttMs: number;
  fractionLost: number;
  jitterMs: number;
}

export async function sampleHostStats(pc: RTCPeerConnection): Promise<HostSample | null> {
  const stats = await pc.getStats();
  let bytesSent = 0;
  let at = 0;
  let rttMs = 0;
  let fractionLost = 0;
  let jitterMs = 0;
  let found = false;

  stats.forEach((r) => {
    const rep = r as unknown as Record<string, number | string | undefined>;
    if (r.type === "outbound-rtp" && (rep.kind === "audio" || rep.mediaType === "audio")) {
      bytesSent = (rep.bytesSent as number) ?? 0;
      at = (rep.timestamp as number) ?? Date.now();
      found = true;
    }
    if (
      r.type === "candidate-pair" &&
      (rep.nominated as unknown as boolean) &&
      rep.currentRoundTripTime !== undefined
    ) {
      rttMs = ((rep.currentRoundTripTime as number) ?? 0) * 1000;
    }
    if (r.type === "remote-inbound-rtp" && (rep.kind === "audio" || rep.mediaType === "audio")) {
      fractionLost = (rep.fractionLost as number) ?? 0;
      jitterMs = ((rep.jitter as number) ?? 0) * 1000;
    }
  });

  return found ? { at, bytesSent, rttMs, fractionLost, jitterMs } : null;
}

/** Raw sample from a guest-side peer connection (one inbound audio stream). */
export interface GuestSample {
  at: number;
  bytesReceived: number;
  rttMs: number;
  lossPct: number;
  jitterMs: number;
  jitterBufferMs: number;
  /** Estimated one-way audio latency: rendering buffer + half the round trip. */
  latencyMs: number;
}

export async function sampleGuestStats(pc: RTCPeerConnection): Promise<GuestSample | null> {
  const stats = await pc.getStats();
  let bytesReceived = 0;
  let at = 0;
  let rttMs = 0;
  let lossPct = 0;
  let jitterMs = 0;
  let jitterBufferMs = 0;
  let found = false;

  stats.forEach((r) => {
    const rep = r as unknown as Record<string, number | string | undefined>;
    if (r.type === "inbound-rtp" && (rep.kind === "audio" || rep.mediaType === "audio")) {
      bytesReceived = (rep.bytesReceived as number) ?? 0;
      at = (rep.timestamp as number) ?? Date.now();
      const lost = (rep.packetsLost as number) ?? 0;
      const received = (rep.packetsReceived as number) ?? 0;
      lossPct = lost + received > 0 ? (lost / (lost + received)) * 100 : 0;
      jitterMs = ((rep.jitter as number) ?? 0) * 1000;
      const jbDelay = (rep.jitterBufferDelay as number) ?? 0;
      const jbCount = (rep.jitterBufferEmittedCount as number) ?? 0;
      jitterBufferMs = jbCount > 0 ? (jbDelay / jbCount) * 1000 : 0;
      found = true;
    }
    if (
      r.type === "candidate-pair" &&
      (rep.nominated as unknown as boolean) &&
      rep.currentRoundTripTime !== undefined
    ) {
      rttMs = ((rep.currentRoundTripTime as number) ?? 0) * 1000;
    }
  });

  if (!found) return null;
  return {
    at,
    bytesReceived,
    rttMs,
    lossPct,
    jitterMs,
    jitterBufferMs,
    latencyMs: Math.round(jitterBufferMs + rttMs / 2),
  };
}

export function kbpsBetween(
  prevBytes: number,
  prevAt: number,
  bytes: number,
  at: number
): number {
  const dt = (at - prevAt) / 1000;
  if (dt <= 0) return 0;
  return Math.max(0, Math.round(((bytes - prevBytes) * 8) / dt / 1000));
}
