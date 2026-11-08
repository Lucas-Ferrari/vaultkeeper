import { ERROR_CODE } from "@vaultkeeper/shared/errors";
import { describe, expect, it } from "vitest";
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
