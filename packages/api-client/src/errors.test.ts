import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { describe, expect, it } from "vitest";
import { ApiError, unwrap } from "./errors";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const notFound: ApiErrorBody = {
  error: {
    code: ERROR_CODE.NOT_FOUND,
    message: "Stock entry not found",
    details: { id: "abc" },
    requestId: "req-1",
  },
};

describe("unwrap", () => {
  it("returns the parsed body on 2xx", async () => {
    await expect(unwrap(jsonResponse({ status: "ok" }, 200))).resolves.toEqual({ status: "ok" });
  });

  it("accepts a pending response (the hc call itself)", async () => {
    await expect(unwrap(Promise.resolve(jsonResponse({ id: 1 }, 201)))).resolves.toEqual({ id: 1 });
  });

  it("returns undefined for 204 without reading a body", async () => {
    await expect(unwrap(new Response(null, { status: 204 }))).resolves.toBeUndefined();
  });

  it("throws ApiError carrying code, status, message, details and requestId from the envelope", async () => {
    const error = await unwrap(jsonResponse(notFound, 404)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      name: "ApiError",
      code: ERROR_CODE.NOT_FOUND,
      status: 404,
      message: "Stock entry not found",
      details: { id: "abc" },
      requestId: "req-1",
    });
  });

  it("throws ApiError INTERNAL when an error response is not an envelope", async () => {
    const error = await unwrap(new Response("<html>bad gateway</html>", { status: 502 })).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: ERROR_CODE.INTERNAL, status: 502 });
  });

  it("does not trust an unknown error code", async () => {
    const body = { error: { code: "TEAPOT", message: "nope", requestId: "r" } };
    const error = await unwrap(jsonResponse(body, 418)).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: ERROR_CODE.INTERNAL, status: 418 });
  });
});
