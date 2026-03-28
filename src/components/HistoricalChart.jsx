import React, { useState, useEffect } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';

const TIME_WINDOW_KEY = 'beacon_time_window';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const time = label instanceof Date ? label : new Date(label);
    
    return (
      <div className="glass-panel" style={{ padding: '1rem', border: '1px solid var(--accent-cyan)' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
          {format(time, 'MMM dd, HH:mm')}
        </p>
        {payload
          .filter((entry, index, self) => 
            entry.dataKey !== 'time' && 
            entry.name !== 'time' &&
            index === self.findIndex((t) => t.dataKey === entry.dataKey)
          )
          .map((entry, index) => {
          let unit = 'kts';
          if (entry.dataKey === 'waterTemp' || entry.dataKey === 'temperature') unit = '°C';
          if (entry.dataKey === 'windDirection') unit = '°';
          return (
            <p key={index} style={{ color: entry.color, fontWeight: 'bold' }}>
              {entry.name}: {entry.value} {unit}
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

const DirectionDot = (props) => {
  const { cx, cy, payload } = props;
  if (!cx || !cy || payload.windDirection === null || payload.windDirection === undefined) return null;
  const deg = payload.windDirection;
  return (
    <g transform={`translate(${cx},${cy})`}>
      <g transform={`rotate(${deg})`}>
        <polygon
          points="0,-6 3,4 -3,4"
          fill="var(--accent-blue)"
          opacity="0.8"
        />
      </g>
    </g>
  );
};

const cardinalTicks = [0, 90, 180, 270, 360];
const cardinalLabels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W', 360: 'N' };

export default function HistoricalChart({ data }) {
  const [timeWindow, setTimeWindow] = useState(() => {
    try {
      const saved = localStorage.getItem(TIME_WINDOW_KEY);
      return saved ? JSON.parse(saved) : 6;
    } catch { return 6; }
  });

  useEffect(() => {
    localStorage.setItem(TIME_WINDOW_KEY, JSON.stringify(timeWindow));
  }, [timeWindow]);

  if (!data || data.length === 0) return null;

  const latestDate = new Date(data[data.length - 1].time);
  const cutoffDate = new Date(latestDate.getTime() - timeWindow * 60 * 60 * 1000);
  
  const filteredData = data.filter(d => new Date(d.time) >= cutoffDate);
  const hasDirection = filteredData.some(d => d.windDirection !== null && d.windDirection !== undefined);

  const formatXAxis = (tickItem) => {
    const date = new Date(tickItem);
    return format(date, 'HH:mm');
  };

  const timeOptions = [
    { label: '6h', hours: 6 },
    { label: '12h', hours: 12 },
    { label: '24h', hours: 24 },
    { label: '48h', hours: 48 }
  ];

  return (
    <div className="glass-panel historical-chart-container">
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h3 className="widget-title" style={{ margin: 0 }}>📈 Historique Vent & Météo</h3>
        
        <div className="zoom-toggle-container" style={{ margin: 0 }}>
          {timeOptions.map(option => (
            <button
              key={option.hours}
              className={`zoom-toggle-btn source-toggle-btn ${timeWindow === option.hours ? 'active' : ''}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
              onClick={() => setTimeWindow(option.hours)}
            >
              Last {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Wind Speed & Temperature Chart */}
      <ResponsiveContainer width="100%" height={hasDirection ? 320 : 420} minWidth={0}>
        <ComposedChart data={filteredData} margin={{ top: 10, right: 5, left: 5, bottom: 0 }}>
          <defs>
            <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.45}/>
              <stop offset="95%" stopColor="#00e5ff" stopOpacity={0.02}/>
            </linearGradient>
            <linearGradient id="colorMax" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ff6d00" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#ff6d00" stopOpacity={0.02}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis 
            dataKey="time" 
            tickFormatter={formatXAxis} 
            stroke="var(--text-secondary)" 
            fontSize={12}
            tickMargin={10}
            minTickGap={30}
          />
          <YAxis 
            yAxisId="left"
            stroke="#b39ddb" 
            fontSize={12} 
            width={30}
            tickFormatter={(val) => `${Math.round(val)}°`}
            domain={['auto', 'auto']}
            opacity={0.5}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            stroke="var(--text-secondary)" 
            fontSize={12} 
            width={30}
            tickFormatter={(val) => Math.round(val)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area 
            yAxisId="right"
            type="monotone" 
            dataKey="maxGust" 
            name="Rafale max" 
            stroke="#ff6d00" 
            fillOpacity={1} 
            fill="url(#colorMax)" 
            strokeWidth={2.5}
          />
          <Area 
            yAxisId="right"
            type="monotone" 
            dataKey="avgSpeed" 
            name="Vent moyen" 
            stroke="#00e5ff" 
            fillOpacity={1} 
            fill="url(#colorAvg)" 
            strokeWidth={2.5}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="temperature"
            name="Temp. air"
            stroke="#b39ddb"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            connectNulls={true}
            strokeOpacity={0.6}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="waterTemp"
            name="Temp. eau"
            stroke="#80cbc4"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            connectNulls={true}
            strokeOpacity={0.6}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Wind Direction Chart */}
      {hasDirection && (
        <>
          <h3 className="widget-title" style={{ margin: '0.8rem 0 0.3rem', fontSize: '0.8rem' }}>🧭 Direction du vent</h3>
          <ResponsiveContainer width="100%" height={200} minWidth={0}>
            <ComposedChart data={filteredData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey="time" 
                tickFormatter={formatXAxis} 
                stroke="var(--text-secondary)" 
                fontSize={12}
                tickMargin={10}
                minTickGap={30}
              />
              <YAxis 
                yAxisId="dir"
                domain={[0, 360]}
                ticks={cardinalTicks}
                tickFormatter={(val) => cardinalLabels[val] || `${val}°`}
                stroke="var(--text-secondary)" 
                fontSize={12}
                width={30}
              />
              <YAxis yAxisId="dirR" orientation="right" width={30} tick={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                yAxisId="dir"
                type="stepAfter"
                dataKey="windDirection"
                name="Direction"
                stroke="var(--accent-blue)"
                strokeWidth={1.5}
                strokeOpacity={0.4}
                dot={false}
                connectNulls={true}
              />
              <Scatter
                yAxisId="dir"
                dataKey="windDirection"
                name="Direction"
                fill="var(--accent-cyan)"
                shape={(props) => {
                  const { cx, cy, payload } = props;
                  if (payload.windDirection === null || payload.windDirection === undefined) return null;
                  const rad = (payload.windDirection * Math.PI) / 180;
                  const size = 7;
                  const tipX = cx + Math.sin(rad) * size;
                  const tipY = cy - Math.cos(rad) * size;
                  const leftX = cx + Math.sin(rad - 2.5) * size * 0.6;
                  const leftY = cy - Math.cos(rad - 2.5) * size * 0.6;
                  const rightX = cx + Math.sin(rad + 2.5) * size * 0.6;
                  const rightY = cy - Math.cos(rad + 2.5) * size * 0.6;
                  return (
                    <polygon
                      points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
                      fill="var(--accent-cyan)"
                      opacity={0.7}
                    />
                  );
                }}
                strokeOpacity={0.6}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
