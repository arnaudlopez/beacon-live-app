import { useState, useEffect } from 'react';

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

        // L'appel passe par notre proxy nginx qui injecte le token côté serveur (jamais exposé au navigateur)
        const url = `/api/infoclimat/?version=2&method=get&format=json&stations[]=${STATION_ID}&start=${fStart}&end=${fEnd}&_t=${Date.now()}`;
        
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Infoclimat HTTP error! status: ${res.status}`);
        
        const json = await res.json();
        if (cancelled) return;

        const hourly = json.hourly?.[STATION_ID] || [];
        if (hourly.length === 0) return;

        const historyRev = [...hourly].reverse();
        const latest = historyRev.find(h => h.vent_moyen !== null) || historyRev[0];
        
        const formatHistory = (h) => {
          const speedKmh = parseFloat(h.vent_moyen || 0);
          const gustKmh = parseFloat(h.vent_rafales_10min || h.vent_rafales || 0);
          return {
            time: h.dh_utc.replace(' ', 'T') + 'Z',
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
          history: hourly.map(formatHistory).filter(item => item.time)
        });
      } catch (err) {
        console.error('Erreur fetch Infoclimat (Proxy API):', err);
      }
    };

    fetchInfo();
    const interval = setInterval(fetchInfo, 10 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return data;
}
