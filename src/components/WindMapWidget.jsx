import React from 'react';
import { Wind } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function MapCenterUpdater({ center }) {
  const map = useMap();
  React.useEffect(() => {
    if (center) {
      // Zoom in slightly when focusing on a point (zoom 10)
      map.flyTo(center, 10, { animate: true, duration: 1.2 });
    }
  }, [center, map]);
  return null;
}

function getTimeSince(history) {
  if (!history || history.length === 0) return null;
  const last = history[history.length - 1];
  if (!last || !last.time) return null;
  // Handle both ISO string and epoch ms
  const ts = typeof last.time === 'number' ? last.time : new Date(last.time).getTime();
  return Date.now() - ts;
}

function formatAge(ms) {
  if (ms === null) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Live';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h${min % 60 > 0 ? String(min % 60).padStart(2, '0') : ''}`;
  return `${Math.floor(h / 24)}j`;
}

function getStaleLevel(ms) {
  if (ms === null) return 'unknown';
  if (ms < 10 * 60000) return 'fresh';     // < 10 min
  if (ms < 60 * 60000) return 'warm';       // < 1 hour
  return 'stale';                            // > 1 hour
}

function WindMarker({ source, coords, active, onClick, history }) {
  const data = source?.live;
  if (!data) return null;

  const hasDirection = data.windDirection !== null && data.windDirection !== undefined;
  const ageMs = getTimeSince(history);
  const level = getStaleLevel(ageMs);
  const ageLabel = formatAge(ageMs);

  const staleClass = level === 'stale' ? 'wind-marker-stale' : '';
  const badgeColor = level === 'fresh' ? '#22c55e' : level === 'warm' ? '#f59e0b' : level === 'stale' ? '#ef4444' : '#6b7280';
  const dotClass = level === 'fresh' ? 'stale-dot-pulse' : '';

  const icon = L.divIcon({
    className: `custom-wind-icon ${active ? 'active-wind-marker' : ''} ${staleClass}`,
    html: `
      <div class="wind-marker-container" style="cursor: pointer;">
        ${hasDirection ? `<div class="wind-arrow" style="transform: rotate(${data.windDirection}deg);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 19 21 12 17 5 21 12 2" fill="currentColor" opacity="0.8"/>
          </svg>
        </div>` : ''}
        <div class="wind-label glass-panel" style="cursor: pointer;">
          <div class="wind-speed">${data.windSpeed} <span class="text-xs">kts</span></div>
          <div class="wind-gust">Max: ${data.windGust}</div>
          <div class="wind-age-badge" style="color: ${badgeColor};">
            <span class="stale-dot ${dotClass}" style="background: ${badgeColor};"></span>
            ${ageLabel}
          </div>
          ${active ? '<div class="wind-active-tag">● Actif</div>' : ''}
        </div>
      </div>
    `,
    iconSize: [80, 90],
    iconAnchor: [40, 16]
  });

  return (
    <Marker 
      position={coords} 
      icon={icon} 
      zIndexOffset={active ? 1000 : 0}
      eventHandlers={{ click: () => onClick && onClick() }}
    />
  );
}

export default function WindMapWidget({ allWindData, activeSourceId, sources, onSourceSelect }) {
  if (!allWindData || Object.keys(allWindData).length === 0) return null;

  const activeSource = sources.find(s => s.id === activeSourceId);
  // Centrage par défaut sur le Golfe d'Ajaccio si rien de sélectionné
  const mapCenter = activeSource ? activeSource.coords : [41.9, 8.7];

  return (
    <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem', animation: 'fadeUp 1.1s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h3 className="widget-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <Wind size={20} style={{ color: 'var(--accent-cyan)' }}/> 
          General Wind Map
        </h3>
      </div>
      
      <div className="surf-map-container" style={{ position: 'relative', background: 'rgba(0,0,0,0.2)', borderRadius: '1rem', padding: '0.5rem', border: '1px solid var(--border-glass)', overflow: 'hidden' }}>
        <MapContainer 
          center={mapCenter} 
          zoom={10} 
          scrollWheelZoom={true}
          zoomControl={false}
          attributionControl={false}
          style={{ height: '450px', width: '100%', borderRadius: '0.5rem', zIndex: 0 }}
        >
          <MapCenterUpdater center={mapCenter} />
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={18}
          />
          {sources.map(s => {
            const sourceData = allWindData[s.id];
            if (!sourceData) return null;
            return (
              <WindMarker 
                key={s.id} 
                source={{ ...s, live: sourceData.live }} 
                coords={s.coords} 
                active={s.id === activeSourceId}
                onClick={() => onSourceSelect && onSourceSelect(s)}
                history={sourceData.history}
              />
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
