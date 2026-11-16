const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

/** 1234 -> "1.23K", 0.4 -> "0.4", 12 -> "12" */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  const sign = n < 0 ? "-" : "";
  n = Math.abs(n);
  if (n < 10) return sign + (Math.round(n * 10) / 10).toString();
  if (n < 1000) return sign + Math.floor(n).toString();
  const tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(n) / 3));
  const scaled = n / 10 ** (tier * 3);
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  const shown = Math.floor(scaled * 10 ** digits) / 10 ** digits;
  return sign + shown.toFixed(digits) + SUFFIXES[tier];
}

export function fmtInt(n: number): string {
  return n < 1000 ? Math.floor(n).toString() : fmt(n);
}

export function fmtTime(sec: number): string {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}
