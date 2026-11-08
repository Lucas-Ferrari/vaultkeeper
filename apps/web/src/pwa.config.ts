import type { VitePWAOptions } from "vite-plugin-pwa";

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;

/**
 * PWA setup (design 13, R-PWA-1/3/4). Kept apart from vite.config.ts so it can be unit-tested.
 * - registerType 'prompt': the UpdateToast asks before swapping versions (R-PWA-4).
 * - /api is NetworkOnly: no offline data or queued writes in the MVP (R-PWA-3).
 * - /media is CacheFirst: item images rarely change and are the heaviest requests.
 * Icons in public/icons are original art (no Webzen assets).
 */
export const pwaOptions = {
  registerType: "prompt",
  injectRegister: false,
  includeAssets: ["icons/favicon.svg"],
  manifest: {
    name: "Vaultkeeper",
    short_name: "Vaultkeeper",
    description: "Track your MU Online items across accounts, vaults and characters.",
    display: "standalone",
    start_url: "/",
    scope: "/",
    theme_color: "#0f172a",
    background_color: "#0f172a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
    navigateFallback: "/index.html",
    navigateFallbackDenylist: [/^\/api\//, /^\/media\//],
    // Workbox tests a RegExp against the full href, so path rules are functions. They are
    // serialized into the generated SW: keep them self-contained (no outer references).
    runtimeCaching: [
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
      },
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/media/"),
        handler: "CacheFirst",
        options: {
          cacheName: "vk-media",
          expiration: { maxAgeSeconds: THIRTY_DAYS_IN_SECONDS, maxEntries: 500 },
        },
      },
    ],
  },
} satisfies Partial<VitePWAOptions>;
