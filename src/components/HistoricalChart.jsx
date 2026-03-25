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
        {payload.map((entry, index) => {
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
      return saved ? JSON.parse(saved) : 12;
    } catch { return 12; }
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
    { label: '12h', hours: 12 },
    { label: '24h', hours: 24 },
    { label: '48h', hours: 48 }
  ];

  return (
    <div className="glass-panel historical-chart-container" style={{ height: hasDirection ? '620px' : '480px' }}>
      
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
      <ResponsiveContainer width="100%" height={hasDirection ? '55%' : '100%'}>
        <ComposedChart data={filteredData} margin={{ top: 10, right: -10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent-teal)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--accent-teal)" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorMax" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent-orange)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--accent-orange)" stopOpacity={0}/>
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
            stroke="var(--text-secondary)" 
            fontSize={12} 
            tickFormatter={(val) => Math.round(val)}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            stroke="#ff9800" 
            fontSize={12} 
            tickFormatter={(val) => `${val}°`}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area 
            yAxisId="left"
            type="monotone" 
            dataKey="maxGust" 
            name="Rafale max" 
            stroke="var(--accent-orange)" 
            fillOpacity={1} 
            fill="url(#colorMax)" 
            strokeWidth={2}
          />
          <Area 
            yAxisId="left"
            type="monotone" 
            dataKey="avgSpeed" 
            name="Vent moyen" 
            stroke="var(--accent-teal)" 
            fillOpacity={1} 
            fill="url(#colorAvg)" 
            strokeWidth={2}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="temperature"
            name="Temp. air"
            stroke="#ff9800"
            strokeWidth={3}
            dot={false}
            connectNulls={true}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="waterTemp"
            name="Temp. eau"
            stroke="#00b4d8"
            strokeWidth={3}
            dot={false}
            connectNulls={true}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Wind Direction Chart */}
      {hasDirection && (
        <>
          <h3 className="widget-title" style={{ margin: '0.8rem 0 0.3rem', fontSize: '0.8rem' }}>🧭 Direction du vent</h3>
          <ResponsiveContainer width="100%" height="35%">
            <ComposedChart data={filteredData} margin={{ top: 5, right: -10, left: -20, bottom: 0 }}>
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
                domain={[0, 360]}
                ticks={cardinalTicks}
                tickFormatter={(val) => cardinalLabels[val] || `${val}°`}
                stroke="var(--text-secondary)" 
                fontSize={12}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
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
                dataKey="windDirection"
                name="Direction"
                shape={<DirectionDot />}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
