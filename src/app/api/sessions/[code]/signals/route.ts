import { db } from "@/db";
import { signals } from "@/db/schema";
import { and, asc, eq, gt } from "drizzle-orm";
import { getSessionByCode, json, pruneOldSignals } from "@/server/sessionStore";

/** Poll your signalling mailbox: offers, answers and ICE candidates. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) return json({ error: "Session not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const forPeer = searchParams.get("for");
  const after = Number(searchParams.get("after") ?? "0") || 0;
  if (!forPeer) return json({ error: "Missing recipient" }, { status: 400 });

  const rows = await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.sessionId, session.id),
        eq(signals.toPeer, forPeer),
        gt(signals.id, after)
      )
    )
    .orderBy(asc(signals.id))
    .limit(200);

  // Opportunistic cleanup of ancient envelopes.
  if (Math.random() < 0.25) void pruneOldSignals();

  return json({
    signals: rows.map((r) => ({
      id: r.id,
      from: r.fromPeer,
      kind: r.kind,
      payload: r.payload,
    })),
  });
}

/** Post a signalling envelope to one peer (star topology, host at centre). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) return json({ error: "Session not found" }, { status: 404 });

  let body: { from?: string; to?: string; kind?: string; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad body" }, { status: 400 });
  }

  if (!body.from || !body.to || !body.kind) {
    return json({ error: "Missing fields" }, { status: 400 });
  }
  if (!["offer", "answer", "candidate"].includes(body.kind)) {
    return json({ error: "Unknown kind" }, { status: 400 });
  }

  const payload = typeof body.payload === "string" ? body.payload : JSON.stringify(body.payload ?? null);
  if (payload.length > 32_000) return json({ error: "Payload too large" }, { status: 413 });

  await db.insert(signals).values({
    sessionId: session.id,
    fromPeer: body.from,
    toPeer: body.to,
    kind: body.kind,
    payload,
  });
  return json({ ok: true });
}
