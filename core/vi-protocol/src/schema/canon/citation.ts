import { z } from "zod";

// Source citation for canon changes (v1)
export const SourceCitation = z.object({
  enteredByUserId: z.string().uuid(),
  enteredAt: z.string().datetime(),
  approvedByUserId: z.string().uuid().optional(),
  derivedFromEventId: z.string().uuid().optional(),
  note: z.string().min(1).optional(),
});
export type SourceCitation = z.infer<typeof SourceCitation>;
