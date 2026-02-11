import { z } from "zod";
import { TruthAxis, Confidence } from "./enums";

export const Facet = z.object({
  id: z.string().uuid(),
  entityId: z.string().uuid(),
  key: z.string().min(1),
  value: z.record(z.any()),
  truthAxis: TruthAxis,
  confidence: Confidence,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Facet = z.infer<typeof Facet>;
