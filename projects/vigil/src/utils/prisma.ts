type PrismaClientCtor = new () => any;

let singleton: any;

function instantiateClient(): any {
  try {
    const mod = require("@prisma/client") as { PrismaClient?: PrismaClientCtor };
    if (mod?.PrismaClient) {
      return new mod.PrismaClient();
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load PrismaClient from @prisma/client. Did you run "prisma generate"? Original error: ${detail}`);
  }
  throw new Error("@prisma/client is installed but PrismaClient was not exported. Ensure the Prisma client is generated.");
}

export function getPrisma() {
  if (!singleton) {
    singleton = instantiateClient();
  }
  return singleton;
}

export type PrismaClient = ReturnType<typeof getPrisma>;
