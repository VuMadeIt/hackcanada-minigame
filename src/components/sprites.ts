import meta from "../../public/sprites/sprites.json";

export type SpriteName = keyof typeof meta;

// GitHub Pages serves the site from /<repo>, so every public file needs that prefix
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const spriteUrl = (name: string) => `${BASE_PATH}/sprites/${name}.png`;

export function spriteSize(name: string): { w: number; h: number } {
  return (meta as Record<string, { w: number; h: number }>)[name] ?? { w: 32, h: 32 };
}
