import { z } from "zod";
import { TruthAxis, Confidence } from "./enums";

export const State = z.object({
  id: z.string().uuid(),
  entityId: z.string().uuid(),
  key: z.string().min(1),
  data: z.record(z.any()),
  eraId: z.string().uuid().optional(),
  truthAxis: TruthAxis,
  confidence: Confidence,
  createdAt: z.string().datetime(),
});
export type State = z.infer<typeof State>;
