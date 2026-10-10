export function formatLift(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  const s = abs < 10 ? n.toFixed(2) : n.toFixed(1);
  return (n > 0 ? "+" : "") + s.replace(/\.?0+$/, "") + "%";
}

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
}
