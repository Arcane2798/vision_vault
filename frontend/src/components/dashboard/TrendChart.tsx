import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '@/types';
import { CHART_COLORS, useTheme } from '@/context/ThemeContext';

const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

/**
 * Intrusion alerts per day (the system acts on its own, so there is no "confirmed" split).
 * One series: no legend, the card title names it. Today's bar carries the accent.
 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const c = CHART_COLORS[useTheme().theme];
  const rows = data.map((p) => ({ date: p.date, alerts: p.potential + p.confirmed }));
  const last = rows.length - 1;
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -20, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis allowDecimals={false} stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            cursor={{ fill: c.cursor }}
            labelFormatter={(d) => shortDate(String(d))}
            formatter={(v) => [v, 'Alerts']}
            contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 12, fontSize: 12, color: c.text, boxShadow: '0 8px 24px -8px rgba(0,0,0,.35)' }}
            labelStyle={{ color: c.text, fontWeight: 600 }}
            itemStyle={{ color: c.text }}
          />
          <Bar dataKey="alerts" name="Alerts" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {rows.map((r, i) => (
              <Cell key={r.date} fill={i === last ? c.brand : c.muted} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
