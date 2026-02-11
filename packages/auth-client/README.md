# packages/auth-client

**Aegis SDK stub.** Client for identity and authorization services.

## Purpose

When aegis (identity + auth) is built, clients import this SDK instead of implementing auth themselves:

- ✅ Single auth client used everywhere
- ✅ Consistent permission checking
- ✅ Token management (JWT, refresh, etc.)
- ✅ User context propagation

## Structure

```
packages/auth-client/
  package.json
  src/
    client.ts          # Main auth client
    types.ts           # Auth types
    errors.ts          # Auth errors
    index.ts           # Export
```

## Phase 0 Stub

Right now, this is a placeholder:

```typescript
export class AegisClient {
  async getCurrentUser(): Promise<User | null> {
    throw new NotImplementedByDesign(
      'Auth client not yet implemented.',
      {
        phase: 'Phase 3',
        reason: 'Waiting for aegis identity service to be defined.',
        when: 'After vi-core defines user model and permission needs',
        ticket: 'https://github.com/...'
      }
    );
  }
}
```

## Usage (Later)

### In Sovereign
```typescript
import { AegisClient } from '@tentai/auth-client';

const auth = new AegisClient();

export function SettingsPanel() {
  const user = auth.getCurrentUser();
  const canApproveCanon = auth.hasPermission('canon:approve');
  
  return (
    <div>
      <p>User: {user?.name}</p>
      {canApproveCanon && <ApprovalQueue />}
    </div>
  );
}
```

### In Vigil
```typescript
import { AegisClient } from '@tentai/auth-client';

const auth = new AegisClient();

async function handleCommand(interaction: Interaction) {
  const user = await auth.getCurrentUser();
  const canCreateProposal = auth.hasPermission('canon:propose');
  
  if (!canCreateProposal) {
    await interaction.reply('You do not have permission to create proposals.');
    return;
  }
  
  // ... process command ...
}
```

## Development

Phase 0: Stub with NotImplementedByDesign
Phase 1: Connect to aegis once it exists
Phase 2: Add token refresh, caching, etc.
