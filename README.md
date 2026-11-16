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
