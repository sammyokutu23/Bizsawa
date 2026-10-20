// Service worker for the web/desktop build (`npm run build:web`).
// Precaches the whole Expo web export so the app shell starts offline; app
// data is offline via WatermelonDB/IndexedDB, so API calls are never cached.
module.exports = {
  globDirectory: 'dist/',
  globPatterns: [
    '**/*.{html,js,css,json,png,jpg,svg,ico,ttf,otf,woff,woff2,wasm,lottie}',
  ],
  // Workbox ignores **/node_modules/** by default, but Expo exports fonts and
  // router images under dist/assets/node_modules/ — offline would lose them.
  globIgnores: ['sw.js', 'workbox-*.js'],
  // The JS entry bundle is ~6 MB; Workbox's 2 MB default would skip it.
  maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
  swDest: 'dist/sw.js',
  // Expo Router is a single-page app: every deep link boots from index.html.
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/api\//],
  cleanupOutdatedCaches: true,
  sourcemap: false,
}
