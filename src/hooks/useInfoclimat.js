import { useState, useEffect } from 'react';

const INFOCLIMAT_TOKEN = import.meta.env.VITE_INFOCLIMAT_TOKEN;
const STATION_ID = 'STATIC0317';

export function useInfoclimat() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchInfo = async () => {
      try {
        const end = new Date();
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        
        const fStart = start.toISOString().split('T')[0];
        const fEnd = end.toISOString().split('T')[0];

        // L'appel passe par notre proxy local pour utiliser l'IP autorisée
        // Ajout d'un cache-buster (_t) pour forcer le navigateur à ne pas utiliser le cache pour cette URL !
        const url = `/api/infoclimat/?version=2&method=get&format=json&stations[]=${STATION_ID}&start=${fStart}&end=${fEnd}&token=${INFOCLIMAT_TOKEN}&_t=${Date.now()}`;
        
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Infoclimat HTTP error! status: ${res.status}`);
        
        const json = await res.json();
        if (cancelled) return;

        const hourly = json.hourly?.[STATION_ID] || [];
        if (hourly.length === 0) return;

        // Infoclimat renvoie du plus ancien au plus récent. On inverse juste pour extraire le live
        const historyRev = [...hourly].reverse();
        // On cherche le dernier point qui a bien une mesure de vent moyen (parfois null)
        const latest = historyRev.find(h => h.vent_moyen !== null) || historyRev[0];
        
        const formatHistory = (h) => {
          const speedKmh = parseFloat(h.vent_moyen || 0);
          const gustKmh = parseFloat(h.vent_rafales_10min || h.vent_rafales || 0);
          return {
            time: h.dh_utc.replace(' ', 'T') + 'Z', // Infoclimat format "2026-03-24 00:00:00" -> ISO UTC
            avgSpeed: Number((speedKmh / 1.852).toFixed(1)),
            maxGust: Number((gustKmh / 1.852).toFixed(1)),
            temperature: h.temperature ? Number(h.temperature) : null,
            windDirection: h.vent_direction ? parseInt(h.vent_direction, 10) : null
          };
        };

        const liveSpeedKmh = parseFloat(latest.vent_moyen || 0);
        const liveGustKmh = parseFloat(latest.vent_rafales_10min || latest.vent_rafales || 0);

        setData({
          live: {
            windSpeed: (liveSpeedKmh / 1.852).toFixed(1),
            windGust: (liveGustKmh / 1.852).toFixed(1),
            windDirection: latest.vent_direction ? parseInt(latest.vent_direction, 10) : null,
            temperature: latest.temperature ? Number(latest.temperature) : null
          },
          // Garder l'ordre chronologique (du plus ancien au plus récent) pour la compatibilité avec Supreme Chart
          history: hourly.map(formatHistory).filter(item => item.time)
        });
      } catch (err) {
        console.error('Erreur fetch Infoclimat (Proxy API):', err);
      }
    };

    fetchInfo();
    // Infoclimat (STATIC) actualise généralement toutes les 10 minutes
    const interval = setInterval(fetchInfo, 10 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return data;
}
