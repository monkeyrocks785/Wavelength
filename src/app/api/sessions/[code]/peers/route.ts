import { db } from "@/db";
import { peers, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getSessionByCode,
  hostIsAlive,
  json,
  listOnlinePeers,
  pruneStalePeers,
} from "@/server/sessionStore";

/** Host-only: list online listeners (with their latency reports). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) return json({ error: "Session not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get("host") !== session.hostPeerId) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  await pruneStalePeers(session.id);
  const online = await listOnlinePeers(session.id);
  return json({
    peers: online.map((p) => ({
      id: p.id,
      label: p.label,
      latencyMs: p.latencyMs,
      joinedAt: p.joinedAt,
    })),
  });
}

/**
 * Heartbeat. Guests send { peerId, latencyMs }; the host sends
 * { hostToken, mode?, alignDelayMs? } which also carries session state.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) return json({ error: "Session not found" }, { status: 404 });

  let body: {
    peerId?: string;
    latencyMs?: number;
    hostToken?: string;
    mode?: string;
    alignDelayMs?: number;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad body" }, { status: 400 });
  }

  if (body.hostToken) {
    if (body.hostToken !== session.hostPeerId) {
      return json({ error: "Forbidden" }, { status: 403 });
    }
    const set: Partial<typeof sessions.$inferInsert> = { lastSeen: new Date() };
    if (body.mode && ["idle", "relay", "theatre"].includes(body.mode)) {
      set.mode = body.mode;
    }
    if (typeof body.alignDelayMs === "number" && isFinite(body.alignDelayMs)) {
      set.alignDelayMs = Math.max(0, Math.min(1200, Math.round(body.alignDelayMs)));
    }
    await db.update(sessions).set(set).where(eq(sessions.id, session.id));
    return json({ ok: true });
  }

  if (body.peerId) {
    const set: Partial<typeof peers.$inferInsert> = { lastSeen: new Date() };
    if (typeof body.latencyMs === "number" && isFinite(body.latencyMs)) {
      set.latencyMs = Math.max(0, Math.min(2000, Math.round(body.latencyMs)));
    }
    await db
      .update(peers)
      .set(set)
      .where(eq(peers.id, body.peerId));
    return json({ ok: true });
  }

  return json({ error: "Missing identity" }, { status: 400 });
}
