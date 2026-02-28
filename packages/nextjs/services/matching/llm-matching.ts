/**
 * LLM-based matching for new snapshot/tally stages to canonical proposals.
 *
 * Uses Gemini Flash 2.0 to match unprocessed stages against the full list
 * of canonical proposals, producing structured JSON results.
 */
import {
  getUnprocessedSnapshotStages,
  getUnprocessedTallyStages,
  upsertMatchingResult,
} from "../database/repositories/matching";
import { getAllProposals } from "../database/repositories/proposals";
import { getSnapshotStageById, updateSnapshotProposalId } from "../database/repositories/snapshot";
import { getTallyStageById, updateTallyProposalId } from "../database/repositories/tally";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface LlmMatchResult {
  proposal_id: string | null;
  confidence: string; // "high" | "medium" | "low" | "none"
  confidence_score: number; // 0-100
  reasoning: string;
}

interface StageInfo {
  id: string;
  title: string | null;
  author_name: string | null;
  url: string | null;
}

function buildMatchingPrompt(
  stage: StageInfo,
  allProposals: { id: string; title: string; author_name: string | null }[],
): string {
  const candidateList = allProposals
    .map(p => `- ID: ${p.id} | Title: ${p.title} | Author: ${p.author_name ?? "Unknown"}`)
    .join("\n");

  return `You are matching an on-chain governance stage (from Snapshot or Tally) to its canonical forum proposal.

## Source Stage to Match
- Title: ${stage.title ?? "Unknown"}
- Author: ${stage.author_name ?? "Unknown"}
- URL: ${stage.url ?? "N/A"}

## Candidate Canonical Proposals
${candidateList}

## Instructions
1. Find the canonical proposal that this stage belongs to, based on title similarity, author, and context.
2. Many proposals go through multiple governance stages (forum → snapshot → tally), so titles may differ slightly.
3. Common patterns: AIP prefixes may be added/removed, markdown formatting (#) in titles, slight rewording.
4. Some stages will NOT match any proposal. These include:
   - Security Council elections and member changes
   - STIP/LTIPP individual grant distributions (unless there's a matching umbrella proposal)
   - Operational/constitutional votes that predate the forum tracking
   - Proposals from other DAOs or test proposals

Return a JSON object with these fields:
- "proposal_id": the UUID of the matched canonical proposal, or null if no match
- "confidence": "high", "medium", "low", or "none"
- "confidence_score": integer 0-100
- "reasoning": brief explanation of your matching decision

If no proposal matches, set proposal_id to null, confidence to "none", confidence_score to 0, and explain why in reasoning.`;
}

async function callGeminiFlash(prompt: string): Promise<LlmMatchResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const raw = JSON.parse(text);
  const parsed = (Array.isArray(raw) ? raw[0] : raw) as LlmMatchResult;

  // Validate required fields
  if (typeof parsed.confidence_score !== "number" || typeof parsed.reasoning !== "string") {
    throw new Error(`Invalid LLM response structure: ${text}`);
  }

  // Normalize confidence_score to 0-100 range
  parsed.confidence_score = Math.max(0, Math.min(100, Math.round(parsed.confidence_score)));

  return parsed;
}

export async function matchStage(
  sourceType: "tally" | "snapshot",
  stageId: string,
): Promise<{ status: string; proposalId: string | null }> {
  // Load the stage info
  let stage: StageInfo | undefined;

  if (sourceType === "tally") {
    stage = (await getTallyStageById(stageId)) as StageInfo | undefined;
  } else {
    stage = (await getSnapshotStageById(stageId)) as StageInfo | undefined;
  }

  if (!stage) {
    console.log(`  Stage ${stageId} not found in ${sourceType}_stage table`);
    return { status: "not_found", proposalId: null };
  }

  console.log(`  Matching: "${stage.title}" (${stageId})`);

  // Load all canonical proposals
  const allProposals = await getAllProposals();
  if (allProposals.length === 0) {
    throw new Error("No proposals found in database. Cannot match.");
  }

  // Build prompt and call LLM
  const prompt = buildMatchingPrompt(stage, allProposals);
  const llmResult = await callGeminiFlash(prompt);

  console.log(
    `    → ${llmResult.proposal_id ? "MATCHED" : "NO MATCH"} (score: ${llmResult.confidence_score}, confidence: ${llmResult.confidence})`,
  );
  console.log(`    → ${llmResult.reasoning}`);

  if (llmResult.proposal_id) {
    // Verify the proposal_id actually exists
    const matchedProposal = allProposals.find(p => p.id === llmResult.proposal_id);
    if (!matchedProposal) {
      console.log(
        `    → WARNING: LLM returned non-existent proposal_id ${llmResult.proposal_id}, treating as no-match`,
      );
      llmResult.proposal_id = null;
      llmResult.confidence = "none";
      llmResult.confidence_score = 0;
      llmResult.reasoning += " [proposal_id not found in database - auto-corrected to no-match]";
    }
  }

  const isMatched = llmResult.proposal_id !== null;

  // Update the stage's proposal_id if matched
  if (isMatched && llmResult.proposal_id) {
    if (sourceType === "tally") {
      await updateTallyProposalId(stageId, llmResult.proposal_id);
    } else {
      await updateSnapshotProposalId(stageId, llmResult.proposal_id);
    }
  }

  // Record the matching result
  await upsertMatchingResult({
    source_type: sourceType,
    source_stage_id: stageId,
    proposal_id: llmResult.proposal_id,
    status: isMatched ? "matched" : "no_match",
    method: "llm",
    confidence: llmResult.confidence_score,
    reasoning: llmResult.reasoning,
    source_title: stage.title,
    source_url: stage.url,
  });

  return { status: isMatched ? "matched" : "no_match", proposalId: llmResult.proposal_id };
}

export async function matchAllUnprocessed(sourceType?: "tally" | "snapshot"): Promise<void> {
  const types: ("tally" | "snapshot")[] = sourceType ? [sourceType] : ["tally", "snapshot"];

  for (const type of types) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Processing unprocessed ${type} stages`);
    console.log("=".repeat(60));

    let stages: StageInfo[];

    if (type === "tally") {
      const rows = await getUnprocessedTallyStages();
      stages = rows.map(r => r.tallyStage as StageInfo);
    } else {
      const rows = await getUnprocessedSnapshotStages();
      stages = rows.map(r => r.snapshotStage as StageInfo);
    }

    console.log(`Found ${stages.length} unprocessed ${type} stages\n`);

    if (stages.length === 0) continue;

    let matched = 0;
    let noMatch = 0;
    let errors = 0;

    for (const stage of stages) {
      try {
        const result = await matchStage(type, stage.id);
        if (result.status === "matched") matched++;
        else noMatch++;
      } catch (err) {
        errors++;
        console.error(`  ERROR matching stage ${stage.id}: ${err}`);
      }
    }

    console.log(`\n--- ${type.toUpperCase()} Summary ---`);
    console.log(`  Matched: ${matched}`);
    console.log(`  No match: ${noMatch}`);
    console.log(`  Errors: ${errors}`);
    console.log(`  Total: ${stages.length}`);
  }
}
