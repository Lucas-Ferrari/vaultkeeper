import { z } from "zod";
import { ROLE } from "../constants";

/** GET /api/v1/me: who is signed in and with which role (R-AUTH-3). */
export const meResponse = z.object({
  id: z.string().min(1),
  email: z.email(),
  name: z.string(),
  role: z.enum(ROLE),
});
export type MeResponse = z.infer<typeof meResponse>;
