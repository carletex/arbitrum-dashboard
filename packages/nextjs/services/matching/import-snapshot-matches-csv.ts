/**
 * Import verified snapshot matches from CSV into the database
 *
 * Uses URLs as natural keys for production-safe matching:
 * - Finds snapshot_stage by snapshot_id (extracted from snapshot_url)
 * - Finds forum_stage by forum_url to get the proposal_id
 * - Links the snapshot to the proposal
 * - Supports manual_forum_url for overrides when present
 */
import { getForumStageByUrl } from "../database/repositories/forum";
import { getUnprocessedSnapshotStages, upsertMatchingResult } from "../database/repositories/matching";
import { getSnapshotStageBySnapshotId, updateSnapshotProposalId } from "../database/repositories/snapshot";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load environment variables before importing database modules
dotenv.config({ path: path.resolve(__dirname, "../../.env.development") });

const SNAPSHOT_CSV_URL = "https://drive.google.com/uc?export=download&id=1s5hgZbp2WTdhPQicb0APSpwKweb9EyER";
const SNAPSHOT_LLM_JSON_URL = "https://drive.google.com/uc?export=download&id=1tOWq1lAKFmbLP-oZgRAA59Brz3rtE7d9";

async function readFileContent(localPath: string, driveUrl: string): Promise<string> {
  console.log(`Downloading from: ${driveUrl}`);
  const res = await fetch(driveUrl);
  if (!res.ok) {
    throw new Error(`Failed to download: ${driveUrl} (status ${res.status})`);
  }
  const content = await res.text();

  // Save locally
  const dir = path.dirname(localPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(localPath, content, "utf-8");
  console.log(`Saved to: ${localPath}`);

  return content;
}

interface SnapshotCsvRow {
  snapshot_title: string;
  snapshot_url: string;
  snapshot_status: string;
  proposal_title: string;
  forum_title: string;
  forum_url: string;
  proposal_id: string; // Ignored - we derive this from forum_url lookup
  manual_forum_url?: string;
  manual_proposal_id?: string;
  manual_proposal_title?: string;
}

interface LlmMatchEntry {
  snapshot_id: string;
  title: string;
  canonical_proposal_id: string | null;
  confidence_score: number;
  reasoning: string;
}

interface ImportResult {
  matched: number;
  updated: number;
  notFound: number;
  skipped: number;
  alreadyLinked: number;
  forumNotFound: number;
  noMatch: number;
  noMatchSwept: number;
  errors: string[];
}

/**
 * Extract snapshot_id from snapshot URL
 * Example: https://snapshot.box/#/s:arbitrumfoundation.eth/proposal/0x3be7368a... -> 0x3be7368a...
 */
function extractSnapshotId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/proposal\/(0x[a-fA-F0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Decode common HTML entities in URLs
 */
function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—");
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCsvLine(line: string, delimiter: string = ";"): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Parse CSV content with semicolon delimiter
 */
function parseCsv(content: string): SnapshotCsvRow[] {
  const lines = content.split("\n").filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(h => h.trim().replace(/;$/, ""));
  const rows: SnapshotCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || "";
    });
    rows.push(row as unknown as SnapshotCsvRow);
  }

  return rows;
}

/**
 * Get the effective forum URL from a row, preferring manual override if valid
 */
function getEffectiveForumUrl(row: SnapshotCsvRow): string | null {
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
 * Import snapshot matches from CSV into the database
 */
export async function importSnapshotMatchesFromCsv(): Promise<ImportResult> {
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
  const csvPath = path.join(__dirname, "data", "snapshot_matches.csv");
  const csvContent = await readFileContent(csvPath, SNAPSHOT_CSV_URL);
  const rows = parseCsv(csvContent);
  console.log(`Loaded ${rows.length} rows from CSV`);

  // Load LLM matching results for confidence/reasoning
  const llmResultsMap = new Map<string, { confidence_score: number; reasoning: string }>();
  let llmEntries: LlmMatchEntry[] = [];
  const llmJsonPath = path.join(__dirname, "data", "output-snapshot-matching.json");
  const llmJsonContent = await readFileContent(llmJsonPath, SNAPSHOT_LLM_JSON_URL);
  llmEntries = JSON.parse(llmJsonContent);
  for (const entry of llmEntries) {
    llmResultsMap.set(entry.snapshot_id, {
      confidence_score: entry.confidence_score,
      reasoning: entry.reasoning,
    });
  }
  console.log(`Loaded ${llmResultsMap.size} LLM matching results`);

  for (const row of rows) {
    const snapshotId = extractSnapshotId(row.snapshot_url);
    const forumUrl = getEffectiveForumUrl(row);
    const isManualOverride = !!(row.manual_forum_url && row.manual_forum_url.includes("forum.arbitrum.foundation"));

    // Skip rows without valid snapshot URL
    if (!snapshotId) {
      result.skipped++;
      continue;
    }

    try {
      // Look up snapshot_stage early so we have the ID for all branches
      const existingSnapshot = await getSnapshotStageBySnapshotId(snapshotId);

      if (!existingSnapshot) {
        console.log(`Snapshot not found in DB: ${snapshotId} (${row.snapshot_title?.slice(0, 50)}...)`);
        result.notFound++;
        // No stage row in DB -> no matching_result to record
        continue;
      }

      const llmData = llmResultsMap.get(existingSnapshot.id);

      // No forum_url in CSV -> pending_review
      if (!forumUrl) {
        result.skipped++;
        await upsertMatchingResult({
          source_type: "snapshot",
          source_stage_id: existingSnapshot.id,
          proposal_id: null,
          status: "pending_review",
          method: "csv_import",
          confidence: llmData?.confidence_score ?? null,
          reasoning: llmData?.reasoning ?? null,
          source_title: row.snapshot_title || null,
          source_url: row.snapshot_url || null,
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
            ? `Forum not found in DB: ${forumUrl} (for snapshot: ${row.snapshot_title?.slice(0, 40)}...)`
            : `Forum has no proposal_id: ${forumUrl}`,
        );
        result.forumNotFound++;
        await upsertMatchingResult({
          source_type: "snapshot",
          source_stage_id: existingSnapshot.id,
          proposal_id: null,
          status: "pending_review",
          method: isManualOverride ? "manual_override" : "csv_import",
          confidence: !isManualOverride ? (llmData?.confidence_score ?? null) : null,
          reasoning: !isManualOverride ? (llmData?.reasoning ?? null) : null,
          source_title: row.snapshot_title || null,
          source_url: row.snapshot_url || null,
          matched_forum_url: forumUrl,
        });
        continue;
      }

      const proposalId = forum.proposal_id;

      // Check if already linked to the same proposal
      if (existingSnapshot.proposal_id === proposalId) {
        result.alreadyLinked++;
        await upsertMatchingResult({
          source_type: "snapshot",
          source_stage_id: existingSnapshot.id,
          proposal_id: proposalId,
          status: "matched",
          method: isManualOverride ? "manual_override" : "csv_import",
          confidence: !isManualOverride ? (llmData?.confidence_score ?? null) : null,
          reasoning: !isManualOverride ? (llmData?.reasoning ?? null) : null,
          source_title: row.snapshot_title || null,
          source_url: row.snapshot_url || null,
          matched_forum_url: forumUrl,
        });
        continue;
      }

      await updateSnapshotProposalId(existingSnapshot.id, proposalId);

      await upsertMatchingResult({
        source_type: "snapshot",
        source_stage_id: existingSnapshot.id,
        proposal_id: proposalId,
        status: "matched",
        method: isManualOverride ? "manual_override" : "csv_import",
        confidence: !isManualOverride ? (llmData?.confidence_score ?? null) : null,
        reasoning: !isManualOverride ? (llmData?.reasoning ?? null) : null,
        source_title: row.snapshot_title || null,
        source_url: row.snapshot_url || null,
        matched_forum_url: forumUrl,
      });

      const manualNote = isManualOverride ? " [MANUAL]" : "";
      console.log(`Updated: "${row.snapshot_title?.slice(0, 50)}..." -> ${proposalId}${manualNote}`);
      result.updated++;
    } catch (error) {
      const errorMessage = `Error processing "${row.snapshot_title}": ${error}`;
      console.error(errorMessage);
      result.errors.push(errorMessage);
    }
  }

  // Phase 2: LLM no-match entries (canonical_proposal_id === null in JSON, excluded from CSV)
  const llmNoMatchEntries = llmEntries.filter(entry => entry.canonical_proposal_id === null);
  for (const entry of llmNoMatchEntries) {
    try {
      await upsertMatchingResult({
        source_type: "snapshot",
        source_stage_id: entry.snapshot_id,
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
  const unprocessedStages = await getUnprocessedSnapshotStages();
  for (const row of unprocessedStages) {
    try {
      await upsertMatchingResult({
        source_type: "snapshot",
        source_stage_id: row.snapshotStage.id,
        proposal_id: null,
        status: "no_match",
        method: "csv_import",
        confidence: null,
        reasoning:
          "Excluded from LLM matching — likely a incentive program (STIP/LTIPP), election, or operational vote without a corresponding forum proposal",
        source_title: row.snapshotStage.title || null,
        source_url: row.snapshotStage.url || null,
        matched_forum_url: null,
      });
      result.noMatchSwept++;
    } catch (error) {
      const errorMessage = `Error sweeping unprocessed snapshot "${row.snapshotStage.title}": ${error}`;
      console.error(errorMessage);
      result.errors.push(errorMessage);
    }
  }

  console.log("\n=== Import Summary ===");
  console.log(`Matched in CSV: ${result.matched}`);
  console.log(`Updated: ${result.updated}`);
  console.log(`Already linked: ${result.alreadyLinked}`);
  console.log(`Snapshot not found in DB: ${result.notFound}`);
  console.log(`Forum not found in DB: ${result.forumNotFound}`);
  console.log(`Skipped (no forum_url): ${result.skipped}`);
  console.log(`LLM no-match: ${result.noMatch}`);
  console.log(`Swept unprocessed: ${result.noMatchSwept}`);
  console.log(`Errors: ${result.errors.length}`);

  return result;
}

// Allow running as standalone script
if (require.main === module) {
  console.log("Running snapshot CSV import...");

  importSnapshotMatchesFromCsv()
    .then(() => {
      console.log("\nImport completed!");
      process.exit(0);
    })
    .catch(error => {
      console.error("Import failed:", error);
      process.exit(1);
    });
}
