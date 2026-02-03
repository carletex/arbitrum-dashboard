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
import { getSnapshotStageBySnapshotId, updateSnapshotProposalId } from "../database/repositories/snapshot";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load environment variables before importing database modules
dotenv.config({ path: path.resolve(__dirname, "../../.env.development") });

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

interface ImportResult {
  matched: number;
  updated: number;
  notFound: number;
  skipped: number;
  alreadyLinked: number;
  forumNotFound: number;
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
 * @param dryRun - If true, only log what would be done without making changes
 */
export async function importSnapshotMatchesFromCsv(dryRun: boolean = false): Promise<ImportResult> {
  const result: ImportResult = {
    matched: 0,
    updated: 0,
    notFound: 0,
    skipped: 0,
    alreadyLinked: 0,
    forumNotFound: 0,
    errors: [],
  };

  // Load CSV
  const csvPath = path.join(__dirname, "data", "snapshot_matches.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(csvContent);
  console.log(`Loaded ${rows.length} rows from CSV`);

  for (const row of rows) {
    const snapshotId = extractSnapshotId(row.snapshot_url);
    const forumUrl = getEffectiveForumUrl(row);
    const isManualOverride = row.manual_forum_url && row.manual_forum_url.includes("forum.arbitrum.foundation");

    // Skip rows without valid snapshot URL
    if (!snapshotId) {
      result.skipped++;
      continue;
    }

    // Skip rows without forum_url (intentionally no match)
    if (!forumUrl) {
      result.skipped++;
      continue;
    }

    result.matched++;

    try {
      // Find snapshot_stage by snapshot_id using repository function
      const existingSnapshot = await getSnapshotStageBySnapshotId(snapshotId);

      if (!existingSnapshot) {
        console.log(`Snapshot not found in DB: ${snapshotId} (${row.snapshot_title?.slice(0, 50)}...)`);
        result.notFound++;
        continue;
      }

      // Find forum_stage by URL to get the proposal_id
      const forumStage = await getForumStageByUrl(forumUrl);

      if (!forumStage) {
        console.log(`Forum not found in DB: ${forumUrl} (for snapshot: ${row.snapshot_title?.slice(0, 40)}...)`);
        result.forumNotFound++;
        continue;
      }

      const proposalId = forumStage.proposal_id;

      if (!proposalId) {
        console.log(`Forum has no proposal_id: ${forumUrl}`);
        result.forumNotFound++;
        continue;
      }

      // Check if already linked to the same proposal
      if (existingSnapshot.proposal_id === proposalId) {
        result.alreadyLinked++;
        continue;
      }

      if (dryRun) {
        const manualNote = isManualOverride ? " [MANUAL]" : "";
        console.log(
          `[DRY RUN] Would link snapshot "${row.snapshot_title?.slice(0, 50)}..." to proposal ${proposalId}${manualNote}`,
        );
        result.updated++;
      } else {
        await updateSnapshotProposalId(existingSnapshot.id, proposalId);

        const manualNote = isManualOverride ? " [MANUAL]" : "";
        console.log(`Updated: "${row.snapshot_title?.slice(0, 50)}..." -> ${proposalId}${manualNote}`);
        result.updated++;
      }
    } catch (error) {
      const errorMessage = `Error processing "${row.snapshot_title}": ${error}`;
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
  console.log(`Errors: ${result.errors.length}`);

  return result;
}

// Allow running as standalone script
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log(`Running snapshot CSV import${dryRun ? " (DRY RUN)" : ""}`);

  importSnapshotMatchesFromCsv(dryRun)
    .then(() => {
      console.log("\nImport completed!");
      process.exit(0);
    })
    .catch(error => {
      console.error("Import failed:", error);
      process.exit(1);
    });
}
