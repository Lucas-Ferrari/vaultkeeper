import { describe, expect, it } from "vitest";
import { meResponse } from "./me";

describe("meResponse (GET /api/v1/me contract, R-AUTH-3)", () => {
  it("accepts a user with role user|admin", () => {
    const me = { id: "u1", email: "a@x.com", name: "A", role: "admin" };
    expect(meResponse.parse(me)).toEqual(me);
  });

  it.each([
    { id: "u1", email: "a@x.com", name: "A", role: "owner" },
    { id: "u1", email: "not-an-email", name: "A", role: "user" },
    { id: "u1", email: "a@x.com", name: "A" },
  ])("rejects %j", (value) => {
    expect(meResponse.safeParse(value).success).toBe(false);
  });

  it("strips anything beyond the contract", () => {
    const parsed = meResponse.parse({
      id: "u1",
      email: "a@x.com",
      name: "A",
      role: "user",
      banned: false,
    });
    expect(parsed).not.toHaveProperty("banned");
  });
});
