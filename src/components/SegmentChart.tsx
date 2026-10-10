import type { Segment } from "@/lib/types";
import { formatLift } from "@/lib/format";

/** Barras horizontales de lift por segmento, con eje en cero y escala única. */
export default function SegmentChart({ segments }: { segments: Segment[] }) {
  const rows = segments.filter((s) => s && s.label && Number.isFinite(Number(s.value)));
  if (!rows.length) return null;
  const W = 440, labelW = 110, valW = 60, rowH = 30, top = 6;
  const plotH = rows.length * rowH;
  const H = top + plotH + 22;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(Number(r.value))), 1);
  const hasNeg = rows.some((r) => Number(r.value) < 0);
  const plotL = labelW, plotR = W - valW, plotW = plotR - plotL;
  const zero = hasNeg ? plotL + plotW / 2 : plotL;
  const scale = (hasNeg ? plotW / 2 : plotW) / maxAbs;
  const step = maxAbs <= 4 ? 1 : maxAbs <= 10 ? 2 : maxAbs <= 25 ? 5 : maxAbs <= 60 ? 10 : 25;

  const ticks: number[] = [];
  for (let t = 0; t <= maxAbs + 1e-9; t += step) {
    ticks.push(t);
    if (hasNeg && t > 0) ticks.push(-t);
  }

  return (
    <svg className="seg-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Lift por segmento">
      {ticks.map((t) => {
        const x = zero + t * scale;
        return (
          <g key={t}>
            <line className="grid" x1={x} x2={x} y1={top} y2={top + plotH} />
            <text className="tick" x={x} y={H - 5} textAnchor="middle">
              {t}%
            </text>
          </g>
        );
      })}
      <line className="axis" x1={zero} x2={zero} y1={top} y2={top + plotH} />
      {rows.map((r, i) => {
        const v = Number(r.value);
        const y = top + i * rowH + 6;
        const h = rowH - 12;
        const w = Math.abs(v) * scale;
        const x = v >= 0 ? zero : zero - w;
        const tx = v >= 0 ? zero + w + 6 : x - 6;
        return (
          <g key={r.label + i}>
            <text x={0} y={y + h / 2 + 4}>
              {r.label}
            </text>
            <rect className={v >= 0 ? "bar-pos" : "bar-neg"} x={x} y={y} width={Math.max(w, 1.5)} height={h} rx={2} />
            <text className="v" x={tx} y={y + h / 2 + 4} textAnchor={v >= 0 ? "start" : "end"}>
              {formatLift(v)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
