import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { describe, expect, it, vi } from "vitest";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "./errors";
import { createErrorHandler, notFoundHandler } from "./on-error";

/** A pg DatabaseError as node-postgres throws it, wrapped by Drizzle like a real query failure. */
function pgFailure(code: string, message: string): DrizzleQueryError {
  const pgError = Object.assign(new Error(message), {
    code,
    severity: "ERROR",
    constraint: "some_constraint",
  });
  return new DrizzleQueryError('insert into "secret_table" ("x") values ($1)', ["p"], pgError);
}

function appThrowing(error: unknown, onUnexpected = vi.fn()) {
  const app = new Hono()
    .use(requestId())
    .get("/boom", () => {
      throw error;
    })
    .onError(createErrorHandler({ onUnexpected }))
    .notFound(notFoundHandler);
  return { app, onUnexpected };
}

async function envelope(response: Response): Promise<ApiErrorBody> {
  return (await response.json()) as ApiErrorBody;
}

describe("onError envelope", () => {
  it("maps an AppError to its status and { error: { code, message, details, requestId } }", async () => {
    const { app } = appThrowing(
      new AppError({
        code: ERROR_CODE.STORAGE_NOT_EMPTY,
        status: 409,
        message: "Location has stock",
        details: { entries: 3 },
      }),
    );
    const res = await app.request("/boom");

    expect(res.status).toBe(409);
    const body = await envelope(res);
    expect(body).toEqual({
      error: {
        code: "STORAGE_NOT_EMPTY",
        message: "Location has stock",
        details: { entries: 3 },
        requestId: res.headers.get("x-request-id"),
      },
    });
    expect(body.error.requestId).toMatch(/.+/);
  });

  it.each([
    [new NotFoundError(), 404, ERROR_CODE.NOT_FOUND],
    [new ForbiddenError(), 403, ERROR_CODE.FORBIDDEN],
    [new ConflictError("Name taken"), 409, ERROR_CODE.CONFLICT],
  ])("named AppError subclass %o -> %i %s", async (error, status, code) => {
    const { app } = appThrowing(error);
    const res = await app.request("/boom");
    expect(res.status).toBe(status);
    expect((await envelope(res)).error.code).toBe(code);
  });

  it.each([
    ["23505", 409, ERROR_CODE.CONFLICT],
    ["23503", 409, ERROR_CODE.REFERENCED],
    ["23514", 422, ERROR_CODE.VALIDATION_FAILED],
  ])("pg %s (wrapped by Drizzle) -> %i %s without leaking SQL", async (pgCode, status, code) => {
    const { app } = appThrowing(pgFailure(pgCode, 'violates constraint "some_constraint"'));
    const res = await app.request("/boom");

    expect(res.status).toBe(status);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ error: { code } });
    expect(text).not.toMatch(/secret_table|insert into|some_constraint/i);
  });

  it("unknown errors -> 500 INTERNAL, logged, with no stack, SQL or message leak", async () => {
    const failure = pgFailure("42P01", 'relation "secret_table" does not exist');
    const { app, onUnexpected } = appThrowing(failure);
    const res = await app.request("/boom");

    expect(res.status).toBe(500);
    const text = await res.text();
    const body = JSON.parse(text) as ApiErrorBody;
    expect(body.error.code).toBe(ERROR_CODE.INTERNAL);
    expect(body.error.message).toBe("Internal server error");
    expect(body.error.details).toBeUndefined();
    expect(text).not.toMatch(/secret_table|insert into|at .*\.ts|Failed query/i);
    expect(onUnexpected).toHaveBeenCalledWith(failure, expect.anything());
  });

  it("HTTPException with its own response passes through untouched", async () => {
    const { app } = appThrowing(
      new HTTPException(418, { res: new Response("teapot", { status: 418 }) }),
    );
    const res = await app.request("/boom");
    expect(res.status).toBe(418);
    expect(await res.text()).toBe("teapot");
  });

  it("HTTPException without a response becomes an envelope with a status-derived code", async () => {
    const { app } = appThrowing(new HTTPException(401, { message: "No session" }));
    const res = await app.request("/boom");
    expect(res.status).toBe(401);
    expect((await envelope(res)).error).toMatchObject({
      code: ERROR_CODE.UNAUTHENTICATED,
      message: "No session",
    });
  });

  it("unknown routes -> 404 NOT_FOUND envelope", async () => {
    const { app } = appThrowing(new Error("unused"));
    const res = await app.request("/nope");
    expect(res.status).toBe(404);
    expect((await envelope(res)).error.code).toBe(ERROR_CODE.NOT_FOUND);
  });
});
