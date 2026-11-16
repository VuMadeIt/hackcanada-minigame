import { json, readJson, requirePlayer } from "@/server/http";
import { spin } from "@/server/spin";

export async function POST(req: Request) {
  const who = requirePlayer(req);
  if (who instanceof Response) return who;
  const r = await spin(who, await readJson(req));
  if (r.ok) return json(r);
  const status = r.error === "stale" || r.error === "rejected" ? 409 : r.error === "poor" || r.error === "locked" ? 402 : 400;
  return json(r, status);
}
