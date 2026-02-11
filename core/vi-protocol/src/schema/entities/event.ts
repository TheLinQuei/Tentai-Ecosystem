import { z } from "zod";

export const Event = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  primaryEntityId: z.string().uuid().optional(),
  entityIds: z.array(z.string().uuid()).default([]),
  eraId: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
  summary: z.string().min(1),
  details: z.record(z.any()).optional(),
});
export type Event = z.infer<typeof Event>;
