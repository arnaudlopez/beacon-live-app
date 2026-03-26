/**
 * Centralized configuration for all data sources, station IDs, and intervals.
 */

export const SOURCES = [
  { id: 'lfkj', name: "Ajaccio - Campo dell'Oro", type: 'meteofrance', stationId: '20004002', coords: [41.923, 8.802] },
  { id: 'la_parata', name: 'Ajaccio - La Parata', type: 'meteofrance', stationId: '20004003', coords: [41.908, 8.618] },
  { id: 'porticcio', name: 'Porticcio', type: 'windsup', stationId: '1726', coords: [41.868, 8.787] },
  { id: 'porticcio_haut', name: 'Nebbiajo', type: 'wunderground', stationId: 'IGROSS105', coords: [41.903, 8.828] },
  { id: 'mezzavia', name: 'Mezzavia', type: 'wunderground', stationId: 'ISARROLA7', coords: [41.951, 8.787] },
  { id: 'propriano', name: 'Propriano', type: 'wunderground', stationId: 'ICORSEPR2', coords: [41.674, 8.899] },
  { id: 'tizzano', name: 'Tizzano', type: 'wunderground', stationId: 'ISARTN1', coords: [41.540, 8.852] },
  { id: 'bonifacio_tramizzi', name: 'Bonifacio Tramizzi', type: 'wunderground', stationId: 'IBONIF6', coords: [41.403, 9.155] },
  { id: 'ajaccio_buoy', name: "Bouée Golfe d'Ajaccio", type: 'esurfmar', stationId: 'ajaccio', coords: [41.750, 7.580] },
  { id: 'owm-1202', name: 'San Bastianu (OWM)', type: 'owm', pioupiouId: '1202', coords: [42.164, 8.618] }
];

export const CANDHIS_STATIONS = {
  revellata: { id: 'Y2FtcD0wMkIwNA==', code: '02B04', name: 'La Revellata', coords: [42.569, 8.650] },
  bonifacio: { id: 'Y2FtcD0wMkEwMQ==', code: '02A01', name: 'Bonifacio', coords: [41.323, 8.878] }
};

export const ESURFMAR_STATION = {
  name: "Golfe d'Ajaccio",
  coords: [41.750, 7.580],
  url: '/api/esurfmar/real-time/html/ajaccio_data.html'
};

// Refresh intervals (ms)
export const WEATHER_INTERVAL = 30000;   // 30s
export const MARINE_INTERVAL  = 60000;   // 60s
export const CACHE_TTL        = 55000;   // 55s
export const NOTIF_COOLDOWN   = 900000;  // 15min anti-spam

// Defaults
export const DEFAULT_NOTIFICATION_THRESHOLD = 25; // kts
