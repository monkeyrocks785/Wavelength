import {
  getSessionByCode,
  hostIsAlive,
  json,
  listOnlinePeers,
  pruneStalePeers,
} from "@/server/sessionStore";

/** Session info polled by everyone: mode, alignment target, host liveness. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) return json({ error: "Session not found" }, { status: 404 });

  await pruneStalePeers(session.id);
  const online = await listOnlinePeers(session.id);

  return json({
    code: session.code,
    name: session.name,
    mode: session.mode,
    alignDelayMs: session.alignDelayMs,
    hostAlive: hostIsAlive(session),
    listeners: online.length,
  });
}
