import { describe, expect, it } from "vitest";
import { pwaOptions } from "./pwa.config";

type RuntimeEntry = NonNullable<
  NonNullable<(typeof pwaOptions)["workbox"]>["runtimeCaching"]
>[number];

const ORIGIN = "https://vaultkeeper.test";

/** Mirrors Workbox routing: a RegExp is tested against url.href, a function gets the context. */
function matches(entry: RuntimeEntry, pathname: string, origin = ORIGIN): boolean {
  const url = new URL(pathname, origin);
  const pattern = entry.urlPattern;
  if (pattern instanceof RegExp) return pattern.test(url.href);
  if (typeof pattern === "function") {
    const context = { url, sameOrigin: url.origin === ORIGIN, request: new Request(url) };
    return Boolean(pattern(context as Parameters<typeof pattern>[0]));
  }
  throw new Error("unsupported urlPattern");
}

describe("pwaOptions (R-PWA-1, design 13)", () => {
  it("prompts for updates instead of auto-reloading (R-PWA-4)", () => {
    expect(pwaOptions.registerType).toBe("prompt");
  });

  it("declares an installable manifest", () => {
    const { manifest } = pwaOptions;

    expect(manifest.name).toBe("Vaultkeeper");
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.theme_color).toMatch(/^#/);
    expect(manifest.background_color).toMatch(/^#/);

    const icons = manifest.icons ?? [];
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((icon) => icon.purpose?.includes("maskable"))).toBe(true);
  });

  it("never serves the SPA shell for /api or /media navigations", () => {
    const denylist = pwaOptions.workbox?.navigateFallbackDenylist ?? [];

    expect(pwaOptions.workbox?.navigateFallback).toBe("/index.html");
    expect(denylist.some((re) => re.test("/api/stock"))).toBe(true);
    expect(denylist.some((re) => re.test("/media/items/1.webp"))).toBe(true);
    expect(denylist.some((re) => re.test("/stock"))).toBe(false);
  });

  it("keeps /api network-only and caches /media for 30 days, 500 entries", () => {
    const runtime = pwaOptions.workbox?.runtimeCaching ?? [];
    const api = runtime.find((entry) => matches(entry, "/api/stock"));
    const media = runtime.find((entry) => matches(entry, "/media/items/1.webp"));

    expect(api?.handler).toBe("NetworkOnly");
    expect(media?.handler).toBe("CacheFirst");
    expect(media?.options?.expiration).toEqual({
      maxAgeSeconds: 30 * 24 * 60 * 60,
      maxEntries: 500,
    });
  });

  it("does not apply the /api and /media rules to other origins", () => {
    const runtime = pwaOptions.workbox?.runtimeCaching ?? [];

    expect(runtime.some((entry) => matches(entry, "/media/x.webp", "https://cdn.other.test"))).toBe(
      false,
    );
  });
});
