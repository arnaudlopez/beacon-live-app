import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

async function readProjectFile(path) {
  return readFile(resolve(path), 'utf8');
}

describe('realtime Docker deployment config', () => {
  it('builds a dedicated weather-api image target and injects the frontend backend URL', async () => {
    const dockerfile = await readProjectFile('Dockerfile');

    expect(dockerfile).toContain('AS weather-api');
    expect(dockerfile).toContain('CMD ["node", "server/realtime/server.js"]');
    expect(dockerfile).toContain('ARG VITE_WEATHER_BACKEND_URL');
    expect(dockerfile).toContain('ENV VITE_WEATHER_BACKEND_URL=$VITE_WEATHER_BACKEND_URL');
  });

  it('runs frontend and weather-api services with persistent weather data', async () => {
    const compose = await readProjectFile('docker-compose.yml');

    expect(compose).toContain('weather-api:');
    expect(compose).toContain('target: weather-api');
    expect(compose).toContain('WEATHER_STORE_PATH=/data/weather-state.json');
    expect(compose).toContain('weather-data:');
    expect(compose).toContain('VITE_WEATHER_BACKEND_URL=${VITE_WEATHER_BACKEND_URL:-/api}');
  });

  it('proxies /api requests and SSE streams from Nginx to the weather service', async () => {
    const nginx = await readProjectFile('nginx.conf');

    expect(nginx).toContain('location /api/');
    expect(nginx).toContain('proxy_pass http://weather-api:8787/api/');
    expect(nginx).toContain('proxy_buffering off;');
    expect(nginx).toContain("connect-src 'self'");
  });

  it('documents the local realtime backend deployment path', async () => {
    const docs = await readProjectFile('DEPLOY_DOCKER.md');

    expect(docs).toContain('weather-api');
    expect(docs).toContain('VITE_WEATHER_BACKEND_URL=/api');
    expect(docs).toContain('/api/health');
    expect(docs).toContain('WEATHER_POLL_MS');
  });
});
