/**
 * Core matching service for linking proposals across stages
 */

import { createProposal } from "../database/repositories/proposals";
import {
  getAllForumStages,
  getForumStageByOriginalId,
} from "../database/repositories/forum";
import {
  getAllSnapshotStages,
  getAllSnapshotStagesWithoutProposal,
  getSnapshotStageByProposalId,
  getSnapshotStageBySnapshotId,
  updateSnapshotProposalId,
} from "../database/repositories/snapshot";
import {
  getAllTallyStagesWithoutProposal,
  getTallyStageByProposalId,
  updateTallyProposalId,
} from "../database/repositories/tally";
import {
  calculateSimilarity,
  extractForumLinks,
  extractForumTopicId,
  extractSnapshotId,
  getMatchConfidence,
  isSameAuthor,
  isElectionTitle,
  isGenericForumSlug,
  isStipLtippProtocolTitle,
  normalizeTitle,
  titleToSlug,
} from "./utils";

const CONFIDENCE_THRESHOLD = 90;
const MIN_TITLE_LENGTH = 10;
const MIN_LINK_CONFIDENCE = 85;

export interface MatchingReport {
  timestamp: Date;
  matched: {
    tallyViaDiscourseUrl: number;
    tallyViaSnapshotUrl: number;
    tallyViaForumLink: number;
    snapshotViaTitle: number;
    snapshotViaForumLink: number;
    orphansLinked: number;
  };
  unmatched: {
    tally: number;
    snapshot: number;
  };
  lowConfidenceSkipped: Array<{
    stageType: string;
    title: string | null;
    potentialMatch: string | null;
    confidence: number;
    matchMethod: string;
  }>;
}

/**
 * Main matching orchestrator
 */
export async function matchProposalsAcrossStages(): Promise<MatchingReport> {
  console.log("Starting proposal matching process...");

  const report: MatchingReport = {
    timestamp: new Date(),
    matched: {
      tallyViaDiscourseUrl: 0,
      tallyViaSnapshotUrl: 0,
      tallyViaForumLink: 0,
      snapshotViaTitle: 0,
      snapshotViaForumLink: 0,
      orphansLinked: 0,
    },
    unmatched: {
      tally: 0,
      snapshot: 0,
    },
    lowConfidenceSkipped: [],
  };

  // Step 1: Match Tally → Forum via discourse_url
  console.log("Step 1: Matching Tally stages to Forum via discourse_url...");
  await matchTallyToForumViaUrl(report);

  // Step 1b: Match Tally → Forum via description links
  console.log("Step 1b: Matching Tally stages to Forum via description links...");
  await matchTallyToForumViaDescription(report);

  // Step 2: Match Tally → Snapshot via snapshot_url
  console.log("Step 2: Matching Tally stages to Snapshot via snapshot_url...");
  await matchTallyToSnapshotViaUrl(report);

  // Step 3: Match Snapshot → Forum via fuzzy title matching
  console.log("Step 3: Matching Snapshot stages to Forum via title...");
  await matchSnapshotToForumViaTitle(report);

  // Step 4: Create orphan proposals for linked Tally-Snapshot pairs
  console.log("Step 4: Creating proposals for orphaned Tally-Snapshot pairs...");
  await createOrphanProposals(report);

  // Step 5: Count remaining unmatched stages
  const unmatchedTally = await getAllTallyStagesWithoutProposal();
  const unmatchedSnapshot = await getAllSnapshotStagesWithoutProposal();
  report.unmatched.tally = unmatchedTally.length;
  report.unmatched.snapshot = unmatchedSnapshot.length;

  console.log("Matching process completed!");
  console.log(`Matched: ${JSON.stringify(report.matched)}`);
  console.log(`Unmatched: ${JSON.stringify(report.unmatched)}`);
  console.log(`Low confidence skipped: ${report.lowConfidenceSkipped.length}`);

  return report;
}

/**
 * Step 1: Match Tally → Forum via discourse_url
 */
async function matchTallyToForumViaUrl(report: MatchingReport) {
  const tallyStages = await getAllTallyStagesWithoutProposal();

  for (const tallyStage of tallyStages) {
    // Skip if no discourse_url
    if (!tallyStage.discourse_url) continue;

    // Extract forum topic ID from URL
    const topicId = extractForumTopicId(tallyStage.discourse_url);
    if (!topicId) continue;

    // Find forum stage by original_id
    const forumStage = await getForumStageByOriginalId(topicId);
    if (!forumStage || !forumStage.proposal_id) continue;

    // Check if this proposal is already linked to another tally stage (unique constraint)
    const existingTallyLink = await getTallyStageByProposalId(forumStage.proposal_id);
    if (existingTallyLink) {
      console.log(`Skipping Tally "${tallyStage.title}" - proposal already linked to "${existingTallyLink.title}"`);
      continue;
    }

    // Link tally to forum's proposal
    await updateTallyProposalId(tallyStage.id, forumStage.proposal_id);
    report.matched.tallyViaDiscourseUrl++;

    console.log(`Matched Tally "${tallyStage.title}" to Forum via discourse_url (confidence: 100)`);
  }
}

/**
 * Step 1b: Match Tally → Forum via links in description
 */
async function matchTallyToForumViaDescription(report: MatchingReport) {
  const tallyStages = await getAllTallyStagesWithoutProposal();
  const forumStages = await getAllForumStages();

  const forumByTopicId = new Map(
    forumStages
      .filter(f => f.original_id && f.proposal_id)
      .map(f => [f.original_id!, f]),
  );

  const forumBySlug = forumStages
    .filter(f => f.title && f.proposal_id)
    .map(f => ({
      forumStage: f,
      slug: titleToSlug(f.title),
    }))
    .filter(f => f.slug.length > 0);

  for (const tallyStage of tallyStages) {
    if (!tallyStage.description) continue;

    const forumLinks = extractForumLinks(tallyStage.description);
    if (!forumLinks.length) continue;

    let bestMatch: { forumStage: (typeof forumStages)[0]; confidence: number; method: string } | null = null;

    for (const [slug, topicId] of forumLinks) {
      if (topicId && forumByTopicId.has(topicId)) {
        const forumStage = forumByTopicId.get(topicId)!;
        const confidence = getMatchConfidence({ matchMethod: "url" });
        bestMatch = { forumStage, confidence, method: "forum_link_topic_id" };
        break;
      }

      if (isGenericForumSlug(slug)) continue;

      for (const forumCandidate of forumBySlug) {
        const similarity = calculateSimilarity(slug.replace(/-/g, " "), forumCandidate.forumStage.title);
        const confidence = getMatchConfidence({
          matchMethod: "forum_link",
          titleSimilarity: similarity,
          sameAuthor: isSameAuthor(tallyStage.author_name, forumCandidate.forumStage.author_name),
        });

        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { forumStage: forumCandidate.forumStage, confidence, method: "forum_link_slug" };
        }
      }
    }

    if (bestMatch && bestMatch.confidence >= MIN_LINK_CONFIDENCE) {
      const existingTallyLink = await getTallyStageByProposalId(bestMatch.forumStage.proposal_id!);
      if (existingTallyLink) {
        console.log(
          `Skipping Tally "${tallyStage.title}" - proposal already linked to "${existingTallyLink.title}"`,
        );
        continue;
      }

      await updateTallyProposalId(tallyStage.id, bestMatch.forumStage.proposal_id!);
      report.matched.tallyViaForumLink++;

      console.log(
        `Matched Tally "${tallyStage.title}" to Forum "${bestMatch.forumStage.title}" via description link (confidence: ${bestMatch.confidence})`,
      );
    } else if (bestMatch && bestMatch.confidence > 70) {
      report.lowConfidenceSkipped.push({
        stageType: "tally",
        title: tallyStage.title,
        potentialMatch: bestMatch.forumStage.title,
        confidence: bestMatch.confidence,
        matchMethod: bestMatch.method,
      });
    }
  }
}

/**
 * Step 2: Match Tally → Snapshot via snapshot_url
 */
async function matchTallyToSnapshotViaUrl(report: MatchingReport) {
  const tallyStages = await getAllTallyStagesWithoutProposal();

  for (const tallyStage of tallyStages) {
    // Skip if no snapshot_url
    if (!tallyStage.snapshot_url) continue;

    // Extract snapshot ID from URL
    const snapshotId = extractSnapshotId(tallyStage.snapshot_url);
    if (!snapshotId) continue;

    // Find snapshot stage by snapshot_id
    const snapshotStage = await getSnapshotStageBySnapshotId(snapshotId);
    if (!snapshotStage) continue;

    // If snapshot already has a proposal_id, use it
    if (snapshotStage.proposal_id) {
      // Check if this proposal is already linked to another tally stage (unique constraint)
      const existingTallyLink = await getTallyStageByProposalId(snapshotStage.proposal_id);
      if (existingTallyLink) {
        console.log(`Skipping Tally "${tallyStage.title}" - proposal already linked to "${existingTallyLink.title}"`);
        continue;
      }

      await updateTallyProposalId(tallyStage.id, snapshotStage.proposal_id);
      report.matched.tallyViaSnapshotUrl++;

      console.log(`Matched Tally "${tallyStage.title}" to Snapshot via snapshot_url (confidence: 100)`);
    }
    // Otherwise, leave for Step 4 to create orphan proposal
  }
}

/**
 * Step 3: Match Snapshot → Forum via fuzzy title matching
 */
async function matchSnapshotToForumViaTitle(report: MatchingReport) {
  const snapshotStages = await getAllSnapshotStagesWithoutProposal();
  const forumStages = await getAllForumStages();

  const forumByTopicId = new Map(
    forumStages
      .filter(f => f.original_id && f.proposal_id)
      .map(f => [f.original_id!, f]),
  );

  const forumBySlug = forumStages
    .filter(f => f.title && f.proposal_id)
    .map(f => ({
      forumStage: f,
      slug: titleToSlug(f.title),
    }))
    .filter(f => f.slug.length > 0);

  for (const snapshotStage of snapshotStages) {
    if (isStipLtippProtocolTitle(snapshotStage.title) || isElectionTitle(snapshotStage.title)) {
      continue;
    }

    if (snapshotStage.body) {
      const forumLinks = extractForumLinks(snapshotStage.body);
      if (forumLinks.length) {
        let bestLinkMatch: { forumStage: (typeof forumStages)[0]; confidence: number; method: string } | null = null;

        for (const [slug, topicId] of forumLinks) {
          if (topicId && forumByTopicId.has(topicId)) {
            const forumStage = forumByTopicId.get(topicId)!;
            const confidence = getMatchConfidence({ matchMethod: "url" });
            bestLinkMatch = { forumStage, confidence, method: "forum_link_topic_id" };
            break;
          }

          if (isGenericForumSlug(slug)) continue;

          for (const forumCandidate of forumBySlug) {
            const similarity = calculateSimilarity(slug.replace(/-/g, " "), forumCandidate.forumStage.title);
            const confidence = getMatchConfidence({
              matchMethod: "forum_link",
              titleSimilarity: similarity,
              sameAuthor: isSameAuthor(snapshotStage.author_name, forumCandidate.forumStage.author_name),
            });

            if (!bestLinkMatch || confidence > bestLinkMatch.confidence) {
              bestLinkMatch = { forumStage: forumCandidate.forumStage, confidence, method: "forum_link_slug" };
            }
          }
        }

        if (bestLinkMatch && bestLinkMatch.confidence >= MIN_LINK_CONFIDENCE) {
          const existingSnapshotLink = await getSnapshotStageByProposalId(bestLinkMatch.forumStage.proposal_id!);
          if (existingSnapshotLink) {
            console.log(
              `Skipping Snapshot "${snapshotStage.title}" - proposal already linked to "${existingSnapshotLink.title}"`,
            );
            continue;
          }

          await updateSnapshotProposalId(snapshotStage.id, bestLinkMatch.forumStage.proposal_id!);
          report.matched.snapshotViaForumLink++;

          console.log(
            `Matched Snapshot "${snapshotStage.title}" to Forum "${bestLinkMatch.forumStage.title}" via body link (confidence: ${bestLinkMatch.confidence})`,
          );
          continue;
        } else if (bestLinkMatch && bestLinkMatch.confidence > 70) {
          report.lowConfidenceSkipped.push({
            stageType: "snapshot",
            title: snapshotStage.title,
            potentialMatch: bestLinkMatch.forumStage.title,
            confidence: bestLinkMatch.confidence,
            matchMethod: bestLinkMatch.method,
          });
        }
      }
    }

    // Skip if title is too short
    if (!snapshotStage.title || normalizeTitle(snapshotStage.title).length < MIN_TITLE_LENGTH) {
      continue;
    }

    let bestMatch: { forumStage: typeof forumStages[0]; confidence: number } | null = null;

    // Compare with all forum titles
    for (const forumStage of forumStages) {
      if (!forumStage.title || !forumStage.proposal_id) continue;

      const similarity = calculateSimilarity(snapshotStage.title, forumStage.title);
      const sameAuthor = isSameAuthor(snapshotStage.author_name, forumStage.author_name);

      // Determine match method
      let matchMethod: "exact_title" | "fuzzy_title";
      if (similarity === 100) {
        matchMethod = "exact_title";
      } else {
        matchMethod = "fuzzy_title";
      }

      const confidence = getMatchConfidence({
        matchMethod,
        titleSimilarity: similarity,
        sameAuthor,
      });

      // Track best match
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { forumStage, confidence };
      }
    }

    // Link if confidence is above threshold
    if (bestMatch && bestMatch.confidence >= CONFIDENCE_THRESHOLD) {
      // Check if this proposal is already linked to another snapshot stage (unique constraint)
      const existingSnapshotLink = await getSnapshotStageByProposalId(bestMatch.forumStage.proposal_id!);
      if (existingSnapshotLink) {
        console.log(`Skipping Snapshot "${snapshotStage.title}" - proposal already linked to "${existingSnapshotLink.title}"`);
        continue;
      }

      await updateSnapshotProposalId(snapshotStage.id, bestMatch.forumStage.proposal_id!);
      report.matched.snapshotViaTitle++;

      console.log(
        `Matched Snapshot "${snapshotStage.title}" to Forum "${bestMatch.forumStage.title}" (confidence: ${bestMatch.confidence})`,
      );
    } else if (bestMatch && bestMatch.confidence > 75) {
      // Log low-confidence matches for review
      report.lowConfidenceSkipped.push({
        stageType: "snapshot",
        title: snapshotStage.title,
        potentialMatch: bestMatch.forumStage.title,
        confidence: bestMatch.confidence,
        matchMethod: "title_fuzzy",
      });
    }
  }
}

/**
 * Step 4: Create orphan proposals for Tally-Snapshot pairs without a proposal
 */
async function createOrphanProposals(report: MatchingReport) {
  const tallyStages = await getAllTallyStagesWithoutProposal();
  const snapshotStages = await getAllSnapshotStages();

  for (const tallyStage of tallyStages) {
    // Skip if no snapshot_url
    if (!tallyStage.snapshot_url) continue;

    // Extract snapshot ID
    const snapshotId = extractSnapshotId(tallyStage.snapshot_url);
    if (!snapshotId) continue;

    // Find matching snapshot stage
    const snapshotStage = snapshotStages.find(s => s.snapshot_id === snapshotId);
    if (!snapshotStage) continue;

    // Skip if either already has a proposal_id
    if (tallyStage.proposal_id || snapshotStage.proposal_id) continue;

    // Create new proposal
    const newProposal = await createProposal({
      title: tallyStage.title || snapshotStage.title || "Untitled Proposal",
      author_name: tallyStage.author_name || snapshotStage.author_name,
      category: null,
    });

    // Link both stages to the new proposal
    await updateTallyProposalId(tallyStage.id, newProposal.id);
    await updateSnapshotProposalId(snapshotStage.id, newProposal.id);

    report.matched.orphansLinked++;

    console.log(
      `Created orphan proposal "${newProposal.title}" linking Tally and Snapshot stages`,
    );
  }
}
