import { PrismaClient } from "@prisma/client";
import { EmbedBuilder, Colors, User, Guild } from "discord.js";

const prisma = new PrismaClient();

// Badge definitions
export const BADGES = {
  first_vote: { id: "first_vote", name: "First Vote", emoji: "🎫", description: "Cast your first vote" },
  streak_3: { id: "streak_3", name: "On Fire", emoji: "🔥", description: "3-day voting streak" },
  streak_7: { id: "streak_7", name: "Committed", emoji: "⚡", description: "7-day voting streak" },
  streak_30: { id: "streak_30", name: "Dedicated", emoji: "💎", description: "30-day voting streak" },
  votes_10: { id: "votes_10", name: "Regular", emoji: "🌟", description: "Cast 10 votes" },
  votes_50: { id: "votes_50", name: "Active", emoji: "🎖️", description: "Cast 50 votes" },
  votes_100: { id: "votes_100", name: "Veteran", emoji: "👑", description: "Cast 100 votes" },
  votes_500: { id: "votes_500", name: "Legend", emoji: "🏆", description: "Cast 500 votes" },
} as const;

type BadgeId = keyof typeof BADGES;

// Points rewards
const POINTS = {
  vote: 10,
  daily_streak_bonus: 5,
  week_streak_bonus: 25,
  month_streak_bonus: 100,
};

export interface VoterStats {
  totalVotes: number;
  currentStreak: number;
  longestStreak: number;
  points: number;
  badges: BadgeId[];
  lastVoteAt: Date | null;
}

/**
 * Record a vote and update stats/gamification
 */
export async function recordVote(guildId: string, userId: string): Promise<{
  stats: VoterStats;
  newBadges: BadgeId[];
  pointsGained: number;
}> {
  const now = new Date();
  
  // Get or create stats
  let stats = await prisma.pollVoterStats.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });

  const isFirstVote = !stats;
  const lastVote = stats?.lastVoteAt;
  
  // Calculate streak
  let currentStreak = stats?.currentStreak ?? 0;
  let longestStreak = stats?.longestStreak ?? 0;
  
  if (lastVote) {
    const hoursSinceLastVote = (now.getTime() - lastVote.getTime()) / (1000 * 60 * 60);
    
    // Check if voted within 48 hours (allows for timezone flexibility)
    if (hoursSinceLastVote <= 48) {
      const lastVoteDay = new Date(lastVote).setHours(0, 0, 0, 0);
      const currentDay = new Date(now).setHours(0, 0, 0, 0);
      
      // Only increment if different day
      if (currentDay > lastVoteDay) {
        currentStreak++;
      }
    } else {
      // Streak broken
      currentStreak = 1;
    }
  } else {
    currentStreak = 1;
  }
  
  longestStreak = Math.max(longestStreak, currentStreak);
  
  // Calculate points
  let pointsGained = POINTS.vote;
  if (currentStreak >= 30) pointsGained += POINTS.month_streak_bonus;
  else if (currentStreak >= 7) pointsGained += POINTS.week_streak_bonus;
  else if (currentStreak >= 2) pointsGained += POINTS.daily_streak_bonus;
  
  const totalVotes = (stats?.totalVotes ?? 0) + 1;
  const totalPoints = (stats?.points ?? 0) + pointsGained;
  
  // Check for new badges
  const currentBadges: BadgeId[] = stats?.badges ? (stats.badges as any) : [];
  const newBadges: BadgeId[] = [];
  
  const checkBadge = (id: BadgeId, condition: boolean) => {
    if (condition && !currentBadges.includes(id)) {
      currentBadges.push(id);
      newBadges.push(id);
    }
  };
  
  checkBadge("first_vote", isFirstVote);
  checkBadge("streak_3", currentStreak >= 3);
  checkBadge("streak_7", currentStreak >= 7);
  checkBadge("streak_30", currentStreak >= 30);
  checkBadge("votes_10", totalVotes >= 10);
  checkBadge("votes_50", totalVotes >= 50);
  checkBadge("votes_100", totalVotes >= 100);
  checkBadge("votes_500", totalVotes >= 500);
  
  // Update database
  stats = await prisma.pollVoterStats.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: {
      guildId,
      userId,
      totalVotes,
      currentStreak,
      longestStreak,
      lastVoteAt: now,
      points: totalPoints,
      badges: currentBadges,
    },
    update: {
      totalVotes,
      currentStreak,
      longestStreak,
      lastVoteAt: now,
      points: totalPoints,
      badges: currentBadges,
    },
  });
  
  return {
    stats: {
      totalVotes: stats.totalVotes,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      points: stats.points,
      badges: stats.badges as any,
      lastVoteAt: stats.lastVoteAt,
    },
    newBadges,
    pointsGained,
  };
}

/**
 * Get voter stats
 */
export async function getVoterStats(guildId: string, userId: string): Promise<VoterStats | null> {
  const stats = await prisma.pollVoterStats.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
  
  if (!stats) return null;
  
  return {
    totalVotes: stats.totalVotes,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    points: stats.points,
    badges: stats.badges as any,
    lastVoteAt: stats.lastVoteAt,
  };
}

/**
 * Get leaderboard
 */
export async function getLeaderboard(guildId: string, limit = 10): Promise<VoterStats[]> {
  const stats = await prisma.pollVoterStats.findMany({
    where: { guildId },
    orderBy: { points: "desc" },
    take: limit,
  });
  
  return stats.map((s: any): VoterStats => ({
    totalVotes: s.totalVotes,
    currentStreak: s.currentStreak,
    longestStreak: s.longestStreak,
    points: s.points,
    badges: s.badges,
    lastVoteAt: s.lastVoteAt,
  }));
}

/**
 * Build stats embed for a user
 */
export function buildStatsEmbed(user: User, stats: VoterStats): EmbedBuilder {
  const badgeDisplay = stats.badges.length > 0
    ? stats.badges.map(id => `${BADGES[id].emoji} ${BADGES[id].name}`).join("\n")
    : "No badges yet";
  
  const streakEmoji = stats.currentStreak >= 30 ? "💎" 
    : stats.currentStreak >= 7 ? "⚡"
    : stats.currentStreak >= 3 ? "🔥"
    : "📊";
  
  return new EmbedBuilder()
    .setColor(Colors.Gold)
    .setAuthor({ name: `${user.username}'s Voting Stats`, iconURL: user.displayAvatarURL() })
    .addFields(
      { name: "🎯 Total Votes", value: stats.totalVotes.toString(), inline: true },
      { name: "💰 Points", value: stats.points.toString(), inline: true },
      { name: `${streakEmoji} Current Streak`, value: `${stats.currentStreak} day${stats.currentStreak !== 1 ? "s" : ""}`, inline: true },
      { name: "🏅 Longest Streak", value: `${stats.longestStreak} day${stats.longestStreak !== 1 ? "s" : ""}`, inline: true },
      { name: "🎖️ Badges", value: badgeDisplay, inline: false },
    )
    .setTimestamp();
}

/**
 * Build leaderboard embed
 */
export async function buildLeaderboardEmbed(guild: Guild, limit = 10): Promise<EmbedBuilder> {
  const stats = await prisma.pollVoterStats.findMany({
    where: { guildId: guild.id },
    orderBy: { points: "desc" },
    take: limit,
  });
  
  if (stats.length === 0) {
    return new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("🏆 Poll Voting Leaderboard")
      .setDescription("No voters yet! Cast your first vote to get on the board.");
  }
  
  const medals = ["🥇", "🥈", "🥉"];
  const lines = await Promise.all(stats.map(async (s: any, i: number) => {
    try {
      const user = await guild.client.users.fetch(s.userId);
      const medal = medals[i] || `${i + 1}.`;
      const streakEmoji = s.currentStreak >= 7 ? "⚡" : s.currentStreak >= 3 ? "🔥" : "";
      return `${medal} **${user.username}** • ${s.points} pts • ${s.totalVotes} votes ${streakEmoji}`;
    } catch {
      return `${i + 1}. Unknown User • ${s.points} pts`;
    }
  }));
  
  return new EmbedBuilder()
    .setColor(Colors.Gold)
    .setTitle("🏆 Poll Voting Leaderboard")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Top ${limit} voters by points` })
    .setTimestamp();
}

/**
 * Announce new badges (for ephemeral/DM notifications)
 */
export function buildBadgeAnnouncement(badges: BadgeId[]): string {
  if (badges.length === 0) return "";
  
  const badgeList = badges.map(id => `${BADGES[id].emoji} **${BADGES[id].name}** - ${BADGES[id].description}`).join("\n");
  
  return `\n\n🎉 **New Badge${badges.length > 1 ? "s" : ""} Unlocked!**\n${badgeList}`;
}
