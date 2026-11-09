import { z } from "zod";

/** `/:id` path param: a malformed id is a 422 (validated), never a Postgres cast error (500). */
export const idParam = z.object({ id: z.uuid() });
export type IdParam = z.infer<typeof idParam>;
