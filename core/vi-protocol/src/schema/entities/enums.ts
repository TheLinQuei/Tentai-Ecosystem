import { z } from "zod";

// v1 Canon enums (additive-only; no breaking changes)

export const EntityType = z.enum([
  "Character",
  "World",
  "Ability",
  "Item",
  "Law",
  "Rule",
  "Event",
  "Era",
  "Organization",
  "Species",
]);
export type EntityType = z.infer<typeof EntityType>;

export const TruthAxis = z.enum(["truth", "belief", "public"]);
export type TruthAxis = z.infer<typeof TruthAxis>;

export const Confidence = z.enum(["locked", "provisional", "experimental"]);
export type Confidence = z.infer<typeof Confidence>;
