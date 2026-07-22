import { registerSW } from 'virtual:pwa-register'

const UPDATE_INTERVAL_MS = 60 * 60 * 1000

registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (!registration) return

    setInterval(async () => {
      if (registration.installing || !navigator.onLine) return

      try {
        const response = await fetch(swUrl, {
          cache: 'no-store',
          headers: {
            'cache': 'no-store',
            'cache-control': 'no-cache',
          },
        })

        if (response.ok) await registration.update()
      } catch {
        // A failed update check must never prevent the offline PWA from working.
      }
    }, UPDATE_INTERVAL_MS)
  },
})
