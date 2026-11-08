import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("createApp", () => {
  it("GET /healthz responds 200 with status ok", async () => {
    const res = await createApp().request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("unknown routes respond 404", async () => {
    const res = await createApp().request("/nope");
    expect(res.status).toBe(404);
  });
});
