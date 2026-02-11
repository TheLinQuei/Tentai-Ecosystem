import { z } from "zod";
import { EntityType, TruthAxis, Confidence } from "../entities/enums";
import { SourceCitation } from "../canon/citation";

// Base Entity schema (v1)
export const Entity = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  type: EntityType,
  aliases: z.array(z.string()).default([]),
  summary: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  truthAxis: TruthAxis,
  confidence: Confidence,
  eraId: z.string().uuid().optional(),
  citations: z.array(SourceCitation).default([]),
});
export type Entity = z.infer<typeof Entity>;
