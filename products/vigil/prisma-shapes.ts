export interface XpProfile {
  userId: string;
  guildId: string;
  level: number;
  xp: number;
  voiceMs: number;
  lastMsgAt: Date | null;
  lastWeekly: Date | null;
  lastDaily: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EcoItem {
  id: string;
  guildId: string;
  sku: string;
  name: string;
  price: bigint;
  kind: string;
  data: unknown | null;
  stock: number | null;
  createdAt: Date;
}
