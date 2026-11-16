import { boolean, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const players = pgTable(
  "players",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    state: jsonb("state").notNull(),
    rev: integer("rev").notNull().default(0),
    lifetimeWood: doublePrecision("lifetime_wood").notNull().default(0),
    level: integer("level").notNull().default(1),
    // coins/wood/upgrades the casino handed out; the client can't fake these
    casinoCoins: doublePrecision("casino_coins").notNull().default(0),
    casinoWood: doublePrecision("casino_wood").notNull().default(0),
    casinoUpgradeValue: doublePrecision("casino_upgrade_value").notNull().default(0),
    freeSpins: integer("free_spins").notNull().default(0),
    flags: integer("flags").notNull().default(0),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("players_lifetime_wood_idx").on(t.lifetimeWood)],
);

export const spins = pgTable(
  "spins",
  {
    id: serial("id").primaryKey(),
    playerId: text("player_id").notNull(),
    bet: doublePrecision("bet").notNull(),
    reels: text("reels").notNull(),
    outcome: text("outcome").notNull(),
    payout: doublePrecision("payout").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("spins_player_idx").on(t.playerId)],
);

export const prizes = pgTable("prizes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  stock: integer("stock").notNull(),
  awarded: integer("awarded").notNull().default(0),
  weight: integer("weight").notNull().default(1),
});

export const prizeClaims = pgTable(
  "prize_claims",
  {
    id: serial("id").primaryKey(),
    playerId: text("player_id").notNull(),
    playerName: text("player_name").notNull(),
    prizeId: text("prize_id").notNull(),
    prizeName: text("prize_name").notNull(),
    code: text("code").notNull().unique(),
    redeemed: boolean("redeemed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prize_claims_player_idx").on(t.playerId)],
);

export type PlayerRow = typeof players.$inferSelect;
