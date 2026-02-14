/**
 * identity.update tool - Phase D.4
 * 
 * Allows users to update their identity preferences:
 * - Add public aliases (visible in all contexts)
 * - Add private/intimate aliases (only for DM/trusted contexts)
 * - Toggle allowAutoIntimate preference
 */

interface IdentityUpdateInput {
  userId: string;
  addPublicAliases?: string[];
  addPrivateAliases?: string[];
  setAllowAutoIntimate?: boolean;
}

interface IdentityUpdateOutput {
  ok: boolean;
  updated?: boolean;
  error?: string;
}

export async function identityUpdate(input: IdentityUpdateInput): Promise<IdentityUpdateOutput> {
  const { userId, addPublicAliases, addPrivateAliases, setAllowAutoIntimate } = input;

  if (!userId) {
    return { ok: false, error: 'userId is required' };
  }

  const MEMORY_API = process.env.MEMORY_API || 'http://localhost:4311';

  try {
    // 1. Fetch existing user entity (auto-creates if missing via new GET /v1/users/:id)
    const getRes = await fetch(`${MEMORY_API}/v1/users/${userId}`, {
      method: 'GET',
    });

    if (!getRes.ok) {
      return { ok: false, error: `Failed to fetch user entity: ${getRes.status}` };
    }

    const existing: any = await getRes.json();

    // 2. Extract current identity traits
    const currentIdentity = (existing?.traits?.identity || {}) as {
      publicAliases?: string[];
      privateAliases?: string[];
      allowAutoIntimate?: boolean;
    };

    // 3. Merge new aliases
    const updatedPublicAliases = Array.from(
      new Set<string>([
        ...(currentIdentity.publicAliases || []),
        ...(addPublicAliases || []),
      ])
    );

    const updatedPrivateAliases = Array.from(
      new Set<string>([
        ...(currentIdentity.privateAliases || []),
        ...(addPrivateAliases || []),
      ])
    );

    // 4. Update allowAutoIntimate if provided
    const updatedAllowAutoIntimate =
      typeof setAllowAutoIntimate === 'boolean'
        ? setAllowAutoIntimate
        : currentIdentity.allowAutoIntimate ?? false;

    // 5. Build updated identity traits
    const updatedIdentityTraits = {
      publicAliases: updatedPublicAliases,
      privateAliases: updatedPrivateAliases,
      allowAutoIntimate: updatedAllowAutoIntimate,
    };

    // 6. Upsert via PATCH /v1/users/:id (now implemented)
    const patchRes = await fetch(`${MEMORY_API}/v1/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        traits: {
          ...(existing?.traits || {}),
          identity: updatedIdentityTraits,
        },
      }),
    });

    if (!patchRes.ok) {
      const errorText = await patchRes.text().catch(() => 'Unknown error');
      return { ok: false, error: `Memory API returned ${patchRes.status}: ${errorText}` };
    }

    return { ok: true, updated: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
