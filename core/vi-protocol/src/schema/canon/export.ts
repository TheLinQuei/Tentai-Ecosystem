import { z } from "zod";
import { CanonMode } from "./mode";

const RelationshipSummary = z.object({
  relationType: z.string().min(1),
  targetEntityId: z.string().uuid(),
  synopsis: z.string().optional(),
});

const AbilitySpec = z.object({
  name: z.string().min(1),
  cost: z.string().optional(),
  limits: z.string().optional(),
  counters: z.string().optional(),
});

const StateAura = z.object({
  stateKey: z.string().min(1),
  description: z.string().min(1),
});

export const WriterPacket = z.object({
  version: z.literal("v1"),
  entityId: z.string().uuid(),
  mode: CanonMode,
  roleThesis: z.string().optional(),
  motivations: z.array(z.string()).default([]),
  behaviorRules: z.array(z.string()).default([]),
  relationships: z.array(RelationshipSummary).default([]),
  abilities: z.array(AbilitySpec).default([]),
  eraDeltas: z.array(z.string()).default([]),
  truthBeliefTable: z
    .array(
      z.object({
        claim: z.string().min(1),
        truth: z.boolean().optional(),
        belief: z.boolean().optional(),
        public: z.boolean().optional(),
      })
    )
    .default([]),
  timelineHighlights: z.array(z.string()).default([]),
  cannotHappen: z.array(z.string()).default([]),
});
export type WriterPacket = z.infer<typeof WriterPacket>;

export const ArtPacket = z.object({
  version: z.literal("v1"),
  entityId: z.string().uuid(),
  mode: CanonMode,
  physicalSpec: z.string().optional(),
  doNotChange: z.array(z.string()).default([]),
  formSheets: z.array(z.string()).default([]),
  auraByState: z.array(StateAura).default([]),
  outfitMaterials: z.array(z.string()).default([]),
  referenceGallery: z.array(z.string()).default([]),
});
export type ArtPacket = z.infer<typeof ArtPacket>;
