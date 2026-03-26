import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Wind, Thermometer, Droplets, Compass, Activity, Bell, BellOff } from 'lucide-react';
import { format } from 'date-fns';
import HistoricalChart from './HistoricalChart';
import { useWeatherData } from '../hooks/useWeatherData';

import { useNotifications } from '../hooks/useNotifications';
import { SOURCES } from '../config/sources';
import { getBeaufort, degToCardinal } from '../utils/beaufort';

// Lazy-loaded heavy map components (Leaflet ~200KB)
const WindMapWidget = lazy(() => import('./WindMapWidget'));
const SurfWidget = lazy(() => import('./SurfWidget'));

const ACTIVE_SOURCE_KEY = 'beacon_active_source';

function loadPreference(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch { return fallback; }
}

// --- Skeleton Loaders ---
const SkeletonCard = () => <div className="skeleton skeleton-card" />;
const SkeletonMap = () => <div className="skeleton skeleton-map" />;

// --- Memoized sub-components ---

// eslint-disable-next-line no-unused-vars
const DataWidget = React.memo(({ icon: Icon, title, value, unit, badge, delay }) => {
  if (value === null || value === undefined) return null;
  return (
    <div className="widget-card glass-panel" style={{ animationDelay: `${delay}s` }}>
      <div className="widget-icon-wrapper">
        <Icon size={20} strokeWidth={2} />
      </div>
      <h3 className="widget-title">{title}</h3>
      <div className="widget-value-container">
        <span className="widget-value">{value}</span>
        <span className="widget-unit">{unit}</span>
      </div>
      {badge && (
        <div
          className="beaufort-badge"
          style={{ background: `${badge.color}18`, color: badge.color, borderColor: `${badge.color}40` }}
        >
          <span>{badge.emoji}</span>
          <span>F{badge.force} — {badge.label}</span>
        </div>
      )}
    </div>
  );
});

const WindCompass = React.memo(({ direction, delay }) => {
  if (direction === null || direction === undefined) return null;
  const cardinal = degToCardinal(direction);
  return (
    <div className="widget-card glass-panel" style={{ animationDelay: `${delay}s`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="widget-icon-wrapper" style={{ margin: '0 auto 0.5rem' }}>
        <Compass size={20} strokeWidth={2} />
      </div>
      <h3 className="widget-title" style={{ textAlign: 'center' }}>Direction</h3>
      <div className="compass-container">
        <span className="compass-label compass-n">N</span>
        <span className="compass-label compass-e">E</span>
        <span className="compass-label compass-s">S</span>
        <span className="compass-label compass-w">W</span>
        <div className="compass-arrow" style={{ transform: `rotate(${direction}deg)` }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 19 21 12 17 5 21 12 2" fill="currentColor" opacity="0.3"/>
          </svg>
        </div>
      </div>
      <div className="widget-value-container" style={{ marginTop: 'auto', justifyContent: 'center' }}>
        <span className="widget-value" style={{ fontSize: '1.6rem' }}>{cardinal}</span>
        <span className="widget-unit">{direction}°</span>
      </div>
    </div>
  );
});

// --- Main Dashboard ---

export default function Dashboard() {
  const [activeSource, setActiveSource] = useState(() => {
    const savedId = loadPreference(ACTIVE_SOURCE_KEY, null);
    return SOURCES.find(s => s.id === savedId) || SOURCES[0];
  });

  // All data via Supabase Edge Function + Realtime
  const { windData, surfData, waterData, isLoading, lastUpdated, error: fetchError, isRealtime } = useWeatherData();

  const notifications = useNotifications(windData);

  // --- Derived data ---
  const weatherData = useMemo(() => {
    const activeData = windData[activeSource.id];
    if (!activeData || !activeData.live) return null;
    return activeData.live;
  }, [windData, activeSource.id]);

  const historyData = useMemo(() => {
    const activeData = windData[activeSource.id];
    if (!activeData || !activeData.history) return [];

    const mergedHistory = activeData.history.map(h => ({ ...h }));
    if (waterData && waterData.history && waterData.history.length > 0) {
      mergedHistory.forEach(hItem => {
        const hTime = new Date(hItem.time).getTime();
        let closest = null;
        let minDiff = Infinity;
        for (const cItem of waterData.history) {
          const diff = Math.abs(cItem.time - hTime);
          if (diff < minDiff) { minDiff = diff; closest = cItem; }
        }
        if (closest && minDiff < 20 * 60 * 1000) {
          hItem.waterTemp = closest.waterTemp;
        }
      });
    }
    return mergedHistory;
  }, [windData, activeSource.id, waterData]);

  // Persist active source
  useEffect(() => {
    localStorage.setItem(ACTIVE_SOURCE_KEY, JSON.stringify(activeSource.id));
  }, [activeSource]);

  // Error message (suppress during loading)
  const errorMessage = useMemo(() => {
    if (isLoading) return '';
    if (fetchError) return fetchError;
    const activeData = windData[activeSource.id];
    if (!activeData || !activeData.live) {
      if (Object.values(windData).some(v => v !== null)) {
        return `${activeSource.name} : données indisponibles`;
      }
    }
    return '';
  }, [windData, activeSource.id, activeSource.name, isLoading, fetchError]);

  const currentAlertSettings = notifications.settings[activeSource.id] || notifications.DEFAULT_SETTINGS;
  const beaufort = weatherData ? getBeaufort(weatherData.windGust) : null;
  const isLocked = currentAlertSettings.enabled;

  const thresholdInputStyle = (active) => ({
    width: '44px', background: active ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.15)',
    border: `1px solid ${active ? 'var(--border-glass)' : 'rgba(255,255,255,0.1)'}`,
    color: active ? 'white' : 'var(--text-secondary)', padding: '0.3rem', borderRadius: '0.4rem',
    textAlign: 'center', fontSize: '0.8rem', fontFamily: 'var(--font-heading)', fontWeight: 700,
    opacity: active ? 1 : 0.5
  });

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="dashboard-subtitle">
          <div className="live-dot" role="status" aria-label="Indicateur temps réel"></div>
          {activeSource.name}
        </div>
        <h1 className="dashboard-title">🌊 Beacon Live</h1>
      </header>

      <nav className="source-toggle-container" aria-label="Sélection de station">
        {SOURCES.map(source => (
          <button
            key={source.id}
            className={`source-toggle-btn ${activeSource.id === source.id ? 'active' : ''}`}
            onClick={() => setActiveSource(source)}
            disabled={isLoading}
            aria-pressed={activeSource.id === source.id}
          >
            {source.name}
          </button>
        ))}
      </nav>

      <div className="alert-bar glass-panel" role="region" aria-label="Paramètres d'alerte">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>🔔</span>
          {/* Avg threshold */}
          <button
            className={`source-toggle-btn ${currentAlertSettings.avgEnabled ? 'active' : ''}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', minWidth: 'unset' }}
            onClick={() => notifications.update(activeSource.id, { avgEnabled: !currentAlertSettings.avgEnabled })}
            disabled={isLocked}
          >Moy</button>
          <input
            type="number"
            value={currentAlertSettings.avgThreshold}
            onChange={(e) => notifications.update(activeSource.id, { avgThreshold: Number(e.target.value) })}
            style={thresholdInputStyle(currentAlertSettings.avgEnabled)}
            disabled={isLocked || !currentAlertSettings.avgEnabled}
            min={1} max={100}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', margin: '0 0.1rem' }}>+</span>
          {/* Gust threshold */}
          <button
            className={`source-toggle-btn ${currentAlertSettings.gustEnabled ? 'active' : ''}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', minWidth: 'unset' }}
            onClick={() => notifications.update(activeSource.id, { gustEnabled: !currentAlertSettings.gustEnabled })}
            disabled={isLocked}
          >Raf</button>
          <input
            type="number"
            value={currentAlertSettings.gustThreshold}
            onChange={(e) => notifications.update(activeSource.id, { gustThreshold: Number(e.target.value) })}
            style={thresholdInputStyle(currentAlertSettings.gustEnabled)}
            disabled={isLocked || !currentAlertSettings.gustEnabled}
            min={1} max={100}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>kts</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {SOURCES.filter(s => notifications.settings[s.id]?.enabled).map(s => {
            const ss = notifications.settings[s.id];
            const wind = windData[s.id];
            const gust = wind?.live ? parseFloat(wind.live.windGust) : 0;
            const avg = wind?.live ? parseFloat(wind.live.windSpeed) : 0;
            let allMet = true;
            if (ss.gustEnabled && gust < ss.gustThreshold) allMet = false;
            if (ss.avgEnabled && avg < ss.avgThreshold) allMet = false;
            const isCurrent = s.id === activeSource.id;
            return (
              <span
                key={s.id}
                className={`alert-spot-indicator ${allMet ? 'alert-spot-over' : ''} ${isCurrent ? 'alert-spot-current' : ''}`}
                title={`${s.name}: moy ${avg} / raf ${gust} kts`}
                onClick={() => setActiveSource(SOURCES.find(src => src.id === s.id))}
                role="button"
                tabIndex={0}
              >
                {isCurrent ? `⚡${wind?.live?.windGust || '—'}` : s.name.split(' ')[0].charAt(0) + s.name.split(' ')[s.name.split(' ').length - 1].charAt(0)}
              </span>
            );
          })}
          <button
            onClick={() => notifications.toggle(activeSource.id, activeSource.name)}
            className={`source-toggle-btn ${currentAlertSettings.enabled ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: currentAlertSettings.enabled ? 'var(--accent-orange)' : undefined, color: currentAlertSettings.enabled ? 'var(--bg-primary)' : 'white', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
          >
            {currentAlertSettings.enabled ? <Bell size={14} /> : <BellOff size={14} />}
            {currentAlertSettings.enabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {errorMessage && <div className="error-message" role="alert">{errorMessage}</div>}

      {isLoading && !weatherData && (
        <div>
          <SkeletonMap />
          <div className="skeleton skeleton-chart" style={{ marginTop: '1rem' }} />
          <div className="widgets-grid" style={{ marginTop: '1.5rem' }}>
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        </div>
      )}

      {weatherData && (
        <>
          <Suspense fallback={<SkeletonMap />}>
            <WindMapWidget allWindData={windData} activeSourceId={activeSource.id} sources={SOURCES} onSourceSelect={setActiveSource} />
          </Suspense>

          <HistoricalChart data={historyData} />

          <div className="widgets-grid" style={{ marginTop: '1.5rem' }}>
            <DataWidget icon={Wind} title="Vent moyen" value={weatherData.windSpeed} unit="kts" delay={0.05} />
            <DataWidget
              icon={Activity}
              title="Rafale max"
              value={weatherData.windGust}
              unit="kts"
              badge={beaufort}
              delay={0.1}
            />
            <WindCompass direction={weatherData.windDirection} delay={0.15} />
            <DataWidget icon={Thermometer} title="Temp. air" value={weatherData.temperature} unit="°C" delay={0.2} />
            <DataWidget icon={Droplets} title="Temp. eau" value={waterData?.current} unit="°C" delay={0.25} />
          </div>
        </>
      )}

      <Suspense fallback={<SkeletonMap />}>
        <SurfWidget surfData={surfData} windData={windData} />
      </Suspense>

      <div className="status-bar glass-panel" style={{ padding: '0.8rem 1.2rem', marginTop: '2rem', transition: 'border-color 0.3s ease', borderColor: isRealtime ? 'rgba(34, 197, 94, 0.6)' : undefined }} role="status">
        <span>{errorMessage ? '🔴 Hors ligne' : '🟢 Connecté'}</span>
        {isRealtime && (
          <span style={{ marginLeft: '0.8rem', color: '#22c55e', fontWeight: 700, fontSize: '0.8rem', animation: 'fadeIn 0.3s ease' }}>
            ⚡ Données reçues
          </span>
        )}
        <span style={{ float: 'right' }}>
          Mis à jour : {format(lastUpdated, 'HH:mm:ss')}
        </span>
      </div>
    </div>
  );
}
