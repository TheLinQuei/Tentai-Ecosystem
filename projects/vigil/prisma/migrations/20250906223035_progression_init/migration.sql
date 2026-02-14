-- CreateTable
CREATE TABLE "public"."XpProfile" (
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "voiceMs" INTEGER NOT NULL DEFAULT 0,
    "lastMsgAt" TIMESTAMP(3),
    "lastWeekly" TIMESTAMP(3),
    "lastDaily" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XpProfile_pkey" PRIMARY KEY ("userId","guildId")
);

-- CreateTable
CREATE TABLE "public"."XpEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LevelRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LevelRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EcoAccount" (
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "prestige" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcoAccount_pkey" PRIMARY KEY ("userId","guildId")
);

-- CreateTable
CREATE TABLE "public"."EcoTx" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcoTx_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EcoItem" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB,
    "stock" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EcoInventory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcoInventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "XpProfile_guildId_xp_idx" ON "public"."XpProfile"("guildId", "xp");

-- CreateIndex
CREATE INDEX "XpProfile_guildId_level_idx" ON "public"."XpProfile"("guildId", "level");

-- CreateIndex
CREATE INDEX "XpEvent_guildId_userId_createdAt_idx" ON "public"."XpEvent"("guildId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LevelRole_guildId_level_key" ON "public"."LevelRole"("guildId", "level");

-- CreateIndex
CREATE INDEX "EcoAccount_guildId_balance_idx" ON "public"."EcoAccount"("guildId", "balance");

-- CreateIndex
CREATE INDEX "EcoTx_guildId_userId_createdAt_idx" ON "public"."EcoTx"("guildId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EcoItem_guildId_sku_key" ON "public"."EcoItem"("guildId", "sku");

-- CreateIndex
CREATE INDEX "EcoInventory_guildId_userId_idx" ON "public"."EcoInventory"("guildId", "userId");
