/**
 * Beaufort wind scale with surf-friendly French labels.
 * Input: wind speed in knots. Returns: { force, label, color, emoji }
 */

const BEAUFORT_SCALE = [
  { max: 1,   force: 0,  label: 'Calme plat',     emoji: '🪞',  color: '#94a3b8' },
  { max: 3,   force: 1,  label: 'Très légère',    emoji: '🍃',  color: '#67e8f9' },
  { max: 6,   force: 2,  label: 'Légère brise',   emoji: '🌿',  color: '#22d3ee' },
  { max: 10,  force: 3,  label: 'Petite brise',   emoji: '💨',  color: '#06b6d4' },
  { max: 16,  force: 4,  label: 'Jolie brise',    emoji: '🌊',  color: '#0891b2' },
  { max: 21,  force: 5,  label: 'Bonne brise',    emoji: '⛵',  color: '#059669' },
  { max: 27,  force: 6,  label: 'Vent frais',     emoji: '🏄',  color: '#f59e0b' },
  { max: 33,  force: 7,  label: 'Grand frais',    emoji: '🏄‍♂️', color: '#f97316' },
  { max: 40,  force: 8,  label: 'Coup de vent',   emoji: '⚠️',  color: '#ef4444' },
  { max: 47,  force: 9,  label: 'Fort coup',      emoji: '🌪️',  color: '#dc2626' },
  { max: 55,  force: 10, label: 'Tempête',        emoji: '🌀',  color: '#b91c1c' },
  { max: 63,  force: 11, label: 'Violente temp.', emoji: '☠️',  color: '#991b1b' },
  { max: Infinity, force: 12, label: 'Ouragan',   emoji: '💀',  color: '#7f1d1d' }
];

export function getBeaufort(kts) {
  const speed = parseFloat(kts);
  if (isNaN(speed)) return BEAUFORT_SCALE[0];
  for (const entry of BEAUFORT_SCALE) {
    if (speed <= entry.max) return entry;
  }
  return BEAUFORT_SCALE[BEAUFORT_SCALE.length - 1];
}

/**
 * Returns a human-friendly cardinal direction for a given degree.
 */
export function degToCardinal(deg) {
  if (deg === null || deg === undefined) return '—';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}
