/*
  Warnings:

  - A unique constraint covering the columns `[requestId]` on the table `XpEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."XpEvent_userId_guildId_createdAt_idx";

-- AlterTable
ALTER TABLE "public"."XpEvent" ADD COLUMN     "requestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "XpEvent_requestId_key" ON "public"."XpEvent"("requestId");

-- CreateIndex
CREATE INDEX "XpEvent_guildId_userId_createdAt_idx" ON "public"."XpEvent"("guildId", "userId", "createdAt");
