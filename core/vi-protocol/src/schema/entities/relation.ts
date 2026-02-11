import { z } from "zod";
import { TruthAxis, Confidence } from "./enums";

export const Relation = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  objectId: z.string().uuid(),
  relationType: z.string().min(1),
  weight: z.number().min(0).max(1).optional(),
  eraId: z.string().uuid().optional(),
  truthAxis: TruthAxis,
  confidence: Confidence,
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type Relation = z.infer<typeof Relation>;
