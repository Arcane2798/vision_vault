import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '@/types';
import { CHART_COLORS, useTheme } from '@/context/ThemeContext';

const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

/**
 * Intrusion alerts per day (the system acts on its own, so there is no "confirmed" split).
 * One series: no legend, the card title names it.
 */
export function TrendChart({ data, height = 'h-56' }: { data: TrendPoint[]; height?: string }) {
  const c = CHART_COLORS[useTheme().theme];
  const rows = data.map((p) => ({ date: p.date, alerts: p.potential + p.confirmed }));
  return (
    <div className={`${height} w-full`}>
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 10, right: 6, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.area} stopOpacity={0.22} />
              <stop offset="100%" stopColor={c.area} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
          <YAxis allowDecimals={false} stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            cursor={{ stroke: c.cursor, strokeDasharray: '3 3' }}
            labelFormatter={(d) => shortDate(String(d))}
            formatter={(v) => [v, 'Alerts']}
            contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 12, fontSize: 12, color: c.text, boxShadow: '0 10px 30px -12px rgba(30,52,112,.35)' }}
            labelStyle={{ color: c.text, fontWeight: 600 }}
            itemStyle={{ color: c.text }}
          />
          <Area
            type="monotone"
            dataKey="alerts"
            name="Alerts"
            stroke={c.line}
            strokeWidth={2}
            fill="url(#trend-fill)"
            dot={false}
            activeDot={{ r: 5, fill: c.dot, stroke: c.tooltipBg, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
