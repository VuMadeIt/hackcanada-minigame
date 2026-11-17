// Makes a dashboard token by hand, for testing the embed:
//   DASHBOARD_SECRET=... npx tsx scripts/mint-token.ts user_123 "Ada Lovelace"
import { signToken } from "../src/server/identity";

const [sub, name = "Test hacker"] = process.argv.slice(2);
const secret = process.env.DASHBOARD_SECRET;
if (!sub || !secret) {
  console.error('usage: DASHBOARD_SECRET=... npx tsx scripts/mint-token.ts <user id> "<name>"');
  process.exit(1);
}
console.log(signToken({ sub, name, exp: Math.floor(Date.now() / 1000) + 3600 }, secret));
