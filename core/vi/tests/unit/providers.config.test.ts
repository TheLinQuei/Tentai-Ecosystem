import { describe, it, expect } from 'vitest';
import { loadProviderConfig } from '../../src/config/providers.js';

describe('Provider config loader', () => {
  it('loads default profile', async () => {
    const cfg = await loadProviderConfig();
    expect(cfg.primary).toBeTruthy();
    expect(cfg.fallback).toBeTruthy();
    expect(cfg.limits.max_output_tokens).toBeGreaterThan(0);
  });
});
