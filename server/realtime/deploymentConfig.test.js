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
    expect(compose).toContain('WEATHER_SOURCE_MODE=${WEATHER_SOURCE_MODE:-real}');
    expect(compose).toContain('METEOFRANCE_KEY=${METEOFRANCE_KEY:-}');
    expect(compose).toContain('WINDSUP_USER=${WINDSUP_USER:-}');
    expect(compose).toContain('WINDSUP_PASS=${WINDSUP_PASS:-}');
    expect(compose).toContain('WEATHER_MAX_OBSERVATIONS=${WEATHER_MAX_OBSERVATIONS:-500}');
    expect(compose).toContain('max-size: "10m"');
    expect(compose).toContain('max-file: "3"');
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
    expect(docs).toContain('WEATHER_SOURCE_MODE=real');
    expect(docs).toContain('METEOFRANCE_KEY');
    expect(docs).toContain('WINDSUP_USER');
    expect(docs).toContain('WINDSUP_PASS');
    expect(docs).toContain('/api/health');
    expect(docs).toContain('WEATHER_POLL_MS');
    expect(docs).toContain('WEATHER_MAX_OBSERVATIONS=500');
    expect(docs).toContain('docker system prune -af');
  });

  it('shows Portainer variables in the env example without leaking them to Vite', async () => {
    const envExample = await readProjectFile('.env.example');

    expect(envExample).toContain('WEATHER_SOURCE_MODE=real');
    expect(envExample).toContain('WEATHER_MAX_OBSERVATIONS=500');
    expect(envExample).toContain('METEOFRANCE_KEY=');
    expect(envExample).toContain('WINDSUP_USER=');
    expect(envExample).toContain('WINDSUP_PASS=');
    expect(envExample).not.toContain('VITE_METEOFRANCE_KEY');
    expect(envExample).not.toContain('VITE_WINDSUP_PASS');
  });
});
