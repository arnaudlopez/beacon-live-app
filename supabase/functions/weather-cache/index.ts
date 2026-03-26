import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const METEOFRANCE_KEY = Deno.env.get("METEOFRANCE_KEY")!;
const WINDSUP_USER = Deno.env.get("WINDSUP_USER")||"";
const WINDSUP_PASS = Deno.env.get("WINDSUP_PASS")||"";

const WU_API_KEY = "e1f10a1e78da46f5b10a1e78da96f525";

const CACHE_TTL_DEFAULT = 3 * 60 * 1000; // 3 min
const CACHE_TTL_WU_FAST = 30 * 1000;     // 30s for Wunderground (Fast update stations)
const CACHE_TTL_WU_SLOW = 15 * 60 * 1000;// 15m for ICORSEPR2 (Slow update station)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function getCacheTTL(source: string): number {
  if (source === 'wunderground_ICORSEPR2') return CACHE_TTL_WU_SLOW;
  return source.startsWith('wunderground_') ? CACHE_TTL_WU_FAST : CACHE_TTL_DEFAULT;
}

async function fetchMF(sid: string) {
  const r = await fetch(`https://public-api.meteofrance.fr/public/DPPaquetObs/v1/paquet/infrahoraire-6m?id_station=${sid}&format=json`, {
    headers: { apikey: METEOFRANCE_KEY, accept: "application/json" }
  });
  if (!r.ok) { console.error(`MF ${sid}:${r.status}`); return null; }
  const d = await r.json();
  if (!d || d.length === 0) return null;
  const l = d[0];
  return {
    live: {
      windSpeed: l.ff ? (l.ff * 1.94384).toFixed(1) : "0",
      windGust: l.fxi10 ? (l.fxi10 * 1.94384).toFixed(1) : l.fxi ? (l.fxi * 1.94384).toFixed(1) : (l.ff ? (l.ff * 1.94384).toFixed(1) : "0"),
      windDirection: l.dd || 0,
      temperature: l.t ? (l.t - 273.15).toFixed(1) : null,
      humidity: l.u || null,
      pressure: l.pmer ? (l.pmer / 100).toFixed(1) : null
    },
    history: d.map((i: Record<string, unknown>) => {
      const s = (i.ff as number) ? (i.ff as number) * 1.94384 : 0;
      const g = ((i.fxi10 || i.fxi || i.ff) as number) || 0;
      return {
        time: i.validity_time || i.reference_time,
        avgSpeed: Number(s.toFixed(1)),
        maxGust: Number((g * 1.94384).toFixed(1)),
        temperature: (i.t as number) ? Number(((i.t as number) - 273.15).toFixed(1)) : null,
        windDirection: i.dd !== undefined ? i.dd : null
      };
    }).reverse()
  };
}

async function fetchPP(sid: string) {
  const r = await fetch(`https://api.pioupiou.fr/v1/live/${sid}`);
  if (!r.ok) return null;
  const j = await r.json();
  const m = j.data?.measurements;
  if (!m) return null;
  let h: unknown[] = [];
  const stop = new Date().toISOString();
  const start = new Date(Date.now() - 48 * 3600000).toISOString();
  const hr = await fetch(`https://api.pioupiou.fr/v1/archive/${sid}?start=${start}&stop=${stop}`);
  if (hr.ok) {
    const hj = await hr.json();
    h = (hj.data || []).map((i: unknown[]) => ({
      time: i[0],
      avgSpeed: i[4] !== null ? Number((Number(i[4]) / 1.852).toFixed(1)) : 0,
      maxGust: i[5] !== null ? Number((Number(i[5]) / 1.852).toFixed(1)) : 0,
      windDirection: i[6] !== null ? Number(i[6]) : null
    }));
  }
  return {
    live: {
      windSpeed: (m.wind_speed_avg / 1.852).toFixed(1),
      windGust: (m.wind_speed_max / 1.852).toFixed(1),
      windDirection: m.wind_heading,
      temperature: null, humidity: null, pressure: null
    },
    history: h
  };
}

async function fetchCD(b: string) {
  const r = await fetch(`https://candhis.cerema.fr/_public_/campagne.php?${b}`);
  if (!r.ok) return { waterTemp: null, waterHistory: [], surf: null, surfHistory: [] };
  const html = await r.text();
  let wt = null; let wh: unknown[] = []; let sf = null; let surfHistory: unknown[] = [];
  const mt = html.match(/arrDataPHP\[4\]\s*=\s*eval\('(\[.*?\])'\);/);
  if (mt?.[1]) { const a = JSON.parse(mt[1]); if (a?.length > 0) { wt = a[0][1]; wh = a.map((i: [string, number]) => ({ time: new Date(i[0].replace(" ", "T")).getTime(), waterTemp: i[1] })); } }
  const mH = html.match(/arrDataPHP\[0\]\s*=\s*eval\('(\[.*?\])'\);/);
  const mP = html.match(/arrDataPHP\[1\]\s*=\s*eval\('(\[.*?\])'\);/);
  const mD = html.match(/arrDataPHP\[2\]\s*=\s*eval\('(\[.*?\])'\);/);
  const mS = html.match(/arrDataPHP\[3\]\s*=\s*eval\('(\[.*?\])'\);/);
  if (mH && mP && mD) {
    const aH = JSON.parse(mH[1]); const aP = JSON.parse(mP[1]); const aD = JSON.parse(mD[1]); const aS = mS ? JSON.parse(mS[1]) : [];
    if (aH.length > 0 && aP.length > 0 && aD.length > 0) {
      sf = { height: aH[0][1], hmax: aH[0][3], period: aP[0][1], direction: aD[0][1], spread: aS.length > 0 ? aS[0][1] : null };
      const byTime = new Map<string, Record<string, number|null>>();
      for (const row of aH) { const ts = new Date(row[0].replace(" ", "T")).getTime(); const key = String(ts); if (!byTime.has(key)) byTime.set(key, { time: ts, height: null, hmax: null, period: null, direction: null, spread: null }); const entry = byTime.get(key)!; entry.height = row[1]; if (row[3] !== undefined) entry.hmax = row[3]; }
      for (const row of aP) { const ts = new Date(row[0].replace(" ", "T")).getTime(); const key = String(ts); if (!byTime.has(key)) byTime.set(key, { time: ts, height: null, hmax: null, period: null, direction: null, spread: null }); byTime.get(key)!.period = row[1]; }
      for (const row of aD) { const ts = new Date(row[0].replace(" ", "T")).getTime(); const key = String(ts); if (byTime.has(key)) byTime.get(key)!.direction = row[1]; }
      for (const row of aS) { const ts = new Date(row[0].replace(" ", "T")).getTime(); const key = String(ts); if (byTime.has(key)) byTime.get(key)!.spread = row[1]; }
      surfHistory = Array.from(byTime.values()).sort((a: any, b: any) => a.time - b.time);
    }
  }
  return { waterTemp: wt, waterHistory: wh, surf: sf, surfHistory };
}

const FR_MONTHS: Record<string, number> = {
  'janvier': 0, 'f\u00e9vrier': 1, 'fevrier': 1, 'mars': 2, 'avril': 3, 'mai': 4, 'juin': 5,
  'juillet': 6, 'ao\u00fbt': 7, 'aout': 7, 'septembre': 8, 'octobre': 9, 'novembre': 10, 'd\u00e9cembre': 11, 'decembre': 11
};

function parseESDate(dateStr: string): number | null {
  const m = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{2})TU/);
  if (!m) return null;
  const day = parseInt(m[1]); const monthName = m[2].toLowerCase(); const hour = parseInt(m[3]);
  const monthIdx = FR_MONTHS[monthName]; if (monthIdx === undefined) return null;
  return Date.UTC(new Date().getUTCFullYear(), monthIdx, day, hour, 0, 0);
}

async function fetchES(slug: string) {
  const r = await fetch(`https://esurfmar.meteo.fr/real-time/html/${slug}_data.html`);
  if (!r.ok) return null;
  const html = await r.text();
  const rowRegex = /<tr bgcolor=#[F0-9A-Fa-f]{6}>\s*(<td class="data"[\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>(.*?)<\/td>/gs;
  
  const surfHistory: Array<{time: number, height: number|null, hmax: number|null, period: number|null, direction: number|null}> = [];
  const windHistory: Array<{time: number, avgSpeed: number, maxGust: number, temperature: number|null, windDirection: number|null}> = [];
  
  let latestRow: string[] | null = null; 
  let latestWindRow: string[] | null = null;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowContent = rowMatch[1]; 
    const cells: string[] = []; 
    let cellMatch; 
    cellRegex.lastIndex = 0;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) { cells.push(cellMatch[1].replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, "").trim()); }
    
    if (cells.length >= 11) {
      const ts = parseESDate(cells[0]);
      if (!ts) continue;

      const hasWave = (!isNaN(parseFloat(cells[9])) || !isNaN(parseFloat(cells[8])));
      const hasWind = (!isNaN(parseFloat(cells[2])) || !isNaN(parseFloat(cells[3])));

      if (!latestRow && hasWave) latestRow = cells;
      if (!latestWindRow && hasWind) latestWindRow = cells;

      if (hasWave) {
        surfHistory.push({ 
          time: ts, 
          height: cells[9] ? parseFloat(cells[9]) : null, 
          hmax: cells[10] ? parseFloat(cells[10]) : null, 
          period: cells[8] ? parseFloat(cells[8]) : null, 
          direction: cells[1] ? parseInt(cells[1]) : 270
        });
      }

      if (hasWind) {
        windHistory.push({ 
           time: ts, 
           avgSpeed: cells[2] ? parseFloat(cells[2]) : 0, 
           maxGust: cells[3] ? parseFloat(cells[3]) : 0, 
           temperature: cells[4] ? parseFloat(cells[4]) : null, 
           windDirection: cells[1] ? parseInt(cells[1]) : null 
        });
      }
    }
  }
  
  surfHistory.sort((a, b) => a.time - b.time);
  windHistory.sort((a, b) => a.time - b.time);

  if (!latestRow && !latestWindRow) return null;

  const result: any = {
    surfHistory,
    history: windHistory
  };

  if (latestRow) {
    result.period = latestRow[8] ? parseFloat(latestRow[8]) : null;
    result.height = latestRow[9] ? parseFloat(latestRow[9]) : null;
    result.hmax = latestRow[10] ? parseFloat(latestRow[10]) : null;
    result.waterTemp = latestRow[5] ? parseFloat(latestRow[5]) : null;
    result.direction = null; // Removed fake coupling to wind direction
  }

  if (latestWindRow) {
    result.live = {
      windSpeed: latestWindRow[2] ? parseFloat(latestWindRow[2]) : 0,
      windGust: latestWindRow[3] ? parseFloat(latestWindRow[3]) : 0,
      windDirection: latestWindRow[1] ? parseInt(latestWindRow[1]) : null,
      temperature: latestWindRow[4] ? parseFloat(latestWindRow[4]) : null,
      humidity: latestWindRow[6] ? parseFloat(latestWindRow[6]) : null,
      pressure: latestWindRow[7] ? parseFloat(latestWindRow[7]) : null
    };
  }

  return result;
}

function getParisOffsetMs(_ts: number) {
  const d = new Date(_ts); const month = d.getUTCMonth(); const day = d.getUTCDate();
  if (month >= 3 && month <= 8) return 7200000;
  if (month <= 1 || month >= 10) return 3600000;
  if (month === 2) { const ls = 31 - ((5 + new Date(d.getUTCFullYear(), 2, 31).getDay()) % 7); return day >= ls ? 7200000 : 3600000; }
  const ls = 31 - ((5 + new Date(d.getUTCFullYear(), 9, 31).getDay()) % 7); return day >= ls ? 3600000 : 7200000;
}

async function fetchWindsUp(sid: string) {
  if (!WINDSUP_USER || !WINDSUP_PASS) return null;
  try {
    const authRes = await fetch("https://www.winds-up.com/index.php", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `login_pseudo=${encodeURIComponent(WINDSUP_USER)}&login_passwd=${encodeURIComponent(WINDSUP_PASS)}&action=post_login`, redirect: "manual" });
    const cookieHeader = authRes.headers.get("set-cookie") || "";
    const sidMatch = cookieHeader.match(/PHPSESSID=([^;]+)/); if (!sidMatch) { console.error("WindsUp: No PHPSESSID"); return null; }
    const c = `PHPSESSID=${sidMatch[1]}`;
    const baseUrl = `https://www.winds-up.com/spot-${sid}-observations-releves-vent.html`;
    const yesterday = new Date(Date.now() - 24 * 3600000);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
    const [rToday, rYesterday] = await Promise.all([ fetch(baseUrl, { headers: { "Cookie": c } }), fetch(`${baseUrl}?date=${yStr}`, { headers: { "Cookie": c } }) ]);
    const htmlToday = await rToday.text(); const htmlYesterday = await rYesterday.text();
    const degMap: Record<string, number> = { "N": 0, "NNE": 22, "NE": 45, "ENE": 67, "E": 90, "ESE": 112, "SE": 135, "SSE": 157, "S": 180, "SSO": 202, "SO": 225, "OSO": 247, "O": 270, "ONO": 292, "NO": 315, "NNO": 337 };
    function parseWindsUpPage(html: string) {
      const tableDegMap = new Map<string, number>();
      const tableRowRegex = /- (\d{2}:\d{2})<\/td>\s*<td[^>]*>.*?(\d{1,3})\u00b0/g;
      let tableMatch; while ((tableMatch = tableRowRegex.exec(html)) !== null) { if (!tableDegMap.has(tableMatch[1])) tableDegMap.set(tableMatch[1], parseInt(tableMatch[2])); }
      const chartRegex = /\{x:(\d{13}),\s*y:([\d.]+)[^}]*o:"([^"]*)"[^}]*min:"([\d.]*)"[^}]*max:"([\d.]*)"[^}]*\}/g;
      const points: Array<{time: number, avgSpeed: number, maxGust: number, temperature: null, windDirection: number|null}> = [];
      let match; while ((match = chartRegex.exec(html)) !== null) {
        if (match[0].includes('abo:"no"')) continue;
        const fakeTs = parseInt(match[1]); const tzOffset = getParisOffsetMs(fakeTs); const realTs = fakeTs - tzOffset;
        const avg = parseFloat(match[2]); const oField = match[3]; const max = match[5] ? parseFloat(match[5]) : avg;
        const localDate = new Date(fakeTs); const minuteKey = `${String(localDate.getUTCHours()).padStart(2,'0')}:${String(localDate.getUTCMinutes()).padStart(2,'0')}`;
        let dir: number | null = null; const tableDeg = tableDegMap.get(minuteKey);
        if (tableDeg !== undefined) dir = tableDeg; else if (oField && degMap[oField] !== undefined) dir = degMap[oField];
        points.push({ time: realTs, avgSpeed: Number(avg.toFixed(1)), maxGust: Number(max.toFixed(1)), temperature: null, windDirection: dir });
      }
      return points;
    }
    const yesterdayPoints = parseWindsUpPage(htmlYesterday); const todayPoints = parseWindsUpPage(htmlToday);
    const seen = new Set<number>(); const history = [];
    for (const p of [...yesterdayPoints, ...todayPoints]) { if (!seen.has(p.time)) { seen.add(p.time); history.push(p); } }
    history.sort((a, b) => a.time - b.time);
    if (history.length === 0) return null;
    const live = history[history.length - 1];
    return { live: { windSpeed: live.avgSpeed, windGust: live.maxGust, windDirection: live.windDirection, temperature: null, humidity: null, pressure: null }, history };
  } catch (e) { console.error("WindsUp err:", e); return null; }
}

async function fetchWU(stationId: string) {
  const baseUrl = "https://api.weather.com/v2/pws";
  try {
    const [liveRes, histRes] = await Promise.all([
      fetch(`${baseUrl}/observations/current?apiKey=${WU_API_KEY}&stationId=${stationId}&numericPrecision=decimal&format=json&units=m`),
      fetch(`${baseUrl}/observations/all/1day?apiKey=${WU_API_KEY}&stationId=${stationId}&numericPrecision=decimal&format=json&units=m`)
    ]);
    if (!liveRes.ok) { console.error(`WU live ${stationId}:${liveRes.status}`); return null; }
    const liveJson = await liveRes.json(); const obs = liveJson.observations?.[0]; if (!obs) return null;
    const met = obs.metric || obs.imperial;
    const toKts = (kmh: number) => Number((kmh / 1.852).toFixed(1));
    const live = { windSpeed: toKts(met.windSpeed || 0), windGust: toKts(met.windGust || 0), windDirection: obs.winddir || 0, temperature: met.temp !== undefined ? Number(met.temp.toFixed(1)) : null, humidity: obs.humidity || null, pressure: met.pressure || null };
    let history: Array<{time: string, avgSpeed: number, maxGust: number, temperature: number|null, windDirection: number|null}> = [];
    if (histRes.ok) {
      const histJson = await histRes.json(); const hObs = histJson.observations || [];
      history = hObs.map((h: any) => { const hm = h.metric || h.imperial; return { time: new Date(h.obsTimeUtc).toISOString(), avgSpeed: toKts(hm.windspeedAvg || 0), maxGust: toKts(hm.windgustHigh || 0), temperature: hm.tempAvg !== undefined ? Number(hm.tempAvg.toFixed(1)) : null, windDirection: h.winddirAvg !== undefined ? h.winddirAvg : null }; });
    }
    const liveTime = new Date(obs.obsTimeUtc).toISOString();
    if (history.length === 0 || new Date(history[history.length - 1].time).getTime() < new Date(liveTime).getTime()) {
      history.push({ time: liveTime, avgSpeed: live.windSpeed, maxGust: live.windGust, temperature: live.temperature, windDirection: live.windDirection });
    }
    return { live, history };
  } catch (e) { console.error(`WU err ${stationId}:`, e); return null; }
}

type F = () => Promise<unknown>;

const SF: Record<string, F> = {
  meteofrance_20004002: () => fetchMF("20004002"),
  meteofrance_20004003: () => fetchMF("20004003"),
  pioupiou_1202: () => fetchPP("1202"),
  candhis_revellata: () => fetchCD("Y2FtcD0wMkIwNA=="),
  candhis_bonifacio: () => fetchCD("Y2FtcD0wMkEwMQ=="),
  esurfmar_ajaccio: () => fetchES("ajaccio"),
  esurfmar_calvi: () => fetchES("calvi"),
  windsup_porticcio: () => fetchWindsUp("porticcio--windsurf-kitesurf-1726"),
  wunderground_IGROSS105: () => fetchWU("IGROSS105"),
  wunderground_ISARROLA7: () => fetchWU("ISARROLA7"),
  wunderground_ICORSEPR2: () => fetchWU("ICORSEPR2"),
  wunderground_ISARTN1: () => fetchWU("ISARTN1"),
  wunderground_IBONIF6: () => fetchWU("IBONIF6"),
  owm_1202: () => fetchPP("1202")
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") { return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type", "Access-Control-Allow-Methods": "POST,GET,OPTIONS" } }); }
  try {
    let rs = Object.keys(SF);
    if (req.method === "POST") { const b = await req.json(); if (b.sources && Array.isArray(b.sources)) rs = b.sources.filter((s: string) => s in SF); }
    const now = Date.now(); const res: Record<string, unknown> = {};
    const { data: c } = await supabase.from("weather_cache").select("source,data,fetched_at").in("source", rs);
    const cm = new Map<string, { data: unknown; fetched_at: string }>(); if (c) { for (const r of c) cm.set(r.source, r); }
    await Promise.all(rs.map(async (s) => {
      const e = cm.get(s);
      if (e) {
        let ttl = getCacheTTL(s);
        if (s.startsWith('meteofrance_') && e.data && (e.data as any).history && (e.data as any).history.length > 0) {
          const hist = (e.data as any).history;
          const lastObs = hist[hist.length - 1];
          if (lastObs && lastObs.time) { if (now - new Date(lastObs.time).getTime() > 6 * 60 * 1000) ttl = 30 * 1000; }
        }
        if (s === 'wunderground_ICORSEPR2' && e.data && (e.data as any).history && (e.data as any).history.length > 0) {
          const hist = (e.data as any).history;
          const lastObs = hist[hist.length - 1];
          if (lastObs && lastObs.time) { if (now - new Date(lastObs.time).getTime() > 15 * 60 * 1000) ttl = 30 * 1000; }
        }
        if (s.startsWith('esurfmar_') && e.data && (e.data as any).history && (e.data as any).history.length > 0) {
          const hist = (e.data as any).history;
          const lastObs = hist[hist.length - 1];
          if (lastObs && lastObs.time) { 
            const obsDate = new Date(lastObs.time);
            const nextExpectedTime = Date.UTC(obsDate.getUTCFullYear(), obsDate.getUTCMonth(), obsDate.getUTCDate(), obsDate.getUTCHours() + 1, 31, 0);
            if (now < nextExpectedTime) {
              ttl = nextExpectedTime - now;
            } else {
              ttl = 2 * 60 * 1000;
            }
          }
        }
        const age = now - new Date(e.fetched_at).getTime();
        if (age < ttl) { res[s] = e.data; return; }
      }
      const f = SF[s]; if (!f) return;
      try { const d = await f(); if (d !== null) { await supabase.from("weather_cache").upsert({ source: s, data: d, fetched_at: new Date().toISOString() }); res[s] = d; } else { res[s] = e?.data ?? null; } }
      catch (err) { console.error(`Err ${s}:`, err); res[s] = e?.data ?? null; }
    }));
    return new Response(JSON.stringify({ data: res, ts: new Date().toISOString() }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public,max-age=15" } });
  } catch (err) { console.error(err); return new Response(JSON.stringify({ error: "err" }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }); }
});
