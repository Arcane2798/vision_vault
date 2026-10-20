import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '@/types';

const COLORS = { potential: '#f59e0b', confirmed: '#ef4444', grid: '#2a3644', axis: '#7d8896' };

const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

/** Stacked daily bars: AI-flagged (potential) vs confirmed by a reviewer. */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="25%">
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} stroke={COLORS.axis} fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} stroke={COLORS.axis} fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            labelFormatter={(d) => shortDate(String(d))}
            contentStyle={{ background: '#111821', border: '1px solid #2a3644', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#e8edf2' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: COLORS.axis }} iconType="circle" iconSize={8} />
          <Bar dataKey="potential" name="Potential (AI-flagged)" stackId="a" fill={COLORS.potential} stroke="#111821" strokeWidth={1} />
          <Bar dataKey="confirmed" name="Confirmed intrusion" stackId="a" fill={COLORS.confirmed} radius={[4, 4, 0, 0]} stroke="#111821" strokeWidth={1} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
