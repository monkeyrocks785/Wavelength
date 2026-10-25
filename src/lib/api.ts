/** Typed client helpers for the Wavelength API surface. */

export interface SessionInfo {
  code: string;
  name: string;
  mode: "idle" | "relay" | "theatre";
  alignDelayMs: number;
  hostAlive: boolean;
  listeners: number;
}

export interface PeerInfo {
  id: string;
  label: string;
  latencyMs: number;
  joinedAt: string;
}

export interface SignalMsg {
  id: number;
  from: string;
  kind: "offer" | "answer" | "candidate";
  payload: string;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export const api = {
  createSession: (name: string) =>
    req<{ code: string; hostToken: string; name: string }>(`/api/sessions`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  getSession: (code: string) => req<SessionInfo>(`/api/sessions/${code}`),

  join: (code: string, label: string) =>
    req<{ peerId: string; name: string; mode: string }>(`/api/sessions/${code}/join`, {
      method: "POST",
      body: JSON.stringify({ label }),
    }),

  peers: (code: string, hostToken: string) =>
    req<{ peers: PeerInfo[] }>(`/api/sessions/${code}/peers?host=${hostToken}`),

  heartbeatHost: (
    code: string,
    hostToken: string,
    mode: string,
    alignDelayMs: number
  ) =>
    req<{ ok: true }>(`/api/sessions/${code}/peers`, {
      method: "POST",
      body: JSON.stringify({ hostToken, mode, alignDelayMs }),
    }),

  heartbeatPeer: (code: string, peerId: string, latencyMs: number) =>
    req<{ ok: true }>(`/api/sessions/${code}/peers`, {
      method: "POST",
      body: JSON.stringify({ peerId, latencyMs }),
    }),

  signals: (code: string, forPeer: string, after: number) =>
    req<{ signals: SignalMsg[] }>(
      `/api/sessions/${code}/signals?for=${forPeer}&after=${after}`
    ),

  sendSignal: (
    code: string,
    msg: { from: string; to: string; kind: string; payload: unknown }
  ) =>
    req<{ ok: true }>(`/api/sessions/${code}/signals`, {
      method: "POST",
      body: JSON.stringify(msg),
    }),

  leave: (code: string, peerId: string) =>
    req<{ ok: true }>(`/api/sessions/${code}/leave`, {
      method: "POST",
      body: JSON.stringify({ peerId }),
    }),

  /** Host-side removal of a listener. */
  kick: (code: string, hostToken: string, peerId: string) =>
    req<{ ok: true }>(`/api/sessions/${code}/leave`, {
      method: "POST",
      body: JSON.stringify({ peerId, hostToken }),
    }),

  /** Best-effort leave when the tab is closing. */
  beaconLeave: (code: string, peerId: string) => {
    try {
      navigator.sendBeacon(
        `/api/sessions/${code}/leave`,
        JSON.stringify({ peerId })
      );
    } catch {
      /* noop */
    }
  },
};
