import { db } from "@/db";
import { peers } from "@/db/schema";
import { getSessionByCode, json, pruneStalePeers } from "@/server/sessionStore";

/** Join a session as a listener. Returns the peer id used for signalling. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) return json({ error: "Session not found" }, { status: 404 });

  let label = "Listener";
  try {
    const body = (await request.json()) as { label?: string };
    if (typeof body.label === "string" && body.label.trim()) {
      label = body.label.trim().slice(0, 40);
    }
  } catch {
    /* default label */
  }

  await pruneStalePeers(session.id);
  const [peer] = await db
    .insert(peers)
    .values({ sessionId: session.id, label })
    .returning({ id: peers.id });

  return json({ peerId: peer.id, name: session.name, mode: session.mode });
}
