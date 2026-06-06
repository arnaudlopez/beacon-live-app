import { describe, expect, it, vi } from 'vitest';
import {
  createRealWeatherSources,
  parseCandhisHtml,
  parseESurfmarHtml,
  parseMeteoFranceObservations,
  parsePioupiouPayload,
  parseWindsUpMobileHtml,
  parseWundergroundPayload,
} from './realSources.js';

function makeClock(start = '2026-05-25T08:00:00.000Z') {
  return {
    now: () => new Date(start).getTime(),
  };
}

describe('real weather source adapters', () => {
  it('builds the Portainer-ready real source list with credential-gated providers', () => {
    const sources = createRealWeatherSources({
      clock: makeClock(),
      env: {
        METEOFRANCE_KEY: 'mf-key',
        WINDSUP_USER: 'porticcio-user',
        WINDSUP_PASS: 'porticcio-pass',
      },
      fetchImpl: vi.fn(),
      pollMs: 20_000,
    });

    expect(sources.map((source) => source.id)).toEqual(expect.arrayContaining([
      'meteofrance_20004002',
      'meteofrance_20004003',
      'pioupiou_1202',
      'candhis_revellata',
      'candhis_bonifacio',
      'candhis_alistro',
      'esurfmar_ajaccio',
      'esurfmar_calvi',
      'windsup_porticcio',
      'windsup_tonnara',
      'windsup_porto_polo',
      'windsup_piantarella',
      'windsup_santa_manza',
      'windsup_balistra',
      'wunderground_IGROSS105',
      'wunderground_ISARROLA7',
      'wunderground_ICORSEPR2',
      'wunderground_ISARTN1',
      'wunderground_IBONIF6',
    ]));
    expect(sources.find((source) => source.id === 'wunderground_ICORSEPR2').pollMs)
      .toBeGreaterThan(sources.find((source) => source.id === 'wunderground_IGROSS105').pollMs);
  });

  it('does not include credential-gated sources when their Portainer env vars are missing', () => {
    const sources = createRealWeatherSources({
      clock: makeClock(),
      env: {},
      fetchImpl: vi.fn(),
      pollMs: 20_000,
    });
    const ids = sources.map((source) => source.id);

    expect(ids).not.toContain('meteofrance_20004002');
    expect(ids).not.toContain('meteofrance_20004003');
    expect(ids).not.toContain('windsup_porticcio');
    expect(ids).not.toContain('windsup_tonnara');
    expect(ids).not.toContain('windsup_porto_polo');
    expect(ids).not.toContain('windsup_piantarella');
    expect(ids).not.toContain('windsup_santa_manza');
    expect(ids).not.toContain('windsup_balistra');
    expect(ids).toEqual(expect.arrayContaining([
      'pioupiou_1202',
      'candhis_revellata',
      'candhis_alistro',
      'esurfmar_ajaccio',
      'wunderground_IGROSS105',
    ]));
  });

  it('parses representative upstream payloads into the existing dashboard data shape', () => {
    const meteoFrance = parseMeteoFranceObservations([
      {
        validity_time: '2026-05-25T08:00:00Z',
        ff: 5,
        fxi10: 8,
        dd: 270,
        t: 293.15,
        u: 64,
        pmer: 101300,
      },
    ]);
    expect(meteoFrance.live).toMatchObject({
      windSpeed: '9.7',
      windGust: '15.6',
      windDirection: 270,
      temperature: '20.0',
    });

    const pioupiou = parsePioupiouPayload(
      {
        data: {
          measurements: {
            wind_speed_avg: 18.52,
            wind_speed_max: 27.78,
            wind_heading: 245,
          },
        },
      },
      {
        data: [['2026-05-25T08:00:00Z', null, null, null, 18.52, 27.78, 245]],
      },
    );
    expect(pioupiou.live).toMatchObject({
      windSpeed: '10.0',
      windGust: '15.0',
      windDirection: 245,
    });

    const wunderground = parseWundergroundPayload(
      {
        observations: [{
          obsTimeUtc: '2026-05-25T08:00:00Z',
          winddir: 280,
          humidity: 60,
          metric: {
            windSpeed: 18.52,
            windGust: 27.78,
            temp: 22.4,
            pressure: 1012,
          },
        }],
      },
      {
        observations: [{
          obsTimeUtc: '2026-05-25T08:00:00Z',
          winddirAvg: 280,
          metric: {
            windspeedAvg: 18.52,
            windgustHigh: 27.78,
            tempAvg: 22.4,
          },
        }],
      },
    );
    expect(wunderground.live).toMatchObject({
      windSpeed: 10,
      windGust: 15,
      windDirection: 280,
    });

    const esurfmar = parseESurfmarHtml(`
      <tr bgcolor=#FFFFFF>
        <td class="data">25 mai 08TU</td><td class="data">270</td><td class="data">12</td><td class="data">18</td>
        <td class="data">21</td><td class="data">19</td><td class="data">60</td><td class="data">1011</td>
        <td class="data">8</td><td class="data">1.2</td><td class="data">1.8</td>
      </tr>
    `);
    expect(esurfmar.live.windSpeed).toBe(12);
    expect(esurfmar.surf.height).toBe(1.2);

    const candhis = parseCandhisHtml(`
      <script>
        arrDataPHP[0] = eval('[["2026-05-25 08:00:00",1.1,null,1.7]]');
        arrDataPHP[1] = eval('[["2026-05-25 08:00:00",8]]');
        arrDataPHP[2] = eval('[["2026-05-25 08:00:00",260]]');
        arrDataPHP[3] = eval('[["2026-05-25 08:00:00",35]]');
        arrDataPHP[4] = eval('[["2026-05-25 08:00:00",19.4]]');
      </script>
    `);
    expect(candhis.surf).toMatchObject({
      height: 1.1,
      hmax: 1.7,
      period: 8,
      direction: 260,
      spread: 35,
    });
    expect(candhis.waterTemp).toBe(19.4);

    const windsup = parseWindsUpMobileHtml(`
      <div class="spotObsLine"><span>10:00</span><div class="deg">275</div></div>
      {x:1779696000000,y:11,o:"O",color:"#fff",img:""}
      {x:1779696000000,low:8,high:17}
    `);
    expect(windsup.live).toMatchObject({
      windSpeed: 11,
      windGust: 17,
      windDirection: 275,
    });
  });

  it('authenticates WindsUp through the current premium session flow', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('', {
        status: 302,
        headers: { 'set-cookie': 'PHPSESSID=initial; Path=/' },
      }))
      .mockResolvedValueOnce(new Response('', {
        status: 302,
        headers: { 'set-cookie': 'codeCnx=code; Path=/, autolog=auto; Path=/' },
      }))
      .mockResolvedValueOnce(new Response(`
        <div class="spotObsLine"><span>10:00</span><div class="deg">275</div></div>
        {x:1779696000000,y:11,o:"O",color:"#fff",img:""}
        {x:1779696000000,low:8,high:17}
      `));

    const source = createRealWeatherSources({
      clock: makeClock(),
      env: {
        WINDSUP_USER: 'porticcio-user',
        WINDSUP_PASS: 'porticcio-pass',
      },
      fetchImpl,
      pollMs: 20_000,
    }).find((item) => item.id === 'windsup_porticcio');

    await expect(source.fetch()).resolves.toMatchObject({
      source: 'windsup_porticcio',
      payload: {
        live: {
          windSpeed: 11,
          windGust: 17,
          windDirection: 275,
        },
      },
    });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://www.winds-up.com/connexion');
    expect(fetchImpl.mock.calls[1][0]).toBe('https://www.winds-up.com/v2/');
    expect(fetchImpl.mock.calls[2][0]).toBe('https://www.winds-up.com/spot/1726');
  });
});
