import { cn } from "@/lib/utils";

/**
 * Small server-renderable charts following the data-viz method: thin marks, recessive
 * grid, text in ink colours (never series colours), legend for >=2 series, native
 * <title> tooltips, and a companion table via <details> for accessibility.
 */

const INK = "#0b0b0b";
const INK_2 = "#52514e";
const MUTED = "#898781";
const GRID = "#e1e0d9";

export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-neutral-200 bg-white px-5 py-4", className)}>
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: string | number }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} aria-hidden />
          <span>{item.label}</span>
          {item.value !== undefined ? <span className="font-medium text-neutral-900">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export interface VolumePoint {
  day: string;
  received: number;
  sent: number;
}

export function VolumeChart({ data }: { data: VolumePoint[] }) {
  if (!data.length) return <p className="text-sm text-neutral-500">No data yet.</p>;
  const width = 760;
  const height = 220;
  const padL = 36;
  const padR = 8;
  const padT = 12;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.received + d.sent));
  const niceMax = niceCeil(max);
  const slot = innerW / data.length;
  const barW = Math.max(2, Math.min(24, slot * 0.62));
  const y = (v: number) => padT + innerH - (v / niceMax) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));
  const labelEvery = data.length > 45 ? 10 : data.length > 20 ? 5 : data.length > 10 ? 2 : 1;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Legend
          items={[
            { label: "Received", color: "var(--color-viz-1)" },
            { label: "Sent", color: "var(--color-viz-2)" },
          ]}
        />
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Emails received and sent per day">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3} fontSize={10} textAnchor="end" fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const hReceived = (d.received / niceMax) * innerH;
          const hSent = (d.sent / niceMax) * innerH;
          const gap = d.received > 0 && d.sent > 0 ? 2 : 0;
          const label = formatDayLabel(d.day);
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${d.received} received, ${d.sent} sent`}</title>
              <rect x={x} y={padT} width={barW} height={innerH} fill="transparent" />
              {d.received > 0 ? <rect x={x} y={y(d.received)} width={barW} height={hReceived} rx={2} fill="var(--color-viz-1)" /> : null}
              {d.sent > 0 ? (
                <rect x={x} y={y(d.received + d.sent)} width={barW} height={Math.max(0, hSent - gap)} rx={2} fill="var(--color-viz-2)" />
              ) : null}
              {i % labelEvery === 0 ? (
                <text x={x + barW / 2} y={height - 8} fontSize={10} textAnchor="middle" fill={MUTED}>
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
        <line x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} stroke="#c3c2b7" strokeWidth={1} />
      </svg>
      <details className="mt-2 text-xs text-neutral-500">
        <summary className="cursor-pointer select-none">Table view</summary>
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-neutral-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-1.5 font-medium">Day</th>
                <th className="px-3 py-1.5 text-right font-medium">Received</th>
                <th className="px-3 py-1.5 text-right font-medium">Sent</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.day} className="border-t border-neutral-100 text-neutral-800">
                  <td className="px-3 py-1">{d.day}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{d.received}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{d.sent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Magnitude comparison across categories: one sequential hue, direct value labels. */
export function HorizontalBars({ data, color = "var(--color-viz-1)", emptyLabel = "No data yet." }: { data: { key: string; count: number }[]; color?: string; emptyLabel?: string }) {
  if (!data.length) return <p className="text-sm text-neutral-500">{emptyLabel}</p>;
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.key} className="grid grid-cols-[110px_1fr_40px] items-center gap-3 text-xs" title={`${d.key}: ${d.count}`}>
          <span className="truncate capitalize text-neutral-700">{d.key}</span>
          <span className="h-2.5 overflow-hidden rounded-[4px] bg-neutral-100">
            <span className="block h-full rounded-[4px]" style={{ width: `${(d.count / max) * 100}%`, background: color }} />
          </span>
          <span className="text-right tabular-nums text-neutral-900">{d.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** Part-to-whole with a fixed, meaningful order (ordinal or diverging). */
export function SegmentBar({
  segments,
  emptyLabel = "No data yet.",
}: {
  segments: { key: string; label: string; count: number; color: string }[];
  emptyLabel?: string;
}) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  if (!total) return <p className="text-sm text-neutral-500">{emptyLabel}</p>;
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={segments.map((s) => `${s.label} ${s.count}`).join(", ")}>
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <span key={s.key} className="h-full" style={{ width: `${(s.count / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.count} (${Math.round((s.count / total) * 100)}%)`} />
          ))}
      </div>
      <div className="mt-2">
        <Legend items={segments.map((s) => ({ label: s.label, color: s.color, value: s.count }))} />
      </div>
    </div>
  );
}

function niceCeil(n: number): number {
  if (n <= 5) return 5;
  const mag = 10 ** Math.floor(Math.log10(n));
  const norm = n / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function formatDayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

export { INK, INK_2 };
