import React from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';

const SurfTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const time = label instanceof Date ? label : new Date(label);
    return (
      <div className="glass-panel" style={{ padding: '0.8rem', border: '1px solid var(--accent-cyan)', fontSize: '0.85rem' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
          {format(time, 'MMM dd, HH:mm')}
        </p>
        {payload
          .filter((e, i, self) => i === self.findIndex(t => t.dataKey === e.dataKey))
          .map((entry, i) => {
            let unit = '';
            if (entry.dataKey === 'height' || entry.dataKey === 'hmax') unit = 'm';
            if (entry.dataKey === 'period') unit = 's';
            return (
              <p key={i} style={{ color: entry.color, fontWeight: 'bold', margin: '0.1rem 0' }}>
                {entry.name}: {entry.value} {unit}
              </p>
            );
          })}
      </div>
    );
  }
  return null;
};

export default function SurfHistoryChart({ data }) {
  if (!data || data.length === 0) return null;

  // Filter to last 12 hours
  const latestTime = data[data.length - 1].time;
  const cutoff = latestTime - 12 * 60 * 60 * 1000;
  const filtered = data.filter(d => d.time >= cutoff);

  if (filtered.length < 2) return null;

  const formatX = (tick) => format(new Date(tick), 'HH:mm');

  return (
    <div style={{ marginTop: '1.25rem' }}>
      <h4 className="widget-title" style={{ fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
        📈 Historique Houle (12h)
      </h4>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={filtered} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
          <defs>
            <linearGradient id="colorHeight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#00e5ff" stopOpacity={0.02}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={formatX}
            stroke="var(--text-secondary)"
            fontSize={11}
            tickMargin={8}
            minTickGap={40}
          />
          <YAxis
            yAxisId="left"
            stroke="#00e5ff"
            fontSize={11}
            tickFormatter={(v) => `${v}m`}
            domain={[0, 'auto']}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#b39ddb"
            fontSize={11}
            tickFormatter={(v) => `${v}s`}
            domain={[0, 'auto']}
            opacity={0.6}
          />
          <Tooltip content={<SurfTooltip />} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="height"
            name="Hs (sig.)"
            stroke="#00e5ff"
            fill="url(#colorHeight)"
            fillOpacity={1}
            strokeWidth={2.5}
            connectNulls={true}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="hmax"
            name="Hmax"
            stroke="#ff6d00"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            connectNulls={true}
            strokeOpacity={0.7}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="period"
            name="Période"
            stroke="#b39ddb"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            connectNulls={true}
            strokeOpacity={0.6}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
