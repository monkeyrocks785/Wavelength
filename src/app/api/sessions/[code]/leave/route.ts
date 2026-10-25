import { db } from "@/db";
import { peers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionByCode, json } from "@/server/sessionStore";

/**
 * Leave a session. Accepts fetch JSON or a sendBeacon text payload.
 * A matching hostToken turns this into a host-side removal (kick).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) return json({ ok: true });

  let peerId: string | undefined;
  let hostToken: string | undefined;
  try {
    const text = await request.text();
    const body = JSON.parse(text) as { peerId?: string; hostToken?: string };
    peerId = body.peerId;
    hostToken = body.hostToken;
  } catch {
    /* malformed leave — nothing to do */
  }

  if (hostToken && hostToken !== session.hostPeerId) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  if (peerId) {
    await db.delete(peers).where(eq(peers.id, peerId));
  }
  return json({ ok: true });
}
