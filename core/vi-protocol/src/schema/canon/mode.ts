import { z } from "zod";

export const CanonMode = z.enum(["brainstorm", "commit", "lock", "export"]);
export type CanonMode = z.infer<typeof CanonMode>;

export const CanonSettings = z.object({
  mode: CanonMode,
});
export type CanonSettings = z.infer<typeof CanonSettings>;
