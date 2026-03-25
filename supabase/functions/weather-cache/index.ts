import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const METEOFRANCE_KEY = Deno.env.get("METEOFRANCE_KEY")!;
const WINDSUP_USER = Deno.env.get("WINDSUP_USER")||"";
const WINDSUP_PASS = Deno.env.get("WINDSUP_PASS")||"";
const INFOCLIMAT_TOKEN = Deno.env.get("INFOCLIMAT_TOKEN")||"";

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
      temperature: null,
      humidity: null,
      pressure: null
    },
    history: h
  };
}

async function fetchCD(b: string) {
  const r = await fetch(`https://candhis.cerema.fr/_public_/campagne.php?${b}`);
  if (!r.ok) return { waterTemp: null, waterHistory: [], surf: null };
  const html = await r.text();
  let wt = null;
  let wh: unknown[] = [];
  let sf = null;
  const mt = html.match(/arrDataPHP\[4\]\s*=\s*eval\('(\[.*?\])'\);/);
  if (mt?.[1]) {
    const a = JSON.parse(mt[1]);
    if (a?.length > 0) {
      wt = a[0][1];
      wh = a.map((i: [string, number]) => ({ time: new Date(i[0].replace(" ", "T")).getTime(), waterTemp: i[1] }));
    }
  }
  const mH = html.match(/arrDataPHP\[0\]\s*=\s*eval\('(\[.*?\])'\);/);
  const mP = html.match(/arrDataPHP\[1\]\s*=\s*eval\('(\[.*?\])'\);/);
  const mD = html.match(/arrDataPHP\[2\]\s*=\s*eval\('(\[.*?\])'\);/);
  const mS = html.match(/arrDataPHP\[3\]\s*=\s*eval\('(\[.*?\])'\);/);
  if (mH && mP && mD) {
    const aH = JSON.parse(mH[1]);
    const aP = JSON.parse(mP[1]);
    const aD = JSON.parse(mD[1]);
    const aS = mS ? JSON.parse(mS[1]) : [];
    if (aH.length > 0 && aP.length > 0 && aD.length > 0) {
      sf = {
        height: aH[0][1],
        hmax: aH[0][3],
        period: aP[0][1],
        direction: aD[0][1],
        spread: aS.length > 0 ? aS[0][1] : null
      };
    }
  }
  return { waterTemp: wt, waterHistory: wh, surf: sf };
}

async function fetchES() {
  const r = await fetch("https://esurfmar.meteo.fr/real-time/html/ajaccio_data.html");
  if (!r.ok) return null;
  const html = await r.text();
  const rm = html.match(/<tr bgcolor=#[F0-9A-Fa-f]{6}>\s*(<td class="data"(.|[\n])*?)<\/tr>/i);
  if (!rm) return null;
  const rx = /<td[^>]*>(.*?)<\/td>/gs;
  const ts: string[] = [];
  let tm;
  while ((tm = rx.exec(rm[1])) !== null) {
    ts.push(tm[1].replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, "").trim());
  }
  if (ts.length >= 11) {
    return {
      direction: ts[1] || null,
      period: ts[8] || null,
      height: ts[9] || null,
      hmax: ts[10] || null,
      waterTemp: ts[5] || null
    };
  }
  return null;
}

function getParisOffsetMs(_ts: number) {
  // Winds-Up stores local Paris time as if it were UTC. We need to subtract the Paris offset.
  // March last Sunday = DST switch. Before: CET = UTC+1. After: CEST = UTC+2.
  // Simple approach: check the month/day to determine CET vs CEST.
  const d = new Date(_ts);
  const month = d.getUTCMonth(); // 0-indexed
  const day = d.getUTCDate();
  // CEST (UTC+2): last Sunday of March → last Sunday of October
  // Approximate: April-September = CEST, November-February = CET, March/October = check day
  if (month >= 3 && month <= 8) return 7200000; // Apr-Sep: CEST (+2h)
  if (month <= 1 || month >= 10) return 3600000; // Nov-Feb: CET (+1h)
  if (month === 2) { // March: CET until last Sunday
    const lastSunday = 31 - ((5 + new Date(d.getUTCFullYear(), 2, 31).getDay()) % 7);
    return day >= lastSunday ? 7200000 : 3600000;
  }
  // October: CEST until last Sunday
  const lastSundayOct = 31 - ((5 + new Date(d.getUTCFullYear(), 9, 31).getDay()) % 7);
  return day >= lastSundayOct ? 3600000 : 7200000;
}

async function fetchWindsUp(sid: string) {
  if (!WINDSUP_USER || !WINDSUP_PASS) return null;
  try {
    const authRes = await fetch("https://www.winds-up.com/index.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `login_pseudo=${encodeURIComponent(WINDSUP_USER)}&login_passwd=${encodeURIComponent(WINDSUP_PASS)}&action=post_login`,
      redirect: "manual"
    });
    
    const cookieHeader = authRes.headers.get("set-cookie") || "";
    const sidMatch = cookieHeader.match(/PHPSESSID=([^;]+)/);
    if (!sidMatch) { console.error("WindsUp: No PHPSESSID"); return null; }
    
    const c = `PHPSESSID=${sidMatch[1]}`;
    const baseUrl = `https://www.winds-up.com/spot-${sid}-observations-releves-vent.html`;

    // Fetch today + yesterday for 48h coverage
    const yesterday = new Date(Date.now() - 24 * 3600000);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
    
    const [rToday, rYesterday] = await Promise.all([
      fetch(baseUrl, { headers: { "Cookie": c } }),
      fetch(`${baseUrl}?date=${yStr}`, { headers: { "Cookie": c } })
    ]);
    
    const htmlToday = await rToday.text();
    const htmlYesterday = await rYesterday.text();

    // Cardinal direction → degree mapping (used for `o` field from Highcharts)
    const degMap: Record<string, number> = {
      "N": 0, "NNE": 22, "NE": 45, "ENE": 67, "E": 90, "ESE": 112, "SE": 135, "SSE": 157, 
      "S": 180, "SSO": 202, "SO": 225, "OSO": 247, "O": 270, "ONO": 292, "NO": 315, "NNO": 337
    };

    function parseWindsUpPage(html: string) {
      // Step 1: Parse the HTML table for precise degrees (only works for today's page)
      const tableDegMap = new Map<string, number>();
      const tableRowRegex = /- (\d{2}:\d{2})<\/td>\s*<td[^>]*>.*?(\d{1,3})\u00b0/g;
      let tableMatch;
      while ((tableMatch = tableRowRegex.exec(html)) !== null) {
        const timeKey = tableMatch[1];
        const deg = parseInt(tableMatch[2]);
        if (!tableDegMap.has(timeKey)) {
          tableDegMap.set(timeKey, deg);
        }
      }

      // Step 2: Parse Highcharts data — now also extract o:"..." for cardinal direction
      const chartRegex = /\{x:(\d{13}),\s*y:([\d.]+)[^}]*o:"([^"]*)"[^}]*min:"([\d.]*)"[^}]*max:"([\d.]*)"[^}]*\}/g;
      const points: Array<{time: number, avgSpeed: number, maxGust: number, temperature: null, windDirection: number|null}> = [];
      let match;
      while ((match = chartRegex.exec(html)) !== null) {
        if (match[0].includes('abo:"no"')) continue;
        
        const fakeTs = parseInt(match[1]);
        const tzOffset = getParisOffsetMs(fakeTs);
        const realTs = fakeTs - tzOffset;
        
        const avg = parseFloat(match[2]);
        const oField = match[3]; // cardinal direction from authenticated data e.g. "N", "NO", "NNO"
        const min = parseFloat(match[4]);
        const max = match[5] ? parseFloat(match[5]) : avg;

        // Build HH:MM key for table lookup
        const localDate = new Date(fakeTs);
        const hh = String(localDate.getUTCHours()).padStart(2, '0');
        const mm = String(localDate.getUTCMinutes()).padStart(2, '0');
        const minuteKey = `${hh}:${mm}`;
        
        // Priority: table precise degree > o field cardinal > null
        let dir: number | null = null;
        const tableDeg = tableDegMap.get(minuteKey);
        if (tableDeg !== undefined) {
          dir = tableDeg; // Precise degree from table (e.g. 337)
        } else if (oField && degMap[oField] !== undefined) {
          dir = degMap[oField]; // Cardinal from chart (e.g. "NNO" → 337)
        }
        
        points.push({
          time: realTs,
          avgSpeed: Number(avg.toFixed(1)),
          maxGust: Number(max.toFixed(1)),
          temperature: null,
          windDirection: dir
        });
      }
      return points;
    }

    const yesterdayPoints = parseWindsUpPage(htmlYesterday);
    const todayPoints = parseWindsUpPage(htmlToday);
    
    // Merge: yesterday first, then today. Deduplicate by timestamp.
    const seen = new Set<number>();
    const history = [];
    for (const p of [...yesterdayPoints, ...todayPoints]) {
      if (!seen.has(p.time)) {
        seen.add(p.time);
        history.push(p);
      }
    }
    history.sort((a, b) => a.time - b.time);
    
    if (history.length === 0) return null;
    const live = history[history.length - 1];
    
    return {
      live: {
        windSpeed: live.avgSpeed,
        windGust: live.maxGust,
        windDirection: live.windDirection,
        temperature: null,
        humidity: null,
        pressure: null
      },
      history: history
    };
  } catch (e) {
    console.error("WindsUp err:", e);
    return null;
  }
}

async function fetchInfo() {
  if (!INFOCLIMAT_TOKEN) return null;
  const sid = 'STATIC0317';
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 3600000);
    const fStart = start.toISOString().split('T')[0];
    const fEnd = end.toISOString().split('T')[0];
    const url = `https://www.infoclimat.fr/opendata/?version=2&method=get&format=json&stations[]=${sid}&start=${fStart}&end=${fEnd}&token=${INFOCLIMAT_TOKEN}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = await r.json();
    const hourly = json.hourly?.[sid] || [];
    if (hourly.length === 0) return null;

    const historyRev = [...hourly].reverse();
    const latest = historyRev.find((h: any) => h.vent_moyen !== null) || historyRev[0];

    const history = hourly.map((h: any) => {
      const speedKmh = parseFloat(h.vent_moyen || 0);
      const gustKmh = parseFloat(h.vent_rafales_10min || h.vent_rafales || 0);
      return {
        time: h.dh_utc.replace(' ', 'T') + 'Z',
        avgSpeed: Number((speedKmh / 1.852).toFixed(1)),
        maxGust: Number((gustKmh / 1.852).toFixed(1)),
        temperature: h.temperature ? Number(h.temperature) : null,
        windDirection: h.vent_direction ? parseInt(h.vent_direction, 10) : null
      };
    }).filter((item: any) => item.time);

    const liveSpeedKmh = parseFloat(latest.vent_moyen || 0);
    const liveGustKmh = parseFloat(latest.vent_rafales_10min || latest.vent_rafales || 0);

    return {
      live: {
        windSpeed: (liveSpeedKmh / 1.852).toFixed(1),
        windGust: (liveGustKmh / 1.852).toFixed(1),
        windDirection: latest.vent_direction ? parseInt(latest.vent_direction, 10) : null,
        temperature: latest.temperature ? Number(latest.temperature) : null
      },
      history: history
    };
  } catch (e) {
    console.error("InfoClimat err:", e);
    return null;
  }
}

type F = () => Promise<unknown>;

const SF: Record<string, F> = {
  meteofrance_20004002: () => fetchMF("20004002"),
  meteofrance_20004003: () => fetchMF("20004003"),
  pioupiou_1202: () => fetchPP("1202"),
  candhis_revellata: () => fetchCD("Y2FtcD0wMkIwNA=="),
  candhis_bonifacio: () => fetchCD("Y2FtcD0wMkEwMQ=="),
  esurfmar_ajaccio: () => fetchES(),
  windsup_porticcio: () => fetchWindsUp("porticcio--windsurf-kitesurf-1726"),
  infoclimat_000V0: () => fetchInfo()
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
        "Access-Control-Allow-Methods": "POST,GET,OPTIONS"
      }
    });
  }

  try {
    let rs = Object.keys(SF);
    if (req.method === "POST") {
      const b = await req.json();
      if (b.sources && Array.isArray(b.sources)) {
        rs = b.sources.filter((s: string) => s in SF);
      }
    }

    const now = Date.now();
    const res: Record<string, unknown> = {};
    const { data: c } = await supabase.from("weather_cache").select("source,data,fetched_at").in("source", rs);
    const cm = new Map<string, { data: unknown; fetched_at: string }>();
    if (c) {
      for (const r of c) {
        cm.set(r.source, r);
      }
    }

    await Promise.all(rs.map(async (s) => {
      const e = cm.get(s);
      if (e) {
        const a = now - new Date(e.fetched_at).getTime();
        if (a < CACHE_TTL_MS) {
          res[s] = e.data;
          return;
        }
      }
      
      const f = SF[s];
      if (!f) return;
      
      try {
        const d = await f();
        if (d !== null) {
          await supabase.from("weather_cache").upsert({ source: s, data: d, fetched_at: new Date().toISOString() });
          res[s] = d;
        } else {
          res[s] = e?.data ?? null;
        }
      } catch (err) {
        console.error(`Err ${s}:`, err);
        res[s] = e?.data ?? null;
      }
    }));

    return new Response(JSON.stringify({ data: res, ts: new Date().toISOString() }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public,max-age=30"
      }
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "err" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
});
