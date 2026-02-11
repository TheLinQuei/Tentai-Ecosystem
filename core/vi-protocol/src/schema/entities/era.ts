import { z } from "zod";

export const Era = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  summary: z.string().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
export type Era = z.infer<typeof Era>;
