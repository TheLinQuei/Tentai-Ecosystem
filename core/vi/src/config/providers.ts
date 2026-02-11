import { promises as fs } from 'fs';
import { z } from 'zod';

const LimitsSchema = z.object({
  max_output_tokens: z.number().int().positive(),
  rate_per_user_per_minute: z.number().int().positive(),
});

const ToolsSchema = z.object({
  allow: z.array(z.string()),
  deny: z.array(z.string()),
});

const ProfileSchema = z.object({
  primary: z.string(),
  fallback: z.string(),
  limits: LimitsSchema,
  tools: ToolsSchema,
});

const ProvidersSchema = z.record(ProfileSchema);

export type ProviderProfiles = z.infer<typeof ProvidersSchema>;
export type ProviderProfile = z.infer<typeof ProfileSchema>;

export async function loadProviderConfig(profile: string = 'default'): Promise<ProviderProfile> {
  const raw = await fs.readFile('config/providers.json', 'utf-8');
  const json = JSON.parse(raw);
  const parsed = ProvidersSchema.safeParse(json);
  if (!parsed.success) {
    const errs = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid providers.json: ${errs}`);
  }
  const selected = parsed.data[profile];
  if (!selected) {
    throw new Error(`Provider profile not found: ${profile}`);
  }
  return selected;
}
