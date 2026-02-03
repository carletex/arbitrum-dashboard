/**
 * Import verified tally matches from CSV into the database
 *
 * Uses URLs as natural keys for production-safe matching:
 * - Extracts tally_proposal_id from tally_url
 * - Uses proposal_id from CSV (which comes from forum lookup)
 * - Ignores manual_* fields (as per user request - they are invalid for tally)
 */
import { getTallyStageByTallyProposalId, updateTallyProposalId } from "../database/repositories/tally";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load environment variables before importing database modules
dotenv.config({ path: path.resolve(__dirname, "../../.env.development") });

interface TallyCsvRow {
  tally_title: string;
  tally_url: string;
  proposal_title: string;
  forum_title: string;
  forum_url: string;
  proposal_id: string;
  // manual_* fields are ignored for tally
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
 * Extract tally_proposal_id from tally URL
 * Example: https://www.tally.xyz/gov/arbitrum/proposal/71941171835710778457735937894689629320431683601089057868136768380925169329077
 * -> 71941171835710778457735937894689629320431683601089057868136768380925169329077
 */
function extractTallyProposalId(url: string): string | null {
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

  const headers = lines[0].split(";").map(h => h.trim().replace(/;$/, ""));
  const rows: TallyCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(";");
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || "";
    });
    rows.push(row as unknown as TallyCsvRow);
  }

  return rows;
}

function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value.trim());
}

/**
 * Import tally matches from CSV into the database
 * @param dryRun - If true, only log what would be done without making changes
 */
export async function importTallyMatchesFromCsv(dryRun: boolean = false): Promise<ImportResult> {
  const result: ImportResult = {
    matched: 0,
    updated: 0,
    notFound: 0,
    skipped: 0,
    alreadyLinked: 0,
    errors: [],
  };

  // Load CSV
  const csvPath = path.join(__dirname, "data", "tally_matches.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(csvContent);
  console.log(`Loaded ${rows.length} rows from CSV`);

  for (const row of rows) {
    const tallyProposalId = extractTallyProposalId(row.tally_url);
    const proposalId = isValidUuid(row.proposal_id) ? row.proposal_id.trim() : null;

    // Skip rows without valid data
    if (!tallyProposalId) {
      result.skipped++;
      continue;
    }

    if (!proposalId) {
      // No proposal_id means this tally has no match (intentional)
      result.skipped++;
      continue;
    }

    result.matched++;

    try {
      // Find tally_stage by tally_proposal_id using repository function
      const existingTally = await getTallyStageByTallyProposalId(tallyProposalId);

      if (!existingTally) {
        console.log(`Tally not found in DB: ${tallyProposalId} (${row.tally_title?.slice(0, 50)}...)`);
        result.notFound++;
        continue;
      }

      // Check if already linked to the same proposal
      if (existingTally.proposal_id === proposalId) {
        result.alreadyLinked++;
        continue;
      }

      if (dryRun) {
        console.log(`[DRY RUN] Would link tally "${row.tally_title?.slice(0, 50)}..." to proposal ${proposalId}`);
        result.updated++;
      } else {
        await updateTallyProposalId(existingTally.id, proposalId);

        console.log(`Updated: "${row.tally_title?.slice(0, 50)}..." -> ${proposalId}`);
        result.updated++;
      }
    } catch (error) {
      const errorMessage = `Error processing "${row.tally_title}": ${error}`;
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

  console.log(`Running tally CSV import${dryRun ? " (DRY RUN)" : ""}`);

  importTallyMatchesFromCsv(dryRun)
    .then(() => {
      console.log("\nImport completed!");
      process.exit(0);
    })
    .catch(error => {
      console.error("Import failed:", error);
      process.exit(1);
    });
}
