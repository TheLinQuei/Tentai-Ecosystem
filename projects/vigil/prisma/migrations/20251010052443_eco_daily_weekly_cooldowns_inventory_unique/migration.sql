/*
  Warnings:

  - A unique constraint covering the columns `[userId,guildId,sku]` on the table `EcoInventory` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."EcoAccount" ADD COLUMN     "lastDailyAt" TIMESTAMP(3),
ADD COLUMN     "lastWeeklyAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "EcoInventory_userId_guildId_sku_key" ON "public"."EcoInventory"("userId", "guildId", "sku");
