// Placeholder prize shelf. Edit before launch; `npm run prizes` (or the first jackpot) loads it into the
// prizes table, and after that the table is the source of truth so stock counts survive restarts.
export const PRIZE_SHELF: { id: string; name: string; stock: number; weight: number }[] = [
  { id: "stickers", name: "Hack Canada sticker pack", stock: 60, weight: 10 },
  { id: "snack", name: "Snack run on us", stock: 40, weight: 8 },
  { id: "tshirt", name: "Hack Canada t-shirt", stock: 15, weight: 4 },
  { id: "hoodie", name: "Hack Canada hoodie", stock: 6, weight: 2 },
  { id: "giftcard", name: "$25 gift card", stock: 4, weight: 1 },
  { id: "keyboard", name: "Mechanical keyboard", stock: 1, weight: 1 },
];
