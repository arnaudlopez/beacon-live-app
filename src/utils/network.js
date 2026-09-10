export function withTimeout(promise, milliseconds = 12_000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

export async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  try {
    return await withTimeout((async () => {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    })());
  } finally { controller.abort(); }
}
