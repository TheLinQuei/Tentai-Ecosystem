/**
 * Phase 5.1 P0: Centralized Placeholder Resolution
 * 
 * Replace {{token}} placeholders in strings, arrays, and objects using provided context.
 * Used by executor before tool execution to ensure all tools receive fully-resolved inputs.
 */

export function interpolatePlaceholders<T = any>(value: T, ctx: Record<string, any>): T {
  const replacer = (str: string) =>
    str.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
      const v = ctx[key];
      return v === undefined || v === null ? '' : String(v);
    });

  if (typeof value === 'string') return replacer(value) as unknown as T;
  if (Array.isArray(value)) return (value as any[]).map((v) => interpolatePlaceholders(v, ctx)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      out[k] = interpolatePlaceholders(v, ctx);
    }
    return out as unknown as T;
  }
  return value;
}
