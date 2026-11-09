import type { Role } from "@vaultkeeper/shared/constants";
import { ERROR_CODE } from "@vaultkeeper/shared/errors";
import type { MeResponse } from "@vaultkeeper/shared/schemas/me";
import { describe, expect, expectTypeOf, it } from "vitest";
import { ApiError, createApiClient, unwrap } from "./index";

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(response: Response) {
  const calls: RecordedCall[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: input instanceof Request ? input.url : String(input), init });
    return response;
  };
  return { fetch, calls };
}

describe("createApiClient", () => {
  it("calls typed routes under baseUrl and always sends cookies (credentials: include)", async () => {
    const { fetch, calls } = fakeFetch(Response.json({ status: "ok" }, { status: 200 }));
    const api = createApiClient("http://localhost:3000", { fetch });

    const body = await unwrap(api.healthz.$get());

    expect(body.status).toBe("ok");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:3000/healthz");
    expect(calls[0]?.init?.credentials).toBe("include");
  });

  it("types GET /api/v1/me from the API route itself (AppType, ADR1)", async () => {
    const me: MeResponse = { id: "u1", email: "a@x.com", name: "A", role: "user" };
    const { fetch, calls } = fakeFetch(Response.json(me, { status: 200 }));
    const api = createApiClient("", { fetch });

    const call = api.api.v1.me.$get();
    type Body = Awaited<ReturnType<typeof unwrap<Awaited<typeof call>>>>;
    // The 2xx body is the route's own c.json() payload, not `unknown`/`any`...
    expectTypeOf<Body>().toEqualTypeOf<MeResponse>();
    // ...and the role is the const-object union, so UI code can switch on it exhaustively.
    expectTypeOf<Body["role"]>().toEqualTypeOf<Role>();

    await expect(unwrap(call)).resolves.toEqual(me);
    expect(calls[0]?.url).toBe("/api/v1/me");
  });

  it("unwrap of a 401 from /api/v1/me throws ApiError UNAUTHENTICATED", async () => {
    const { fetch } = fakeFetch(
      Response.json(
        {
          error: {
            code: ERROR_CODE.UNAUTHENTICATED,
            message: "Authentication required",
            requestId: "r2",
          },
        },
        { status: 401 },
      ),
    );
    const api = createApiClient("", { fetch });

    const error = await unwrap(api.api.v1.me.$get()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: ERROR_CODE.UNAUTHENTICATED, status: 401, requestId: "r2" });
  });

  it("surfaces API error envelopes as ApiError through unwrap", async () => {
    const { fetch } = fakeFetch(
      Response.json(
        { error: { code: ERROR_CODE.UNAUTHENTICATED, message: "Sign in", requestId: "r1" } },
        { status: 401 },
      ),
    );
    const api = createApiClient("http://localhost:3000", { fetch });

    await expect(unwrap(api.healthz.$get())).rejects.toBeInstanceOf(ApiError);
  });
});
