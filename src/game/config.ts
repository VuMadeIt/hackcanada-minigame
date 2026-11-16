// Every balance number in the game lives here so it can be tuned in one place.

export type ToolId = "rusty" | "copper" | "steel" | "gold" | "iridium" | "diamond" | "chainsaw";

export interface Tool {
  id: ToolId;
  name: string;
  power: number;
  cost: number;
  blurb: string;
}

export const TOOLS: Tool[] = [
  { id: "rusty", name: "Rusty Axe", power: 1, cost: 0, blurb: "Found it behind the shed. It'll do." },
  { id: "copper", name: "Copper Axe", power: 4, cost: 60, blurb: "Shiny, a bit soft, way better than rust." },
  { id: "steel", name: "Steel Axe", power: 15, cost: 2_000, blurb: "A proper lumberjack's axe." },
  { id: "gold", name: "Gold Axe", power: 60, cost: 60_000, blurb: "Terrible metal for an axe. Looks amazing though." },
  { id: "iridium", name: "Iridium Axe", power: 260, cost: 2_500_000, blurb: "Mined from a meteorite. Hums a little." },
  { id: "diamond", name: "Diamond Axe", power: 1_200, cost: 400_000_000, blurb: "You know exactly where this idea came from." },
  { id: "chainsaw", name: "Chainsaw", power: 6_000, cost: 50_000_000_000, blurb: "Forget the axe. Also chops 3 times a second on its own." },
];

export const CHAINSAW_AUTO_CHOPS = 3;

export type UpgradeId =
  | "whetstone"
  | "splitter"
  | "robo_arm"
  | "gnome"
  | "bone_meal"
  | "watering_can"
  | "haggling"
  | "lucky_sapling";

export interface Upgrade {
  id: UpgradeId;
  name: string;
  icon: string;
  baseCost: number;
  growth: number;
  max: number;
  unlockLevel: number;
  blurb: string;
}

export const UPGRADES: Upgrade[] = [
  { id: "whetstone", name: "Whetstone", icon: "shop/saw_blade", baseCost: 40, growth: 1.9, max: 60, unlockLevel: 2, blurb: "+15% wood per chop" },
  { id: "watering_can", name: "Watering Can", icon: "shop/watering_can", baseCost: 250, growth: 1.8, max: 8, unlockLevel: 3, blurb: "Trees grow softer. -5% tree HP" },
  { id: "splitter", name: "Log Splitter", icon: "shop/log_splitter", baseCost: 400, growth: 1.7, max: 10, unlockLevel: 4, blurb: "+25% bonus when a tree falls" },
  { id: "robo_arm", name: "Robo Arm", icon: "shop/robot_arm", baseCost: 1_500, growth: 2.0, max: 30, unlockLevel: 6, blurb: "Chops once a second for you" },
  { id: "bone_meal", name: "Bone Meal", icon: "shop/fertilizer", baseCost: 2_000, growth: 2.1, max: 50, unlockLevel: 7, blurb: "+15% wood/s from everything you own" },
  { id: "haggling", name: "Haggling", icon: "shop/money_bag", baseCost: 3_000, growth: 2.2, max: 30, unlockLevel: 8, blurb: "+8% sell price" },
  { id: "lucky_sapling", name: "Lucky Sapling", icon: "shop/golden_tree", baseCost: 6_000, growth: 2.1, max: 15, unlockLevel: 9, blurb: "+1.5% crit chance, golden beaver shows up more" },
  { id: "gnome", name: "Gnome Accountant", icon: "shop/gnome", baseCost: 25_000, growth: 2.4, max: 10, unlockLevel: 11, blurb: "Sells 1% of your wood every second" },
];

export type BuildingId =
  | "beaver"
  | "lumberjack"
  | "sawmill"
  | "syrup"
  | "paper_mill"
  | "furniture"
  | "cargo_ship"
  | "tower";

export interface Building {
  id: BuildingId;
  name: string;
  icon: string;
  baseCost: number;
  rate: number;
  blurb: string;
}

export const BUILDING_GROWTH = 1.15;

export const BUILDINGS: Building[] = [
  { id: "beaver", name: "Beaver Buddy", icon: "shop/beaver_worker", baseCost: 15, rate: 0.1, blurb: "Your cousin. Works for twigs." },
  { id: "lumberjack", name: "Lumberjack", icon: "shop/lumberjack", baseCost: 100, rate: 1, blurb: "Plaid shirt, big beard, gets it done." },
  { id: "sawmill", name: "Sawmill", icon: "shop/sawmill", baseCost: 1100, rate: 8, blurb: "Logs in, planks out, all day." },
  { id: "syrup", name: "Syrup Shack", icon: "shop/syrup_factory", baseCost: 12000, rate: 47, blurb: "Tapping maples is basically chopping, right?" },
  { id: "paper_mill", name: "Paper Mill", icon: "shop/paper_mill", baseCost: 130000, rate: 260, blurb: "Turns the scraps into something." },
  { id: "furniture", name: "Furniture Shop", icon: "shop/furniture_shop", baseCost: 1_400_000, rate: 1400, blurb: "Flat-pack chairs, shipped nationwide." },
  { id: "cargo_ship", name: "Cargo Ship", icon: "shop/cargo_ship", baseCost: 20_000_000, rate: 7800, blurb: "Moves a forest a week across the lake." },
  { id: "tower", name: "Timber Tower", icon: "shop/skyscraper", baseCost: 330_000_000, rate: 44000, blurb: "A skyscraper made of wood. Somehow legal." },
];

export type ZoneId = "meadow" | "autumn" | "night";

export interface Zone {
  id: ZoneId;
  name: string;
  unlockLevel: number;
  mult: number;
  trees: string[];
}

export const ZONES: Zone[] = [
  { id: "meadow", name: "Sunny Meadow", unlockLevel: 1, mult: 1, trees: ["oak", "birch"] },
  { id: "autumn", name: "Maple Ridge", unlockLevel: 18, mult: 1.5, trees: ["maple"] },
  { id: "night", name: "Moonlit Grove", unlockLevel: 28, mult: 2.5, trees: ["ancient", "maple"] },
];

export const CHOP = {
  maxClicksPerSec: 20,
  comboWindowMs: 1000,
  comboStep: 0.01,
  comboMax: 100,
  baseCritChance: 0.03,
  critChancePerLevel: 0.015,
  critMult: 5,
  megaCritChance: 0.004,
  megaCritMult: 25,
  autoChopShare: 0.5,
  treeHpChops: 18,
  wateringHpCut: 0.05,
  fellBonusChops: 10,
  splitterBonus: 0.25,
  stumpMs: 450,
};

/** wood/s bonus per Bone Meal level, on everything you own */
export const BONE_MEAL_PER_LEVEL = 0.15;

export const LEVELS = {
  firstLevelXp: 400,
  growth: 2,
  bonusPerLevel: 0.03,
};

export const MARKET = {
  basePrice: 1,
  hagglePerLevel: 0.08,
  swing: 0.25,
  wobble: 0.1,
  maxFactor: 1.36,
};

export const GOLDEN = {
  minGapSec: 120,
  maxGapSec: 300,
  luckyGapCut: 0.04,
  visibleSec: 9,
  frenzyMult: 7,
  frenzySec: 20,
  stormSec: 12,
  pileMinChops: 100,
  pilePassiveSec: 300,
};

export const OFFLINE = {
  share: 0.5,
  maxSec: 8 * 3600,
  minSec: 60,
};

export const CASINO_UNLOCK_LEVEL = 11;
