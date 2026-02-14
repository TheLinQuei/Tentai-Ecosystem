-- CreateTable
CREATE TABLE "public"."PollArchive" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "config" JSONB NOT NULL,
    "votes" JSONB NOT NULL,

    CONSTRAINT "PollArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PollPreset" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "defaults" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PollWeight" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PollWeight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PollArchive_messageId_key" ON "public"."PollArchive"("messageId");

-- CreateIndex
CREATE INDEX "PollArchive_guildId_createdAt_idx" ON "public"."PollArchive"("guildId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PollPreset_guildId_name_key" ON "public"."PollPreset"("guildId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PollWeight_guildId_roleId_key" ON "public"."PollWeight"("guildId", "roleId");
