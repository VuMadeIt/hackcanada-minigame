import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, hasDb } from "@/server/db";
import { prizeClaims, prizes } from "@/server/schema";
import { seedPrizes } from "@/server/spin";

export const dynamic = "force-dynamic";

// Prize desk: who won what, and a button to mark it handed out. Open /admin?key=<ADMIN_KEY>.
export default async function Admin({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY || !hasDb()) {
    return <main className="admin">Nothing here.</main>;
  }
  await seedPrizes();
  const claims = await db().select().from(prizeClaims).orderBy(desc(prizeClaims.createdAt)).limit(500);
  const shelf = await db().select().from(prizes);

  async function redeem(form: FormData) {
    "use server";
    if (form.get("key") !== process.env.ADMIN_KEY) return;
    await db().update(prizeClaims).set({ redeemed: true }).where(eq(prizeClaims.code, String(form.get("code"))));
    revalidatePath("/admin");
  }

  return (
    <main className="admin">
      <h1>Prize desk</h1>
      <h2>Shelf</h2>
      <table>
        <tbody>
          {shelf.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>
                {p.awarded} / {p.stock} given out
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Winners</h2>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Hacker</th>
            <th>Prize</th>
            <th>Code</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {claims.map((c) => (
            <tr key={c.id}>
              <td>{c.createdAt.toLocaleString("en-CA")}</td>
              <td>{c.playerName}</td>
              <td>{c.prizeName}</td>
              <td>
                <code>{c.code}</code>
              </td>
              <td>
                {c.redeemed ? (
                  "handed out"
                ) : (
                  <form action={redeem}>
                    <input type="hidden" name="key" value={key} />
                    <input type="hidden" name="code" value={c.code} />
                    <button>Mark handed out</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
