import React, { useState, useEffect } from 'react';
import { Waves, Timer, Compass, Thermometer } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getSurfReport } from '../utils/surfReport';
import { degToCardinal } from '../utils/beaufort';
import SurfHistoryChart from './SurfHistoryChart';

// Hook to recenter the map smoothly
function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 9, { duration: 1.5 });
  }, [center, map]);
  return null;
}

// Component to render Animated Swell Flow
function SwellAnimation({ direction, coords, delay = 0, scale = 1 }) {
  if (direction === null || direction === undefined) return null;
  
  const icon = L.divIcon({
    className: 'custom-swell-icon',
    html: `
      <div class="swell-anim-container" style="transform: rotate(${direction}deg) scale(${scale});">
        <div class="swell-particle" style="animation-delay: ${delay}s;"></div>
        <div class="swell-particle" style="animation-delay: ${delay + 0.8}s;"></div>
        <div class="swell-particle" style="animation-delay: ${delay + 1.6}s;"></div>
      </div>
    `,
    iconSize: [60, 60],
    iconAnchor: [30, 30]
  });

  return <Marker position={coords} icon={icon} interactive={false} zIndexOffset={-10} />;
}

// Map spot ID → nearest wind source ID
const SPOT_WIND_MAP = {
  revellata: 'la_parata',       // La Parata is closest MF station
  ajaccio: 'lfkj',             // Campo dell'Oro for Golfe d'Ajaccio
  bonifacio: 'lfkj',           // Fallback to Campo dell'Oro
};

export default function SurfWidget({ surfData, windData }) {
  const [activeSpot, setActiveSpot] = useState('revellata');

  if (!surfData || (!surfData.revellata && !surfData.ajaccio && !surfData.bonifacio)) return null;

  const spots = [
    { 
      id: 'revellata', name: 'La Revellata', coords: [42.569, 8.650], code: '02B04', data: surfData.revellata,
      wavePoints: [
        { c: [42.569, 8.650], d: 0,   s: 1.1 },
        { c: [42.569, 8.500], d: 0.4, s: 0.9 }, // W
        { c: [42.620, 8.550], d: 0.8, s: 0.8 }, // NW
        { c: [42.510, 8.520], d: 1.2, s: 1.0 }, // SW
        { c: [42.650, 8.600], d: 0.3, s: 0.85 }, // N
        { c: [42.550, 8.400], d: 0.7, s: 0.7 }, // Far W
        { c: [42.450, 8.450], d: 1.5, s: 0.9 }, // Far SW
        { c: [42.520, 8.610], d: 1.1, s: 0.75 } // Close SW
      ]
    },
    { 
      id: 'ajaccio', name: "Golfe d'Ajaccio", coords: [41.750, 7.580], code: 'Ajaccio', data: surfData.ajaccio,
      wavePoints: [
        { c: [41.750, 7.580], d: 0,   s: 1.1 },
        { c: [41.650, 7.580], d: 0.3, s: 0.85 }, // S
        { c: [41.680, 7.480], d: 0.7, s: 0.95 }, // SW
        { c: [41.750, 7.420], d: 1.1, s: 0.8 }, // W
        { c: [41.820, 7.450], d: 0.5, s: 0.75 }, // NW
        { c: [41.600, 7.350], d: 1.4, s: 0.85 }, // Far SW
        { c: [41.550, 7.450], d: 0.9, s: 0.9 }, // Far S
        { c: [41.700, 7.300], d: 0.2, s: 0.8 } // Far W
      ]
    },
    { 
      id: 'bonifacio', name: 'Bonifacio', coords: [41.323, 8.878], code: '02A01', data: surfData.bonifacio,
      wavePoints: [
        { c: [41.323, 8.878], d: 0,   s: 1.1 },
        { c: [41.340, 8.750], d: 0.4, s: 0.8 }, // NW
        { c: [41.320, 8.650], d: 0.9, s: 0.9 }, // W
        { c: [41.280, 8.700], d: 1.3, s: 0.75 }, // SW
        { c: [41.270, 8.850], d: 0.5, s: 1.0 }, // S center of strait
        { c: [41.310, 9.000], d: 1.1, s: 0.85 }, // E
        { c: [41.330, 9.100], d: 0.2, s: 0.7 }, // NE
        { c: [41.300, 8.500], d: 0.8, s: 0.95 } // Far W
      ]
    }
  ];

  const current = spots.find(s => s.id === activeSpot);
  const data = current?.data;

  // Get nearest wind data for this spot
  const nearestWindId = SPOT_WIND_MAP[activeSpot] || 'lfkj';
  const nearestWind = windData?.[nearestWindId]?.live || null;
  
  // Generate surf report
  const report = data ? getSurfReport(data, nearestWind, current.name) : null;

  return (
    <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem', animation: 'fadeUp 1.1s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h3 className="widget-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <Waves size={20} style={{ color: 'var(--accent-cyan)' }}/> 
          🏄 Conditions Surf — {current?.name}
        </h3>
        <div className="source-toggle-container" style={{ margin: 0, padding: '0.2rem', gap: '0.4rem' }}>
          {spots.map(s => (
            <button
              key={s.id}
              className={`source-toggle-btn ${activeSpot === s.id ? 'active' : ''}`}
              onClick={() => setActiveSpot(s.id)}
              disabled={!s.data}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
            >
              {s.name} {!s.data && '(NR)'}
            </button>
          ))}
        </div>
      </div>

      {/* --- Surf Report Summary --- */}
      {report && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border-glass)',
          borderRadius: 'var(--card-radius)',
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'flex-start',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.25rem',
            minWidth: '60px',
          }}>
            <span style={{ fontSize: '1.8rem' }}>{report.emoji}</span>
            <span style={{
              fontSize: '0.7rem',
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              color: report.verdictColor,
              background: `${report.verdictColor}18`,
              padding: '0.2rem 0.5rem',
              borderRadius: '1rem',
              whiteSpace: 'nowrap',
            }}>
              {report.verdict}
            </span>
          </div>
          <div style={{ flex: 1, lineHeight: 1.6 }}>
            <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 500 }}>
              {report.headline}
            </p>
            <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {report.detail}
            </p>
            {report.setInfo && (
              <p style={{ margin: '0.4rem 0 0', color: 'var(--accent-cyan)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>🌊</span>
                <span>{report.setInfo.description}</span>
              </p>
            )}
          </div>
        </div>
      )}
      
      <div className="surf-widget-grid">
        {/* Left Side: Satellite Map */}
        <div className="surf-map-container" style={{ position: 'relative', background: 'rgba(0,0,0,0.2)', borderRadius: '1rem', padding: '0.5rem', border: '1px solid var(--border-glass)', overflow: 'hidden' }}>
          <MapContainer 
            center={[42.16, 8.11]} 
            zoom={8} 
            scrollWheelZoom={true}
            zoomControl={false}
            attributionControl={false}
            style={{ height: '220px', width: '100%', borderRadius: '0.5rem', zIndex: 0 }}
          >
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={18}
            />
            {spots.map(s => (
              <React.Fragment key={s.id}>
                {activeSpot === s.id && s.data?.direction && s.wavePoints && s.wavePoints.map((wp, i) => (
                  <SwellAnimation key={i} direction={s.data.direction} coords={wp.c} delay={wp.d} scale={wp.s} />
                ))}
                <CircleMarker 
                  center={s.coords} 
                  pathOptions={{ 
                    color: activeSpot === s.id ? 'var(--accent-cyan)' : 'var(--text-secondary)', 
                    fillColor: activeSpot === s.id ? 'var(--accent-cyan)' : 'var(--text-secondary)', 
                    fillOpacity: 0.8 
                  }} 
                  radius={activeSpot === s.id ? 8 : 5}
                  eventHandlers={{
                    click: () => { if(s.data) setActiveSpot(s.id) }
                  }}
                >
                  <Popup>
                    {s.code} <br /> {s.name}
                  </Popup>
                </CircleMarker>
              </React.Fragment>
            ))}
            {current && <MapUpdater center={current.coords} />}
          </MapContainer>
        </div>

        {/* Right Side: Metrics */}
        {data ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
          
          <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
            <div className="widget-icon-wrapper" style={{ width: '36px', height: '36px', marginBottom: '0.5rem' }}>
              <Waves size={18} />
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Hauteur houle</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>{data.height || '-'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>m</span>
            </div>
            {data.hmax && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Max : {data.hmax}m
              </div>
            )}
          </div>

          <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
            <div className="widget-icon-wrapper" style={{ width: '36px', height: '36px', marginBottom: '0.5rem' }}>
              <Timer size={18} />
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Période</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>{data.period || '-'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>s</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: data.period >= 7 ? '#10b981' : 'var(--text-secondary)', marginTop: '0.5rem' }}>
              {data.period >= 10 ? '🌊 Groundswell' : data.period >= 7 ? '🌊 Bonne énergie' : '🌬️ Houle courte'}
            </div>
          </div>

          {data.direction && (
          <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
            <div className="widget-icon-wrapper" style={{ width: '36px', height: '36px', marginBottom: '0.5rem' }}>
              <Compass size={18} />
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Dir. houle</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>{degToCardinal(data.direction)}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{data.direction}°</span>
              <div style={{ transform: `rotate(${data.direction}deg)`, color: 'var(--accent-cyan)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"></line>
                  <polyline points="5 12 12 5 19 12"></polyline>
                </svg>
              </div>
            </div>
          </div>
          )}

          {data.waterTemp && (
          <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
            <div className="widget-icon-wrapper" style={{ width: '36px', height: '36px', marginBottom: '0.5rem' }}>
              <Thermometer size={18} />
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Temp. eau</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>{data.waterTemp}</span>
              <span style={{ color: 'var(--text-secondary)' }}>°C</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: data.waterTemp >= 20 ? '#10b981' : data.waterTemp >= 16 ? '#f59e0b' : '#38bdf8', marginTop: '0.5rem' }}>
              {data.waterTemp >= 20 ? '🩳 Shorty' : data.waterTemp >= 16 ? '🧤 Combi 3/2' : '🥶 Combi 4/3+'}
            </div>
          </div>
          )}
        </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
            Données indisponibles pour ce spot.
          </div>
        )}
      </div>

      {/* Surf History Chart (CANDHIS spots only) */}
      {data?.surfHistory && data.surfHistory.length > 0 && (
        <SurfHistoryChart data={data.surfHistory} />
      )}
    </div>
  );
}
