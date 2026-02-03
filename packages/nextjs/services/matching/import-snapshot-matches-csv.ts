/**
 * Import verified snapshot matches from CSV into the database
 *
 * Uses URLs as natural keys for production-safe matching:
 * - Extracts snapshot_id from snapshot_url
 * - Uses proposal_id from CSV (which comes from forum lookup)
 * - Supports manual_* fields for overrides when present and valid
 */
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
  proposal_id: string;
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
 * Parse CSV content with semicolon delimiter
 */
function parseCsv(content: string): SnapshotCsvRow[] {
  const lines = content.split("\n").filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(";").map(h => h.trim().replace(/;$/, ""));
  const rows: SnapshotCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(";");
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || "";
    });
    rows.push(row as unknown as SnapshotCsvRow);
  }

  return rows;
}

/**
 * Get the effective proposal_id from a row, preferring manual override if valid
 */
function getEffectiveProposalId(row: SnapshotCsvRow): string | null {
  // Check manual_proposal_id first (if it's a valid UUID)
  if (row.manual_proposal_id && isValidUuid(row.manual_proposal_id)) {
    return row.manual_proposal_id.trim();
  }
  // Fall back to regular proposal_id
  if (row.proposal_id && isValidUuid(row.proposal_id)) {
    return row.proposal_id.trim();
  }
  return null;
}

function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value.trim());
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
    const proposalId = getEffectiveProposalId(row);

    // Skip rows without valid data
    if (!snapshotId) {
      result.skipped++;
      continue;
    }

    if (!proposalId) {
      // No proposal_id means this snapshot has no match (intentional)
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

      // Check if already linked to the same proposal
      if (existingSnapshot.proposal_id === proposalId) {
        result.alreadyLinked++;
        continue;
      }

      if (dryRun) {
        const manualNote = row.manual_proposal_id ? " [MANUAL]" : "";
        console.log(
          `[DRY RUN] Would link snapshot "${row.snapshot_title?.slice(0, 50)}..." to proposal ${proposalId}${manualNote}`,
        );
        result.updated++;
      } else {
        await updateSnapshotProposalId(existingSnapshot.id, proposalId);

        const manualNote = row.manual_proposal_id ? " [MANUAL]" : "";
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
  console.log(`Not found in DB: ${result.notFound}`);
  console.log(`Skipped (no match): ${result.skipped}`);
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
