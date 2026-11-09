import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { paginationQuery } from "@vaultkeeper/shared/schemas/pagination";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createErrorHandler } from "./on-error";
import { validate } from "./validator";

const createThing = z.object({ name: z.string().trim().min(1).max(10), qty: z.number().int() });

const app = new Hono()
  .post("/things", validate("json", createThing), (c) => c.json(c.req.valid("json"), 201))
  .get("/things", validate("query", paginationQuery), (c) => c.json(c.req.valid("query"), 200))
  .onError(createErrorHandler({ onUnexpected: () => {} }));

function postJson(body: unknown): Promise<Response> {
  return Promise.resolve(
    app.request("/things", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("validate(target, schema)", () => {
  it("passes parsed (transformed) data to the handler", async () => {
    const res = await postJson({ name: "  sword ", qty: 2 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ name: "sword", qty: 2 });
  });

  it("rejects invalid JSON bodies with 422 VALIDATION_FAILED and the issues", async () => {
    const res = await postJson({ name: "", qty: 1.5 });

    expect(res.status).toBe(422);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe(ERROR_CODE.VALIDATION_FAILED);
    expect(body.error.details).toEqual({
      target: "json",
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ["name"], message: expect.any(String) }),
        expect.objectContaining({ path: ["qty"], message: expect.any(String) }),
      ]),
    });
  });

  it("validates query strings the same way", async () => {
    const ok = await app.request("/things?limit=5");
    expect(await ok.json()).toEqual({ limit: 5, offset: 0 });

    const res = await app.request("/things?limit=500");
    expect(res.status).toBe(422);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.details).toMatchObject({
      target: "query",
      issues: [expect.objectContaining({ path: ["limit"] })],
    });
  });
});
