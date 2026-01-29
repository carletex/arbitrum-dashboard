/**
 * AI Agent Proposal Matching Service
 *
 * This service provides data fetching and match application functions.
 * The actual matching logic is performed by the AI agent (Claude/Cursor)
 * using its own reasoning capabilities - no external API calls needed.
 *
 * WORKFLOW FOR AI AGENT:
 * 1. Call fetchDataForMatching() to get unmatched stages and candidates
 * 2. Analyze the data using semantic understanding
 * 3. Output match recommendations
 * 4. Call applyMatches() to save approved matches
 */

import { getAllForumStages } from "../database/repositories/forum";
import {
  getAllSnapshotStagesWithoutProposal,
  getSnapshotStageByProposalId,
  updateSnapshotProposalId,
} from "../database/repositories/snapshot";
import {
  getAllTallyStagesWithoutProposal,
  getTallyStageByProposalId,
  updateTallyProposalId,
} from "../database/repositories/tally";

// ============================================================================
// TYPES
// ============================================================================

export interface ProposalCandidate {
  id: string;
  title: string;
  author_name: string | null;
  forum_url: string | null;
  forum_original_id: string | null;
}

export interface UnmatchedStage {
  id: string;
  type: "tally" | "snapshot";
  title: string | null;
  author_name: string | null;
  url: string | null;
  discourse_url?: string | null;
  snapshot_url?: string | null;
}

export interface MatchRecommendation {
  stage_id: string;
  stage_type: "tally" | "snapshot";
  stage_title: string | null;
  proposal_id: string;
  proposal_title: string;
  confidence: number;
  reasoning: string;
}

export interface MatchingData {
  unmatchedTally: UnmatchedStage[];
  unmatchedSnapshot: UnmatchedStage[];
  candidates: ProposalCandidate[];
  summary: {
    totalUnmatchedTally: number;
    totalUnmatchedSnapshot: number;
    totalCandidates: number;
  };
}

// ============================================================================
// DATA FETCHING - Agent uses these to get the data
// ============================================================================

/**
 * Fetch all data needed for matching
 * Returns unmatched stages and candidate proposals
 */
export async function fetchDataForMatching(): Promise<MatchingData> {
  const [tallyStages, snapshotStages, forumStages] = await Promise.all([
    getAllTallyStagesWithoutProposal(),
    getAllSnapshotStagesWithoutProposal(),
    getAllForumStages(),
  ]);

  // Transform tally stages
  const unmatchedTally: UnmatchedStage[] = tallyStages.map(t => ({
    id: t.id,
    type: "tally" as const,
    title: t.title,
    author_name: t.author_name,
    url: t.url,
    discourse_url: t.discourse_url,
    snapshot_url: t.snapshot_url,
  }));

  // Transform snapshot stages
  const unmatchedSnapshot: UnmatchedStage[] = snapshotStages.map(s => ({
    id: s.id,
    type: "snapshot" as const,
    title: s.title,
    author_name: s.author_name,
    url: s.url,
  }));

  // Build candidate proposals from forum stages
  const candidates: ProposalCandidate[] = forumStages
    .filter(f => f.proposal_id)
    .map(f => ({
      id: f.proposal_id!,
      title: f.title || "",
      author_name: f.author_name,
      forum_url: f.url,
      forum_original_id: f.original_id,
    }));

  return {
    unmatchedTally,
    unmatchedSnapshot,
    candidates,
    summary: {
      totalUnmatchedTally: unmatchedTally.length,
      totalUnmatchedSnapshot: unmatchedSnapshot.length,
      totalCandidates: candidates.length,
    },
  };
}

// ============================================================================
// MATCH APPLICATION - Agent uses these to apply matches
// ============================================================================

/**
 * Apply a single match
 * Returns true if successful, false if already linked
 */
export async function applyMatch(
  stageId: string,
  stageType: "tally" | "snapshot",
  proposalId: string
): Promise<{ success: boolean; message: string }> {
  try {
    if (stageType === "tally") {
      // Check unique constraint
      const existing = await getTallyStageByProposalId(proposalId);
      if (existing) {
        return {
          success: false,
          message: `Proposal already linked to tally stage "${existing.title}"`,
        };
      }
      await updateTallyProposalId(stageId, proposalId);
    } else {
      // Check unique constraint
      const existing = await getSnapshotStageByProposalId(proposalId);
      if (existing) {
        return {
          success: false,
          message: `Proposal already linked to snapshot stage "${existing.title}"`,
        };
      }
      await updateSnapshotProposalId(stageId, proposalId);
    }
    return { success: true, message: "Match applied successfully" };
  } catch (error) {
    return { success: false, message: `Error: ${error}` };
  }
}

/**
 * Apply multiple matches at once
 * Only applies matches with confidence >= minConfidence
 */
export async function applyMatches(
  matches: MatchRecommendation[],
  minConfidence: number = 85
): Promise<{
  applied: number;
  skipped: number;
  errors: string[];
}> {
  const results = { applied: 0, skipped: 0, errors: [] as string[] };

  for (const match of matches) {
    // Skip low confidence matches
    if (match.confidence < minConfidence) {
      results.skipped++;
      continue;
    }

    const result = await applyMatch(
      match.stage_id,
      match.stage_type,
      match.proposal_id
    );

    if (result.success) {
      results.applied++;
      console.log(
        `Applied: ${match.stage_type} "${match.stage_title}" → "${match.proposal_title}" (${match.confidence}%)`
      );
    } else {
      results.skipped++;
      results.errors.push(`${match.stage_title}: ${result.message}`);
    }
  }

  return results;
}

// ============================================================================
// HELPER: Decode HTML entities for comparison
// ============================================================================

export function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'");
}

// ============================================================================
// HELPER: Extract IDs from URLs
// ============================================================================

export function extractForumTopicId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/t\/[^/]+\/(\d+)/);
  return match ? match[1] : null;
}

export function extractSnapshotId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/proposal\/([^/?\s]+)/);
  return match ? match[1] : null;
}
