import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
export type CapabilityInput = { id?: string; area: string; title: string; details?: string | null };

export class DbMemoryService {
  constructor(private readonly client: PrismaClient) {}

  async listCapabilities(): Promise<any[]> {
    return (this.client as any).capability.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async setCapabilities(items: CapabilityInput[]): Promise<void> {
    await this.client.$transaction(async (tx: Prisma.TransactionClient) => {
      const txx = tx as any;
      await txx.capability.deleteMany();
      if (items.length === 0) {
        return;
      }

      await txx.capability.createMany({
        data: items.map(({ id, area, title, details }) => ({
          ...(id ? { id } : {}),
          area,
          title,
          details: details ?? null,
        })),
      });
    });
  }

  async getConsent(userId: string): Promise<any | null> {
    return (this.client as any).consent.findUnique({ where: { userId } });
  }

  async setConsent(userId: string, consented: boolean): Promise<any> {
    return (this.client as any).consent.upsert({
      where: { userId },
      update: { consented },
      create: { userId, consented },
    });
  }

  async getDiagnostic(key: string): Promise<any | null> {
    return (this.client as any).diagnostic.findUnique({ where: { key } });
  }

  async setDiagnostic(key: string, value: unknown): Promise<any> {
    const normalizedValue = this.normalizeDiagnosticValue(value);

    return (this.client as any).diagnostic.upsert({
      where: { key },
      update: { value: normalizedValue },
      create: { key, value: normalizedValue },
    });
  }

  private normalizeDiagnosticValue(
    value: unknown,
  ): Prisma.JsonNullValueInput | Prisma.InputJsonValue {
    if (value === null) {
      return Prisma.JsonNull;
    }

    return value as Prisma.InputJsonValue;
  }
}
