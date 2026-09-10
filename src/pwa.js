import { registerSW } from 'virtual:pwa-register'

const UPDATE_INTERVAL_MS = 60 * 60 * 1000

registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (!registration) return
    let checking = false
    let lastCheck = 0
    async function checkUpdate() {
      if (checking || registration.installing || !navigator.onLine || document.visibilityState === 'hidden') return
      if (Date.now() - lastCheck < 60_000) return
      checking = true
      lastCheck = Date.now()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 12_000)
      try {
        const response = await fetch(swUrl, { cache: 'no-store', signal: controller.signal })
        if (response.ok) await registration.update()
      } catch {
        // An update check must never prevent the offline PWA from working.
      } finally {
        clearTimeout(timeout)
        checking = false
      }
    }
    setInterval(checkUpdate, UPDATE_INTERVAL_MS)
    window.addEventListener('online', checkUpdate)
    document.addEventListener('visibilitychange', checkUpdate)
  },
})
