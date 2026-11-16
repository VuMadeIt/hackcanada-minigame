# Timber Tycoon

A little lumber tycoon game for the Hack Canada hacker dashboard. You're a beaver
with an axe. Chop the tree, sell the wood, buy better axes and a sawmill or
eight, and try your luck at the slot machine. Built so you can play a few
seconds at a time while your prompt is running.

## Running it locally

You need Node 20+ and a Postgres database.

```bash
cp .env.example .env.local   # then fill in DATABASE_URL
npm install
npm run db:push              # creates the tables
npm run dev
```

Open http://localhost:3000.

## Art

Sprites live in `public/sprites`. They were painted as large concept images and
then squashed onto a real pixel grid with `scripts/pixelate.py` (magenta
background keyed out, palette reduced, sheets cut into single icons).

## Settings

| Variable | What it's for |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. For Neon, use the pooled one. |
| `SESSION_SECRET` | Signs the game's own session tokens. Any long random string. |
| `DASHBOARD_SECRET` | Shared with the dashboard, which uses it to sign the player token. |
| `ALLOW_DEV_LOGIN` | `true` lets you play as anyone with `?dev=Name`. Always on in `npm run dev`; keep it off in production. |

Without `DATABASE_URL` the game still runs; it just saves to the browser.

## Hooking up the dashboard

Players are whoever is logged into the Hack Canada dashboard; the game has no login of its own. The
dashboard's server signs a short-lived token for the current user with `DASHBOARD_SECRET`:

```
token = base64url(JSON.stringify({ sub: userId, name: displayName, exp: unixSeconds }))
      + "." + base64url(HMAC_SHA256(DASHBOARD_SECRET, <that first part>))
```

`src/server/identity.ts` has `signToken()` if the dashboard is also in TypeScript, and
`scripts/mint-token.ts` makes one by hand for testing. Hand it to the game in either of two ways:

- iframe URL: `https://<game>/?t=<token>`
- or `postMessage`: once the game loads it posts `{ type: "timber:ready" }` to the parent; reply with
  `iframe.contentWindow.postMessage({ type: "timber:identity", token }, "<game origin>")`.

The game swaps it for its own 14-day session and sends that as a Bearer header, so it works in a
cross-site iframe without third-party cookies.

## How saves are checked

The browser runs the game and saves every 20 seconds. The server doesn't trust those saves blindly
(`src/server/validate.ts`):

- wood can only leave your pile by selling it, and coins only come from selling (at the best
  possible price) or from the casino
- everything you own has to add up to coins you actually earned
- lifetime wood can't grow faster than perfect play would allow since the last save (a 20 clicks/s
  autoclicker that crits on every click, plus every golden beaver)

A save that fails is thrown away and the browser gets the last good save back.
