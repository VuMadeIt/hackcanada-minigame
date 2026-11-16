import meta from "../../public/sprites/sprites.json";

export type SpriteName = keyof typeof meta;

export const spriteUrl = (name: string) => `/sprites/${name}.png`;

export function spriteSize(name: string): { w: number; h: number } {
  return (meta as Record<string, { w: number; h: number }>)[name] ?? { w: 32, h: 32 };
}
