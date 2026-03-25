import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const METEOFRANCE_KEY = Deno.env.get("METEOFRANCE_KEY")!;
const WINDSUP_USER = Deno.env.get("WINDSUP_USER")||"";
const WINDSUP_PASS = Deno.env.get("WINDSUP_PASS")||"";

const CACHE_TTL_MS = 6 * 60 * 1000;
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
  const hr = await fetch(`https://api.pioupiou.fr/v1/archive/${sid}`);
  if (hr.ok) {
    const hj = await hr.json();
    h = (hj.data || []).map((i: number[]) => ({
      time: i[0],
      avgSpeed: i[4] !== null ? Number((i[4] / 1.852).toFixed(1)) : 0,
      maxGust: i[5] !== null ? Number((i[5] / 1.852).toFixed(1)) : 0
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

async function fetchWindsUp(sid: string) {
  if (!WINDSUP_USER || !WINDSUP_PASS) return null;
  try {
    const authRes = await fetch("https://www.winds-up.com/index.php?p=login&formu=1", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `login=${encodeURIComponent(WINDSUP_USER)}&password=${encodeURIComponent(WINDSUP_PASS)}&form_sent=1`,
      redirect: "manual"
    });
    
    const cookieHeader = authRes.headers.get("set-cookie") || "";
    const sidMatch = cookieHeader.match(/PHPSESSID=([^;]+)/);
    if (!sidMatch) { console.error("WindsUp: No PHPSESSID"); return null; }
    
    const c = `PHPSESSID=${sidMatch[1]}`;
    const r = await fetch(`https://www.winds-up.com/spot-${sid}-observations-releves-vent.html`, {
      headers: { "Cookie": c }
    });
    
    const html = await r.text();
    const regex = /\{x:(\d{13}),\s*y:([\d.]+)[^}]*o:"([^"]*)"[^}]*min:"([\d.]*)"[^}]*max:"([\d.]*)"[^}]*\}/g;
    
    const degMap: Record<string, number> = {
      "N": 0, "NNE": 22, "NE": 45, "ENE": 67, "E": 90, "ESE": 112, "SE": 135, "SSE": 157, 
      "S": 180, "SSO": 202, "SO": 225, "OSO": 247, "O": 270, "ONO": 292, "NO": 315, "NNO": 337
    };
    
    const history = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      if (match[0].includes('abo:"no"')) continue;
      
      const ts = parseInt(match[1]);
      const avg = parseFloat(match[2]);
      const o = match[3];
      const min = parseFloat(match[4]);
      const max = match[5] ? parseFloat(match[5]) : avg;
      const dir = degMap[o] !== undefined ? degMap[o] : null;
      
      history.push({
        time: ts,
        avgSpeed: avg,
        maxGust: max,
        temperature: null,
        windDirection: dir
      });
    }
    
    if (history.length === 0) return null;
    const live = history[history.length - 1];
    
    return {
      live: {
        windSpeed: live.avgSpeed.toFixed(1),
        windGust: live.maxGust.toFixed(1),
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

type F = () => Promise<unknown>;

const SF: Record<string, F> = {
  meteofrance_20004002: () => fetchMF("20004002"),
  meteofrance_20004003: () => fetchMF("20004003"),
  pioupiou_1202: () => fetchPP("1202"),
  candhis_revellata: () => fetchCD("Y2FtcD0wMkIwNA=="),
  candhis_bonifacio: () => fetchCD("Y2FtcD0wMkEwMQ=="),
  esurfmar_ajaccio: () => fetchES(),
  windsup_porticcio: () => fetchWindsUp("porticcio--windsurf-kitesurf-1726")
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
