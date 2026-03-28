/** Shared TypeScript definitions for Beacon Live */

export interface Source {
  id: string;
  name: string;
  type: 'meteofrance' | 'windsup' | 'wunderground' | 'esurfmar' | 'owm';
  stationId?: string;
  pioupiouId?: string;
  coords: [number, number];
}

export interface WindLive {
  windSpeed: number | string;
  windGust: number | string;
  windDirection: number | null;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
}

export interface HistoryPoint {
  time: string | number;
  avgSpeed: number;
  maxGust: number;
  temperature: number | null;
  windDirection: number | null;
  waterTemp?: number;
}

export interface WindData {
  live: WindLive;
  history: HistoryPoint[];
}

export interface SurfPoint {
  height: number | null;
  hmax: number | null;
  period: number | null;
  direction: number | null;
  spread?: number | null;
}

export interface SurfHistoryPoint extends SurfPoint {
  time: number;
}

export interface SurfData {
  surf: SurfPoint | null;
  waterTemp: number | null;
  surfHistory: SurfHistoryPoint[];
}

export interface WaterData {
  current: number | null;
  history: Array<{ time: number; waterTemp: number }>;
}

export interface NotificationSettings {
  enabled: boolean;
  avgEnabled: boolean;
  avgThreshold: number;
  gustEnabled: boolean;
  gustThreshold: number;
}

export interface BeaufortLevel {
  force: number;
  label: string;
  emoji: string;
  color: string;
}

export interface AllWindData {
  [sourceId: string]: WindData | null;
}

export interface AllSurfData {
  revellata: (SurfData & { surfHistory: SurfHistoryPoint[] }) | null;
  bonifacio: (SurfData & { surfHistory: SurfHistoryPoint[] }) | null;
  ajaccio: { surfHistory: SurfHistoryPoint[]; height?: number; period?: number; hmax?: number; waterTemp?: number } | null;
}
