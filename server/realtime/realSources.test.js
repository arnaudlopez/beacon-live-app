import { describe, expect, it, vi } from 'vitest';
import {
  createRealWeatherSources,
  parseCandhisHtml,
  parseESurfmarHtml,
  parseMeteoFranceBuoyObservations,
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
      'meteofrance_20114002',
      'meteofrance_20093002',
      'meteofrance_20107001',
      'meteofrance_20342001',
      'meteofrance_20041001',
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
      'windsup_figari_eole',
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
    expect(ids).not.toContain('meteofrance_20114002');
    expect(ids).not.toContain('meteofrance_20093002');
    expect(ids).not.toContain('meteofrance_20107001');
    expect(ids).not.toContain('meteofrance_20342001');
    expect(ids).not.toContain('meteofrance_20041001');
    expect(ids).not.toContain('windsup_porticcio');
    expect(ids).not.toContain('windsup_tonnara');
    expect(ids).not.toContain('windsup_porto_polo');
    expect(ids).not.toContain('windsup_piantarella');
    expect(ids).not.toContain('windsup_santa_manza');
    expect(ids).not.toContain('windsup_balistra');
    expect(ids).not.toContain('windsup_figari_eole');
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

    const meteoFranceV2 = parseMeteoFranceObservations([
      {
        validity_time: '2026-06-17T12:06:00Z',
        ff: 4.7,
        raf10: 5.8,
        ddraf10: 220,
        dd: 220,
        t: 300.85,
        u: 65,
        pmer: 102050,
      },
    ]);
    expect(meteoFranceV2.live).toMatchObject({
      windSpeed: '9.1',
      windGust: '11.3',
      windDirection: 220,
      temperature: '27.7',
    });

    const meteoFranceMissingGust = parseMeteoFranceObservations([
      {
        validity_time: '2026-06-17T12:06:00Z',
        ff: 4.7,
        dd: 220,
      },
    ]);
    expect(meteoFranceMissingGust.live.windGust).toBeNull();
    expect(meteoFranceMissingGust.history[0].maxGust).toBeNull();

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

    const meteoFranceBuoy = parseMeteoFranceBuoyObservations([
      {
        validity_time: '2026-06-17T10:00:00Z',
        ff: 2.1,
        dd: 20,
        rafper: 3.3,
        haut_vag: 0.2,
        dir_vag: 36,
        per_moy_vag: 4,
        tmer: 295.75,
      },
      {
        validity_time: '2026-06-17T11:00:00Z',
        ff: 2.4,
        dd: 30,
        rafper: 3.8,
        haut_vag: 0.3,
        dir_vag: 45,
        per_moy_vag: 5,
        tmer: 296.15,
      },
    ]);
    expect(meteoFranceBuoy).toMatchObject({
      height: 0.3,
      period: 5,
      direction: 45,
      waterTemp: 23,
      live: {
        windDirection: 30,
      },
    });
    expect(meteoFranceBuoy.surfHistory).toHaveLength(2);
    expect(meteoFranceBuoy.surfHistory[1]).toMatchObject({
      height: 0.3,
      direction: 45,
    });

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

  it('fetches Meteo-France observations from v2 before falling back to v1', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        validity_time: '2026-06-17T12:06:00Z',
        ff: 4.7,
        raf10: 5.8,
        dd: 220,
      },
    ])));

    const source = createRealWeatherSources({
      clock: makeClock(),
      env: {
        METEOFRANCE_KEY: 'mf-key',
      },
      fetchImpl,
      pollMs: 20_000,
    }).find((item) => item.id === 'meteofrance_20004002');

    await expect(source.fetch()).resolves.toMatchObject({
      source: 'meteofrance_20004002',
      payload: {
        live: {
          windGust: '11.3',
        },
      },
    });
    expect(fetchImpl.mock.calls[0][0]).toContain('/DPPaquetObs/v2/paquet/infrahoraire-6m');
  });

  it('falls back to Meteo-France v1 when v2 is not authorized', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: '900908' }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        {
          validity_time: '2026-05-25T08:00:00Z',
          ff: 5,
          fxi10: 8,
          dd: 270,
        },
      ])));

    const source = createRealWeatherSources({
      clock: makeClock(),
      env: {
        METEOFRANCE_KEY: 'legacy-key',
      },
      fetchImpl,
      pollMs: 20_000,
    }).find((item) => item.id === 'meteofrance_20004002');

    await expect(source.fetch()).resolves.toMatchObject({
      payload: {
        live: {
          windGust: '15.6',
        },
      },
    });
    expect(fetchImpl.mock.calls[0][0]).toContain('/DPPaquetObs/v2/');
    expect(fetchImpl.mock.calls[1][0]).toContain('/DPPaquetObs/v1/');
  });

  it('uses Meteo-France buoy v2 for Ajaccio surf direction when available', async () => {
    const fetchImpl = vi.fn().mockImplementation((url) => {
      if (url.includes('/DPObs/v2/bouees')) {
        return Promise.resolve(new Response(JSON.stringify([
          {
            validity_time: '2026-06-17T11:00:00Z',
            ff: 2.4,
            dd: 30,
            rafper: 3.8,
            haut_vag: 0.3,
            dir_vag: 45,
            per_moy_vag: 5,
            tmer: 296.15,
          },
        ])));
      }
      return Promise.reject(new Error(`unexpected_url:${url}`));
    });

    const source = createRealWeatherSources({
      clock: makeClock('2026-06-17T12:30:00.000Z'),
      env: {
        METEOFRANCE_KEY: 'mf-key',
      },
      fetchImpl,
      pollMs: 20_000,
    }).find((item) => item.id === 'esurfmar_ajaccio');

    await expect(source.fetch()).resolves.toMatchObject({
      source: 'esurfmar_ajaccio',
      payload: {
        height: 0.3,
        direction: 45,
        surf: {
          direction: 45,
        },
      },
    });
    expect(fetchImpl.mock.calls[0][0]).toContain('/DPObs/v2/bouees');
    expect(fetchImpl.mock.calls[0][0]).toContain('id_bouees=6101031');
  });

  it('maps WindsUp directions from per-row degrees and ignores cardinal labels', () => {
    const windsup = parseWindsUpMobileHtml(`
      <div class="spotObsLine">
        <span>11:51</span><span>17</span><span>17</span><span>18</span><span>O</span><div class="deg">250</div>
      </div>
      <div class="spotObsLine">
        <span>11:53</span><span>14</span><span>16</span><span>17</span><span>O</span><div class="deg">261</div>
      </div>
      {x:1780739460000,y:17,o:"O",color:"#fff",img:""}
      {x:1780739580000,y:16,o:"O",color:"#fff",img:""}
      {x:1780739460000,low:17,high:18}
      {x:1780739580000,low:14,high:17}
    `);

    expect(windsup.history.map((item) => item.windDirection)).toEqual([250, 261]);
    expect(windsup.live).toMatchObject({
      windSpeed: 16,
      windGust: 17,
      windDirection: 261,
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

  it('turns an empty Wunderground response into a normal source rejection', async () => {
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/observations/current')) {
        return Promise.resolve(new Response('', { status: 200 }));
      }
      if (url.includes('/observations/all/1day')) {
        return new Promise((resolve) => {
          setTimeout(() => resolve(new Response(JSON.stringify({ observations: [] }))), 10);
        });
      }
      return Promise.reject(new Error(`unexpected_url:${url}`));
    });
    const source = createRealWeatherSources({
      clock: makeClock(),
      fetchImpl,
      pollMs: 20_000,
    }).find((item) => item.id === 'wunderground_IGROSS105');

    await expect(source.fetch()).rejects.toThrow('upstream_invalid_json_empty_body');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('bounds an upstream request that never settles', async () => {
    const fetchImpl = vi.fn(() => new Promise(() => {}));
    const source = createRealWeatherSources({
      clock: makeClock(),
      fetchImpl,
      pollMs: 20_000,
      requestTimeoutMs: 10,
    }).find((item) => item.id === 'wunderground_IGROSS105');

    await expect(source.fetch()).rejects.toThrow('upstream_timeout_10ms');
  });

  it('keeps the request alive until a streamed response body is consumed', async () => {
    const streamedJson = (payload, signal) => new Response(new ReadableStream({
      start(stream) {
        const timer = setTimeout(() => {
          stream.enqueue(new TextEncoder().encode(JSON.stringify(payload)));
          stream.close();
        }, 10);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          stream.error(new DOMException('The operation was aborted.', 'AbortError'));
        }, { once: true });
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const fetchImpl = vi.fn((url, init) => {
      if (url.includes('/observations/current')) {
        return Promise.resolve(streamedJson({
          observations: [{
            obsTimeUtc: '2026-05-25T08:00:00Z',
            winddir: 280,
            metric: { windSpeed: 18.52, windGust: 27.78, temp: 22.4, pressure: 1012 },
          }],
        }, init.signal));
      }
      return Promise.resolve(streamedJson({ observations: [] }, init.signal));
    });
    const source = createRealWeatherSources({
      clock: makeClock(),
      fetchImpl,
      pollMs: 20_000,
      requestTimeoutMs: 100,
    }).find((item) => item.id === 'wunderground_IGROSS105');

    await expect(source.fetch()).resolves.toMatchObject({
      source: 'wunderground_IGROSS105',
      payload: { live: { windSpeed: 10, windGust: 15 } },
    });
  });
});
