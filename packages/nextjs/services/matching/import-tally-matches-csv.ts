/**
 * Import verified tally matches from CSV into the database
 *
 * Uses URLs as natural keys for production-safe matching:
 * - Finds tally_stage by onchain_id (extracted from tally_url)
 * - Finds forum_stage by forum_url to get the proposal_id
 * - Links the tally to the proposal
 */
import { getForumStageByUrl } from "../database/repositories/forum";
import { getTallyStageByOnchainId, updateTallyProposalId } from "../database/repositories/tally";
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
  proposal_id: string; // Ignored - we derive this from forum_url lookup
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
    const onchainId = extractOnchainId(row.tally_url);
    const forumUrl = decodeHtmlEntities(row.forum_url?.trim());

    // Skip rows without valid tally URL
    if (!onchainId) {
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
      // Find tally_stage by onchain_id (the ID in the URL)
      const existingTally = await getTallyStageByOnchainId(onchainId);

      if (!existingTally) {
        console.log(`Tally not found in DB: ${onchainId} (${row.tally_title?.slice(0, 50)}...)`);
        result.notFound++;
        continue;
      }

      // Find forum_stage by URL to get the proposal_id
      const forumStage = await getForumStageByUrl(forumUrl);

      if (!forumStage) {
        console.log(`Forum not found in DB: ${forumUrl} (for tally: ${row.tally_title?.slice(0, 40)}...)`);
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
      if (existingTally.proposal_id === proposalId) {
        result.alreadyLinked++;
        continue;
      }

      await updateTallyProposalId(existingTally.id, proposalId);

      console.log(`Updated: "${row.tally_title?.slice(0, 50)}..." -> ${proposalId}`);
      result.updated++;
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
  console.log(`Tally not found in DB: ${result.notFound}`);
  console.log(`Forum not found in DB: ${result.forumNotFound}`);
  console.log(`Skipped (no forum_url): ${result.skipped}`);
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
