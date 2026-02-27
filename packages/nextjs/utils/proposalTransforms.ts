// ── JSONB shapes stored in the DB ──

export type SnapshotOptions = {
  choices: string[];
  scores: number[];
};

export type TallyOptions = {
  voteStats: Array<{
    type: string;
    votesCount: string;
    votersCount: string;
    percent: string;
  }>;
  executableCalls?: Array<unknown>;
};

// ── UI-facing type ──

export type DashboardProposal = {
  id: string;
  title: string;
  forumLink: string | null;
  snapshotLink: string | null;
  tallyLink: string | null;
  forumStatus: "Active Discussion" | "Completed" | null;
  snapshotStatus: string | null;
  tallyStatus: string | null;
  forumLastUpdate: string | null;
  snapshotLastUpdate: string | null;
  tallyLastUpdate: string | null;
  category: string;
  author: string;
  votes?: { for: string; against: string; total: string };
};

// ── Helpers ──

export function formatVoteCount(raw: string): string {
  const num = Number(raw) / 1e18;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(2);
}

export function timeAgo(date: Date | null): string | null {
  if (!date) return null;
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMinutes > 0) return `${diffMinutes}m ago`;
  return "just now";
}

export function mapTallyStatus(status: string | null, substatus: string | null): string | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "executed") return "Executed";
  if (s === "canceled" || s === "cancelled") return "Canceled";
  if (s === "defeated") return "Defeated";
  if (s === "queued") return `Pending execution (${substatus || "Proposal queued"})`;
  if (s === "active") return "Active";
  if (substatus) return `Pending execution (${substatus})`;
  return status;
}

export function resolveSnapshotResult(status: string | null, options: SnapshotOptions | null): string | null {
  if (!status) return null;
  const s = status.toLowerCase();

  if (s === "active") return "Active";
  if (s === "pending") return "Pending";

  if (s === "closed" && options?.choices && options?.scores && options.choices.length >= 2) {
    const forIdx = options.choices.findIndex(c => c.toLowerCase() === "for");
    const againstIdx = options.choices.findIndex(c => c.toLowerCase() === "against");
    if (forIdx !== -1 && againstIdx !== -1) {
      return options.scores[forIdx] > options.scores[againstIdx] ? "Passed" : "Failed";
    }
    // Fallback: highest score at index 0 → Passed
    const maxScore = Math.max(...options.scores);
    return options.scores.indexOf(maxScore) === 0 ? "Passed" : "Failed";
  }

  return s === "closed" ? "Closed" : status;
}

export function extractTallyVotes(
  options: TallyOptions | null,
): { for: string; against: string; total: string } | undefined {
  if (!options?.voteStats?.length) return undefined;

  const forStat = options.voteStats.find(s => s.type.toLowerCase() === "for");
  const againstStat = options.voteStats.find(s => s.type.toLowerCase() === "against");
  if (!forStat && !againstStat) return undefined;

  const forCount = forStat ? formatVoteCount(forStat.votesCount) : "0";
  const againstCount = againstStat ? formatVoteCount(againstStat.votesCount) : "0";
  const totalRaw = options.voteStats.reduce((sum, s) => sum + Number(s.votesCount), 0);

  return { for: forCount, against: againstCount, total: formatVoteCount(totalRaw.toString()) };
}
