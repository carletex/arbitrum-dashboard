/**
 * Import verified tally matches from CSV into the database
 *
 * Uses URLs as natural keys for production-safe matching:
 * - Finds tally_stage by onchain_id (extracted from tally_url)
 * - Finds forum_stage by forum_url to get the proposal_id
 * - Links the tally to the proposal
 */
import { getForumStageByUrl } from "../database/repositories/forum";
import { getUnprocessedTallyStages, upsertMatchingResult } from "../database/repositories/matching";
import { getTallyStageByOnchainId, updateTallyProposalId } from "../database/repositories/tally";
import { ImportResult, decodeHtmlEntities, parseCsvLine, readFileContent } from "./csv-utils";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables before importing database modules
dotenv.config({ path: path.resolve(__dirname, "../../.env.development") });

const TALLY_CSV_URL = "https://drive.google.com/uc?export=download&id=1yH0BcHPPPu205HvDfWRLHYakL-i2V-Fl";
const TALLY_LLM_JSON_URL = "https://drive.google.com/uc?export=download&id=1r9x6jfa_X7il2DcwExtaf-QrljNDA94N";

interface TallyCsvRow {
  tally_title: string;
  tally_url: string;
  proposal_title: string;
  forum_title: string;
  forum_url: string;
  proposal_id: string; // Ignored - we derive this from forum_url lookup
  manual_forum_url?: string;
  manual_proposal_id?: string;
  manual_proposal_name?: string;
}

interface LlmMatchEntry {
  tally_id: string;
  title: string;
  canonical_proposal_id: string | null;
  confidence_score: number;
  reasoning: string;
}

/**
 * Extract onchain_id from tally URL
 * Example: https://www.tally.xyz/gov/arbitrum/proposal/71941171835710778457735937894689629320431683601089057868136768380925169329077
 * -> 71941171835710778457735937894689629320431683601089057868136768380925169329077
 */
function extractOnchainId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/proposal\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Parse CSV content with semicolon delimiter
 */
function parseCsv(content: string): TallyCsvRow[] {
  const lines = content.split("\n").filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(h => h.trim().replace(/;$/, ""));
  const rows: TallyCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || "";
    });
    rows.push(row as unknown as TallyCsvRow);
  }

  return rows;
}

/**
 * Get the effective forum URL from a row, preferring manual override if valid
 */
function getEffectiveForumUrl(row: TallyCsvRow): string | null {
  // Check manual_forum_url first (if it's a valid forum URL)
  if (row.manual_forum_url && row.manual_forum_url.includes("forum.arbitrum.foundation")) {
    return decodeHtmlEntities(row.manual_forum_url.trim());
  }
  // Fall back to regular forum_url
  if (row.forum_url && row.forum_url.includes("forum.arbitrum.foundation")) {
    return decodeHtmlEntities(row.forum_url.trim());
  }
  return null;
}

/**
 * Import tally matches from CSV into the database
 */
export async function importTallyMatchesFromCsv(): Promise<ImportResult> {
  const result: ImportResult = {
    matched: 0,
    updated: 0,
    notFound: 0,
    skipped: 0,
    alreadyLinked: 0,
    forumNotFound: 0,
    noMatch: 0,
    noMatchSwept: 0,
    errors: [],
  };

  // Load CSV
  const csvPath = path.join(__dirname, "data", "tally_matches.csv");
  const csvContent = await readFileContent(csvPath, TALLY_CSV_URL);
  const rows = parseCsv(csvContent);
  console.log(`Loaded ${rows.length} rows from CSV`);

  // Load LLM matching results for confidence/reasoning
  const llmResultsMap = new Map<string, { confidence_score: number; reasoning: string }>();
  let llmEntries: LlmMatchEntry[] = [];
  const llmJsonPath = path.join(__dirname, "data", "output-tally-matching.json");
  const llmJsonContent = await readFileContent(llmJsonPath, TALLY_LLM_JSON_URL);
  llmEntries = JSON.parse(llmJsonContent);
  for (const entry of llmEntries) {
    llmResultsMap.set(entry.title?.trim(), {
      confidence_score: entry.confidence_score,
      reasoning: entry.reasoning,
    });
  }
  console.log(`Loaded ${llmResultsMap.size} LLM matching results`);

  for (const row of rows) {
    const onchainId = extractOnchainId(row.tally_url);
    const forumUrl = getEffectiveForumUrl(row);
    const isManualOverride = !!(row.manual_forum_url && row.manual_forum_url.includes("forum.arbitrum.foundation"));

    // Skip rows without valid tally URL
    if (!onchainId) {
      result.skipped++;
      continue;
    }

    try {
      // Look up tally_stage early so we have the ID for all branches
      const existingTally = await getTallyStageByOnchainId(onchainId);

      if (!existingTally) {
        console.log(`Tally not found in DB: ${onchainId} (${row.tally_title?.slice(0, 50)}...)`);
        result.notFound++;
        // No stage row in DB -> no matching_result to record
        continue;
      }

      const llmData = llmResultsMap.get(row.tally_title?.trim());

      // No forum_url in CSV -> pending_review
      if (!forumUrl) {
        result.skipped++;
        await upsertMatchingResult({
          source_type: "tally",
          source_stage_id: existingTally.id,
          proposal_id: null,
          status: "pending_review",
          method: "csv_import",
          confidence: llmData?.confidence_score ?? null,
          reasoning: llmData?.reasoning ?? null,
          source_title: row.tally_title || null,
          source_url: row.tally_url || null,
          matched_forum_url: null,
        });
        continue;
      }

      result.matched++;

      // Find forum_stage by URL to get the proposal_id
      const forum = await getForumStageByUrl(forumUrl);

      if (!forum || !forum.proposal_id) {
        console.log(
          !forum
            ? `Forum not found in DB: ${forumUrl} (for tally: ${row.tally_title?.slice(0, 40)}...)`
            : `Forum has no proposal_id: ${forumUrl}`,
        );
        result.forumNotFound++;
        await upsertMatchingResult({
          source_type: "tally",
          source_stage_id: existingTally.id,
          proposal_id: null,
          status: "pending_review",
          method: isManualOverride ? "manual_override" : "csv_import",
          confidence: !isManualOverride ? (llmData?.confidence_score ?? null) : null,
          reasoning: !isManualOverride ? (llmData?.reasoning ?? null) : null,
          source_title: row.tally_title || null,
          source_url: row.tally_url || null,
          matched_forum_url: forumUrl,
        });
        continue;
      }

      const proposalId = forum.proposal_id;

      // Check if already linked to the same proposal
      if (existingTally.proposal_id === proposalId) {
        result.alreadyLinked++;
        await upsertMatchingResult({
          source_type: "tally",
          source_stage_id: existingTally.id,
          proposal_id: proposalId,
          status: "matched",
          method: isManualOverride ? "manual_override" : "csv_import",
          confidence: !isManualOverride ? (llmData?.confidence_score ?? null) : null,
          reasoning: !isManualOverride ? (llmData?.reasoning ?? null) : null,
          source_title: row.tally_title || null,
          source_url: row.tally_url || null,
          matched_forum_url: forumUrl,
        });
        continue;
      }

      await updateTallyProposalId(existingTally.id, proposalId);

      await upsertMatchingResult({
        source_type: "tally",
        source_stage_id: existingTally.id,
        proposal_id: proposalId,
        status: "matched",
        method: isManualOverride ? "manual_override" : "csv_import",
        confidence: !isManualOverride ? (llmData?.confidence_score ?? null) : null,
        reasoning: !isManualOverride ? (llmData?.reasoning ?? null) : null,
        source_title: row.tally_title || null,
        source_url: row.tally_url || null,
        matched_forum_url: forumUrl,
      });

      const manualNote = isManualOverride ? " [MANUAL]" : "";
      console.log(`Updated: "${row.tally_title?.slice(0, 50)}..." -> ${proposalId}${manualNote}`);
      result.updated++;
    } catch (error) {
      const errorMessage = `Error processing "${row.tally_title}": ${error}`;
      console.error(errorMessage);
      result.errors.push(errorMessage);
    }
  }

  // Phase 2: LLM no-match entries (canonical_proposal_id === null in JSON, excluded from CSV)
  const llmNoMatchEntries = llmEntries.filter(entry => entry.canonical_proposal_id === null);
  for (const entry of llmNoMatchEntries) {
    try {
      await upsertMatchingResult({
        source_type: "tally",
        source_stage_id: entry.tally_id,
        proposal_id: null,
        status: "no_match",
        method: "csv_import",
        confidence: entry.confidence_score ?? null,
        reasoning: entry.reasoning ?? null,
        source_title: entry.title || null,
        source_url: null,
        matched_forum_url: null,
      });
      result.noMatch++;
    } catch (error) {
      const errorMessage = `Error processing LLM no-match "${entry.title}": ${error}`;
      console.error(errorMessage);
      result.errors.push(errorMessage);
    }
  }

  // Phase 3: Sweep unprocessed stages (no matching_result record at all)
  const unprocessedStages = await getUnprocessedTallyStages();
  for (const row of unprocessedStages) {
    try {
      await upsertMatchingResult({
        source_type: "tally",
        source_stage_id: row.tallyStage.id,
        proposal_id: null,
        status: "no_match",
        method: "csv_import",
        confidence: null,
        reasoning:
          "Excluded from LLM matching — likely an incentive program (STIP/LTIPP), election, or operational vote without a corresponding forum proposal",
        source_title: row.tallyStage.title || null,
        source_url: row.tallyStage.url || null,
        matched_forum_url: null,
      });
      result.noMatchSwept++;
    } catch (error) {
      const errorMessage = `Error sweeping unprocessed tally "${row.tallyStage.title}": ${error}`;
      console.error(errorMessage);
      result.errors.push(errorMessage);
    }
  }

  console.log("\n=== Import Summary ===");
  console.log(`Matched in CSV: ${result.matched}`);
  console.log(`Updated: ${result.updated}`);
  console.log(`Already linked: ${result.alreadyLinked}`);
  console.log(`Tally not found in DB: ${result.notFound}`);
  console.log(`Forum not found in DB: ${result.forumNotFound}`);
  console.log(`Skipped (no forum_url): ${result.skipped}`);
  console.log(`LLM no-match: ${result.noMatch}`);
  console.log(`Swept unprocessed: ${result.noMatchSwept}`);
  console.log(`Errors: ${result.errors.length}`);

  return result;
}

// Allow running as standalone script
if (require.main === module) {
  console.log("Running tally CSV import...");

  importTallyMatchesFromCsv()
    .then(() => {
      console.log("\nImport completed!");
      process.exit(0);
    })
    .catch(error => {
      console.error("Import failed:", error);
      process.exit(1);
    });
}
