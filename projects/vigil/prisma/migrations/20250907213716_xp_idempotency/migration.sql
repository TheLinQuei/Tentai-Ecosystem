/*
  Warnings:

  - A unique constraint covering the columns `[messageId]` on the table `XpEvent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[voiceKey]` on the table `XpEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."XpEvent_guildId_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "public"."XpEvent" ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "voiceKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "XpEvent_messageId_key" ON "public"."XpEvent"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "XpEvent_voiceKey_key" ON "public"."XpEvent"("voiceKey");

-- CreateIndex
CREATE INDEX "XpEvent_userId_guildId_createdAt_idx" ON "public"."XpEvent"("userId", "guildId", "createdAt");
