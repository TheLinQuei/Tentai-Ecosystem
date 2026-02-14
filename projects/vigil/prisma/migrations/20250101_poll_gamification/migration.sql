-- CreateTable
CREATE TABLE "PollVoterStats" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalVotes" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastVoteAt" TIMESTAMP(3),
    "points" INTEGER NOT NULL DEFAULT 0,
    "badges" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "PollVoterStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PollVoterStats_guildId_userId_key" ON "PollVoterStats"("guildId", "userId");

-- CreateIndex
CREATE INDEX "PollVoterStats_guildId_points_idx" ON "PollVoterStats"("guildId", "points");
