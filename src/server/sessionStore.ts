import { db } from "@/db";
import { peers, sessions, signals, type Session } from "@/db/schema";
import { and, eq, gt, lt } from "drizzle-orm";

export const PEER_ONLINE_WINDOW_MS = 20_000;
export const HOST_ONLINE_WINDOW_MS = 12_000;
const PEER_PRUNE_MS = 45_000;
const SIGNAL_PRUNE_MS = 120_000;

export async function getSessionByCode(code: string): Promise<Session | null> {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.code, code.toUpperCase()))
    .limit(1);
  return rows[0] ?? null;
}

export function hostIsAlive(session: Session): boolean {
  return Date.now() - new Date(session.lastSeen).getTime() < HOST_ONLINE_WINDOW_MS;
}

/** Remove peers that have been silent for a while (called on read paths). */
export async function pruneStalePeers(sessionId: string): Promise<void> {
  const cutoff = new Date(Date.now() - PEER_PRUNE_MS);
  await db
    .delete(peers)
    .where(and(eq(peers.sessionId, sessionId), lt(peers.lastSeen, cutoff)));
}

export async function listOnlinePeers(sessionId: string) {
  const cutoff = new Date(Date.now() - PEER_ONLINE_WINDOW_MS);
  return db
    .select()
    .from(peers)
    .where(and(eq(peers.sessionId, sessionId), gt(peers.lastSeen, cutoff)));
}

export async function pruneOldSignals(): Promise<void> {
  const cutoff = new Date(Date.now() - SIGNAL_PRUNE_MS);
  await db.delete(signals).where(lt(signals.createdAt, cutoff));
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}
