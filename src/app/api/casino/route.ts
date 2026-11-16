import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { json, requirePlayer } from "@/server/http";
import { players, prizeClaims } from "@/server/schema";

// free spins and the prizes you've won, for the casino panel
export async function GET(req: Request) {
  const who = requirePlayer(req);
  if (who instanceof Response) return who;
  const [row] = await db().select({ freeSpins: players.freeSpins }).from(players).where(eq(players.id, who.id));
  const won = await db()
    .select({ name: prizeClaims.prizeName, code: prizeClaims.code, redeemed: prizeClaims.redeemed, at: prizeClaims.createdAt })
    .from(prizeClaims)
    .where(eq(prizeClaims.playerId, who.id))
    .orderBy(desc(prizeClaims.createdAt));
  return json({ freeSpins: row?.freeSpins ?? 0, prizes: won });
}
