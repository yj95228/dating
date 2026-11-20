import { registerSW } from 'virtual:pwa-register'

// Explicit registration is needed for open PWA windows to notice a new release.
// Use a prompt: forcing a reload can destroy an unfinished profile edit.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    document.documentElement.dataset.appUpdateAvailable = 'true'
    window.dispatchEvent(new Event('dating-app-update'))
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => {
      if (document.visibilityState === 'visible') {
        void registration.update().catch(() => { /* May be offline */ })
      }
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    window.setInterval(check, 10 * 60 * 1000)
    check()
  },
})

export const activatePwaUpdate = () => updateSW(true)
