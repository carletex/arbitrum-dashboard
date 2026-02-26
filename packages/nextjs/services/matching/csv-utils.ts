import * as fs from "fs";
import * as path from "path";

export interface ImportResult {
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
 * Download content from a URL and save it locally
 */
export async function readFileContent(localPath: string, driveUrl: string): Promise<string> {
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

/**
 * Decode common HTML entities in URLs
 */
export function decodeHtmlEntities(text: string): string {
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
export function parseCsvLine(line: string, delimiter: string = ";"): string[] {
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
