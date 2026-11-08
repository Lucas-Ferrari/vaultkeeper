import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authPost, createTestApp, signUp, type TestApp } from "../test/auth-helpers";
import { useTestDatabase } from "../test/db";
import { verification } from "./db/schema/auth";

/** Task 7.9: what the MVP deliberately does NOT ship (R-NG-1, R-AUTH-6 S4). */
describe("non-goals", () => {
  const db = useTestDatabase();
  let t: TestApp;

  beforeAll(() => {
    t = createTestApp(db.current.url);
  });
  afterAll(async () => {
    await t.close();
  });

  it("R-AUTH-6 S4: email password reset is unusable and stores no reset token", async () => {
    const { email } = await signUp(t.app);

    const res = await authPost(t.app, "/request-password-reset", {
      email,
      redirectTo: "/reset",
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await t.database.db.select().from(verification)).toEqual([]);
  });

  it("R-AUTH-6 S4: email verification cannot be sent", async () => {
    const { email } = await signUp(t.app);

    const res = await authPost(t.app, "/send-verification-email", { email });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("R-NG-1 S1: no marketplace, listing, email or S3 routes are mounted", () => {
    const paths = t.app.routes.map((route) => route.path);

    expect(
      paths.filter((path) => /market|listing|email-send|mail|s3|upload-url/i.test(path)),
    ).toEqual([]);
  });
});
