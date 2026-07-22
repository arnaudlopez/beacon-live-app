import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const nginx = readFileSync(resolve('nginx.conf'), 'utf8');
const viteConfig = readFileSync(resolve('vite.config.js'), 'utf8');
const main = readFileSync(resolve('src/main.jsx'), 'utf8');

describe('PWA update configuration', () => {
  it('never serves service-worker entry points as immutable assets', () => {
    expect(nginx).toContain('location = /sw.js');
    expect(nginx).toContain('location = /push-sw.js');
    expect(nginx).toContain('location = /index.html');
    expect(nginx).toContain('no-cache, no-store, must-revalidate');
    expect(nginx).toContain('location ^~ /assets/');
  });

  it('registers the auto-update client from the application bundle', () => {
    expect(viteConfig).toContain("registerType: 'autoUpdate'");
    expect(viteConfig).toContain('injectRegister: null');
    expect(main).toContain("import './pwa'");
  });
});
