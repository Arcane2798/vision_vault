import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '@/types';

const COLORS = { bar: '#ef4444', grid: '#2a3644', axis: '#7d8896' };

const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

/** Intrusion alerts per day (the system acts on its own, so there is no "confirmed" split). */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const rows = data.map((p) => ({ date: p.date, alerts: p.potential + p.confirmed }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="25%">
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} stroke={COLORS.axis} fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} stroke={COLORS.axis} fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            labelFormatter={(d) => shortDate(String(d))}
            contentStyle={{ background: '#111821', border: '1px solid #2a3644', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#e8edf2' }}
          />
          <Bar dataKey="alerts" name="Intrusion alerts" fill={COLORS.bar} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
