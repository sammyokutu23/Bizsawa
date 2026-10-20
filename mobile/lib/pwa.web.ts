// Installable, offline web/desktop build (imported once from app/_layout.tsx).
import { setWasmUrl } from '@lottiefiles/dotlottie-react'

// Unsynced sales live only in IndexedDB until the next push. Ask the browser
// to exempt it from eviction under storage pressure (granted automatically
// for installed PWAs in Chromium; a no-op where unsupported).
navigator.storage?.persist?.().catch(() => {})

// Production only: `npm run build:web` copies the Lottie WASM next to the
// bundle and precaches it in sw.js. In dev the runtime still loads it from
// the jsdelivr CDN, which is fine while online.
if (!__DEV__) {
  setWasmUrl('/dotlottie-player.wasm')

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // No skipWaiting: a new version activates once every app window is
      // closed, so a running session never loses its lazily loaded chunks.
      navigator.serviceWorker
        .register('/sw.js')
        .catch((e) =>
          console.warn('[PWA] service worker registration failed', e),
        )
    })
  }
}
