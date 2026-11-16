import { createHmac, timingSafeEqual } from "node:crypto";

// Who is playing. The Hack Canada dashboard already knows; it hands us a signed token
// (see README "Hooking up the dashboard"). We swap that for our own session token,
// which the game sends back as a Bearer header. Headers instead of cookies so it keeps
// working inside a cross-site iframe where third-party cookies are blocked.

export interface Identity {
  id: string;
  name: string;
}

interface TokenBody {
  sub: string;
  name: string;
  exp: number;
}

const SESSION_DAYS = 14;

const b64 = (s: Buffer | string) => Buffer.from(s).toString("base64url");

function hmac(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest();
}

export function signToken(body: TokenBody, secret: string): string {
  const data = b64(JSON.stringify(body));
  return `${data}.${b64(hmac(data, secret))}`;
}

export function verifyToken(token: string | null | undefined, secret: string | undefined, now = Date.now()): TokenBody | null {
  if (!token || !secret) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const want = hmac(data, secret);
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, "base64url").toString()) as TokenBody;
    if (typeof body.sub !== "string" || !body.sub || typeof body.exp !== "number" || body.exp * 1000 < now) return null;
    return { sub: body.sub.slice(0, 128), name: cleanName(body.name), exp: body.exp };
  } catch {
    return null;
  }
}

export function cleanName(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const cleaned = s.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 32);
  return cleaned || "Anonymous beaver";
}

export function devLoginAllowed() {
  return process.env.ALLOW_DEV_LOGIN === "true" || process.env.NODE_ENV !== "production";
}

/** The casino test buttons (jump to the casino, free coins). Never on in the real launch. */
export function testToolsAllowed() {
  return process.env.ALLOW_TEST_TOOLS === "true" || process.env.NODE_ENV !== "production";
}

function sessionSecret(): string | undefined {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  return process.env.NODE_ENV !== "production" ? "local-dev-only-session-secret" : undefined;
}

export function fromDashboardToken(token: string): Identity | null {
  const body = verifyToken(token, process.env.DASHBOARD_SECRET);
  return body ? { id: body.sub, name: body.name } : null;
}

export function fromDevName(name: string): Identity {
  const clean = cleanName(name);
  const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "beaver";
  return { id: `dev:${slug}`, name: clean };
}

export function issueSession(who: Identity): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return signToken({ sub: who.id, name: who.name, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 }, secret);
}

export function identityFromRequest(req: Request): Identity | null {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const body = verifyToken(token, sessionSecret());
  return body ? { id: body.sub, name: body.name } : null;
}
