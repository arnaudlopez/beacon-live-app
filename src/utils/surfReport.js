import { degToCardinal } from './beaufort';

/**
 * Generates a surfer-friendly report by crossing swell data with wind data.
 * Includes wave set estimation based on wave group theory.
 *
 * @param {Object} surf - { height, hmax, period, direction, waterTemp }
 * @param {Object} wind - { windSpeed, windGust, windDirection } (nearest station)
 * @param {string} spotName - Name of the surf spot
 * @returns {Object} { emoji, headline, detail, setInfo, verdict, verdictColor }
 */
export function getSurfReport(surf, wind, spotName) {
  if (!surf) return null;

  const h = parseFloat(surf.height) || 0;
  const hmax = parseFloat(surf.hmax) || 0;
  const period = parseFloat(surf.period) || 0;
  const swellDir = parseFloat(surf.direction);
  const windDir = parseFloat(wind?.windDirection);
  const windKts = parseFloat(wind?.windSpeed) || 0;
  const gustKts = parseFloat(wind?.windGust) || 0;

  // --- Swell quality ---
  const swellCardinal = !isNaN(swellDir) ? degToCardinal(swellDir) : null;
  const swellQuality = period >= 10 ? 'groundswell' : period >= 7 ? 'decent' : 'windswell';

  // --- Wind analysis relative to swell ---
  let windRelation = 'calme';
  let windEmoji = '🍃';

  // Default to WSW (255°) if swellDir is missing, realistic for West Corsica swells
  const effectiveSwellDir = !isNaN(swellDir) ? swellDir : 255;

  if (windKts <= 2) {
    windRelation = 'calme';
    windEmoji = '🪞';
  } else if (!isNaN(windDir)) {
    const diff = Math.abs(((windDir - effectiveSwellDir + 540) % 360) - 180);
    if (diff >= 135) {
      windRelation = 'offshore';
      windEmoji = '✨';
    } else if (diff >= 90) {
      windRelation = 'cross-shore';
      windEmoji = '↔️';
    } else {
      windRelation = 'onshore';
      windEmoji = '💨';
    }
  } else {
    windRelation = 'unknown';
    windEmoji = '💨';
  }

  // --- Wave set estimation ---
  // Based on wave group theory:
  // - Narrow band swell (groundswell, long period) → regular sets, 5-7 waves
  // - Wide band (windswell) → chaotic, 2-4 waves, irregular
  // - Hmax/Hs ratio indicates groupiness (theoretical Rayleigh: ~1.4 for N≈20)
  //   Higher ratio → more pronounced sets
  const setInfo = estimateWaveSets(h, hmax, period, swellQuality, surf.spread);

  // --- Build headline (sentence 1: swell info) ---
  let headline = '';
  if (h < 0.2) {
    headline = `Flat à ${spotName}, pas de houle significative.`;
  } else {
    const swellType = swellQuality === 'groundswell' ? 'groundswell'
      : swellQuality === 'decent' ? 'houle correcte'
      : 'houle de vent';
    const dirStr = swellCardinal ? `de ${swellCardinal}` : '';
    headline = `Houle ${dirStr} ${h}m (max ${hmax}m), période ${period}s — ${swellType}.`;
  }

  // --- Build detail (sentence 2: wind + verdict) ---
  let detail = '';
  const windCardinal = !isNaN(windDir) ? degToCardinal(windDir) : '';
  
  if (windRelation === 'calme') {
    detail = `Vent quasi nul (${windKts} kts), conditions glassy.`;
  } else if (windRelation === 'offshore') {
    detail = `Vent offshore de ${windCardinal} (${windKts}-${gustKts} kts), conditions propres !`;
  } else if (windRelation === 'cross-shore') {
    detail = `Vent cross-shore de ${windCardinal} (${windKts}-${gustKts} kts), conditions acceptables.`;
  } else if (windRelation === 'onshore') {
    detail = `Vent onshore de ${windCardinal} (${windKts}-${gustKts} kts), plan d'eau hachuré.`;
  } else {
    detail = `Vent fort de ${windKts}-${gustKts} kts, plan d'eau agité.`;
  }

  // --- Verdict ---
  let verdict, verdictColor;
  if (h < 0.2) {
    verdict = 'Flat'; verdictColor = '#94a3b8';
  } else if (windRelation === 'offshore' || windRelation === 'calme') {
    if (h >= 0.5 && period >= 6) {
      verdict = 'Go surf !'; verdictColor = '#10b981';
    } else {
      verdict = 'Petit mais propre'; verdictColor = '#14b8a6';
    }
  } else if (windRelation === 'cross-shore') {
    verdict = 'Jouable'; verdictColor = '#f59e0b';
  } else {
    verdict = 'Pas top'; verdictColor = '#ef4444';
  }

  return {
    emoji: windEmoji,
    headline,
    detail,
    setInfo,
    verdict,
    verdictColor
  };
}

/**
 * Estimates wave set characteristics from buoy data.
 *
 * Uses spectral spread at peak (CANDHIS arrDataPHP[3]) when available — this is the
 * directional spread of energy at the spectral peak, in degrees.
 *   - Narrow (< 20°): very organized swell, clear sets of 6-8 waves
 *   - Medium (20-35°): moderately defined sets of 4-6 waves
 *   - Wide (> 35°): dispersed energy, 2-4 waves, chaotic
 *
 * Falls back to period-based estimation when spread is unavailable (e.g. eSurfmar).
 *
 * @returns {Object|null} { wavesPerSet, setIntervalSec, setIntervalLabel, regularity, description }
 */
function estimateWaveSets(hs, hmax, period, swellQuality, spectralSpread) {
  if (!period || period < 1 || hs < 0.1) {
    return null;
  }

  let wavesPerSet, regularity;
  const spread = parseFloat(spectralSpread);
  const hasSpread = !isNaN(spread) && spread > 0;

  if (hasSpread) {
    // Use real spectral spread data from CANDHIS
    if (spread < 20) {
      // Very narrow: distant swell, highly organized
      wavesPerSet = [6, 8];
      regularity = 'très réguliers';
    } else if (spread < 30) {
      // Narrow-medium: clean swell, well-defined sets
      wavesPerSet = [5, 7];
      regularity = 'réguliers';
    } else if (spread < 40) {
      // Medium: moderately organized
      wavesPerSet = [3, 5];
      regularity = 'assez réguliers';
    } else {
      // Wide: dispersed energy, chaotic
      wavesPerSet = [2, 4];
      regularity = 'irréguliers';
    }
  } else {
    // Fallback: estimate from period and Hmax/Hs ratio
    const hmaxRatio = hmax > 0 && hs > 0 ? hmax / hs : 1.4;
    if (swellQuality === 'groundswell') {
      wavesPerSet = hmaxRatio > 1.8 ? [5, 8] : [4, 7];
      regularity = 'réguliers';
    } else if (swellQuality === 'decent') {
      wavesPerSet = hmaxRatio > 1.6 ? [4, 6] : [3, 5];
      regularity = 'assez réguliers';
    } else {
      wavesPerSet = [2, 4];
      regularity = 'irréguliers';
    }
  }

  // Set interval ≈ period × (waves in set + calm gap between sets)
  const avgWavesPerSet = (wavesPerSet[0] + wavesPerSet[1]) / 2;
  const calmFactor = hasSpread && spread < 25 ? 2.5 : swellQuality === 'groundswell' ? 2 : 1.5;
  const setIntervalSec = Math.round(period * (avgWavesPerSet + calmFactor));

  // Format interval
  let setIntervalLabel;
  if (setIntervalSec < 60) {
    setIntervalLabel = `~${setIntervalSec}s`;
  } else {
    const min = Math.floor(setIntervalSec / 60);
    const sec = setIntervalSec % 60;
    setIntervalLabel = sec > 0 ? `~${min}min${sec}s` : `~${min}min`;
  }

  // Build description
  const spreadInfo = hasSpread ? ` (étalement ${spread}°)` : '';
  let description;
  if (hasSpread && spread < 30) {
    description = `Sets ${regularity} de ${wavesPerSet[0]}–${wavesPerSet[1]} vagues toutes les ${setIntervalLabel}${spreadInfo}. Belle organisation.`;
  } else if (wavesPerSet[0] >= 4) {
    description = `Sets ${regularity} de ${wavesPerSet[0]}–${wavesPerSet[1]} vagues, intervalle ${setIntervalLabel}${spreadInfo}.`;
  } else {
    description = `Groupes de ${wavesPerSet[0]}–${wavesPerSet[1]} vagues toutes les ${setIntervalLabel}${spreadInfo}. Vagues ${regularity}, pas de vrais sets.`;
  }

  return {
    wavesPerSet,
    avgWavesPerSet: Math.round(avgWavesPerSet),
    setIntervalSec,
    setIntervalLabel,
    regularity,
    spectralSpread: hasSpread ? spread : null,
    description,
  };
}
