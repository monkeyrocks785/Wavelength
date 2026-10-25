import { db } from "@/db";
import { sessions } from "@/db/schema";
import { json } from "@/server/sessionStore";
import { makeCode, uid } from "@/lib/codes";

/** Create a new listening session. Returns the room code and the host token. */
export async function POST(request: Request) {
  let name = "Untitled session";
  try {
    const body = (await request.json()) as { name?: string };
    if (typeof body.name === "string" && body.name.trim()) {
      name = body.name.trim().slice(0, 80);
    }
  } catch {
    /* empty body is fine */
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode(6);
    const hostPeerId = uid();
    try {
      await db.insert(sessions).values({ code, name, hostPeerId });
      return json({ code, hostToken: hostPeerId, name });
    } catch {
      /* code collision — retry */
    }
  }
  return json({ error: "Could not allocate a room code" }, { status: 500 });
}
