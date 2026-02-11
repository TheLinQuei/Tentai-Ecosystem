export interface AuthoritativeTime {
  utc: string;
  epochMs: number;
}

// Centralized time source so the model never guesses timestamps.
export function getAuthoritativeTime(): AuthoritativeTime {
  const now = new Date();
  return {
    utc: now.toISOString(),
    epochMs: now.getTime(),
  };
}
