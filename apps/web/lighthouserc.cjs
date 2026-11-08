/**
 * Lighthouse CI (task 6.6, R-PWA-1). Builds nothing itself: run `pnpm --filter @vaultkeeper/web
 * build` first (or use `pnpm --filter @vaultkeeper/web lighthouse`, which does both).
 *
 * Lighthouse >= 12 removed the PWA category and its installability audits, so installability is
 * asserted by the Playwright `preview` project (e2e/specs/pwa.spec.ts: manifest fields, icons,
 * maskable icon, SW registered, offline shell). Here we gate the basics an installable app needs
 * that Lighthouse still measures: viewport, theme color, title, lang, HTTPS-ready best practices
 * and accessibility.
 *
 * Chrome: chrome-launcher finds a local Chrome; override with CHROME_PATH.
 * The API is not started, so the page renders the root error view inside the shell; that is
 * enough for these document-level audits.
 */
module.exports = {
  ci: {
    collect: {
      startServerCommand: "pnpm preview",
      startServerReadyPattern: "localhost:4173",
      url: ["http://localhost:4173/login"],
      numberOfRuns: 1,
      settings: {
        preset: "desktop",
        chromeFlags: "--headless=new --no-sandbox",
        onlyCategories: ["accessibility", "best-practices", "seo", "performance"],
      },
    },
    assert: {
      assertions: {
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:performance": ["warn", { minScore: 0.8 }],
        "viewport-insight": "error",
        "document-title": "error",
        "html-has-lang": "error",
        "meta-description": "warn",
      },
    },
    upload: { target: "filesystem", outputDir: "./.lighthouseci" },
  },
};
