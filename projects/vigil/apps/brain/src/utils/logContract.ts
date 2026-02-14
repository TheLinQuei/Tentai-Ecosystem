// apps/brain/src/utils/logContract.ts

/**
 * prepareLog - Global log contract helper for ViBrain
 * Adds timestamp, component, and all required fields. Truncates/strips large/binary payloads.
 * @param {string} component - Name of the component (e.g., "PlannerLLM", "Tool:weather.get")
 * @param {Record<string, any>} data - Log data
 * @returns {Record<string, any>} Structured log object
 */
export function prepareLog(component: string, data: Record<string, any>) {
  const MAX_STRING = 300;
  const MAX_ARRAY = 20;
  const out: Record<string, any> = {
    timestamp: new Date().toISOString(),
    component,
    ...data,
  };

  // Truncate long strings
  for (const key in out) {
    if (typeof out[key] === "string" && out[key].length > MAX_STRING) {
      out[key] = out[key].slice(0, MAX_STRING) + `... [truncated, ${out[key].length} chars]`;
    }
    // Truncate large arrays
    if (Array.isArray(out[key]) && out[key].length > MAX_ARRAY) {
      out[key] = out[key].slice(0, MAX_ARRAY);
      out[`${key}Length`] = out[key].length;
      out[`${key}Truncated`] = true;
    }
    // Remove binary payloads
    if (out[key] instanceof Buffer || out[key] instanceof ArrayBuffer) {
      out[key] = '[binary omitted]';
    }
  }

  // Add size summaries
  for (const key in out) {
    if (typeof out[key] === "string") {
      out[`${key}Size`] = out[key].length;
    }
    if (Array.isArray(out[key])) {
      out[`${key}Size`] = out[key].length;
    }
  }

  return out;
}
