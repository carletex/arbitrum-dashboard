/**
 * Matching utilities for proposal linking across stages
 */

/**
 * Extract forum topic ID from discourse URL
 * Example: "https://forum.arbitrum.foundation/t/topic-name/12345" -> "12345"
 */
export function extractForumTopicId(url: string): string | null {
  if (!url) return null;

  try {
    const match = url.match(/\/t\/[^/]+\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Extract snapshot ID from snapshot URL
 * Example: "https://snapshot.org/#/arbitrumfoundation.eth/proposal/0xabc123..." -> "0xabc123..."
 */
export function extractSnapshotId(url: string): string | null {
  if (!url) return null;

  try {
    const match = url.match(/\/proposal\/([^/?\s]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Decode common HTML entities for matching.
 */
export function decodeHtmlEntities(text: string): string {
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

/**
 * Normalize title for comparison
 * Removes AIP prefixes, special chars, converts to lowercase, trims
 */
export function normalizeTitle(title: string | null): string {
  if (!title) return "";

  let normalized = decodeHtmlEntities(title).toLowerCase().trim();

  // Remove common prefixes like "AIP-123:", "[AIP-123]", etc.
  normalized = normalized.replace(/^\[?aip[-\s]?\d+\]?:?\s*/i, "");

  // Remove special characters except spaces
  normalized = normalized.replace(/[^a-z0-9\s]/g, " ");

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Calculate similarity between two titles using token overlap
 * Returns a score from 0-100
 */
export function calculateSimilarity(title1: string | null, title2: string | null): number {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);

  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 100;

  // Token-based similarity
  const tokens1 = new Set(norm1.split(" ").filter(t => t.length > 2)); // Skip short words
  const tokens2 = new Set(norm2.split(" ").filter(t => t.length > 2));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  // Calculate Jaccard similarity
  const intersection = new Set([...tokens1].filter(token => tokens2.has(token)));
  const union = new Set([...tokens1, ...tokens2]);

  const similarity = (intersection.size / union.size) * 100;
  return Math.round(similarity);
}

/**
 * Calculate match confidence score based on available data
 */
export function getMatchConfidence(params: {
  matchMethod: "url" | "exact_title" | "fuzzy_title" | "forum_link";
  titleSimilarity?: number;
  sameAuthor?: boolean;
}): number {
  const { matchMethod, titleSimilarity = 0, sameAuthor = false } = params;

  // URL match is 100% confidence
  if (matchMethod === "url") {
    return 100;
  }

  // Exact title match
  if (matchMethod === "exact_title") {
    return sameAuthor ? 95 : 90;
  }

  // Fuzzy title match
  if (matchMethod === "fuzzy_title") {
    let score = titleSimilarity;

    // Boost score if authors match
    if (sameAuthor) {
      score = Math.min(100, score + 5);
    }

    return score;
  }

  // Forum link slug match uses the same confidence logic as fuzzy title
  if (matchMethod === "forum_link") {
    let score = titleSimilarity;
    if (sameAuthor) {
      score = Math.min(100, score + 5);
    }
    return score;
  }

  return 0;
}

/**
 * Normalize author name for comparison
 */
export function normalizeAuthor(author: string | null): string {
  if (!author) return "";
  return author.toLowerCase().trim();
}

/**
 * Check if two authors are the same (case-insensitive)
 */
export function isSameAuthor(author1: string | null, author2: string | null): boolean {
  const norm1 = normalizeAuthor(author1);
  const norm2 = normalizeAuthor(author2);

  if (!norm1 || !norm2) return false;

  return norm1 === norm2;
}

/**
 * Convert a title to a forum-like slug for matching.
 */
export function titleToSlug(title: string | null): string {
  if (!title) return "";
  let slug = decodeHtmlEntities(title).toLowerCase();
  slug = slug.replace(/[^\w\s-]/g, "");
  slug = slug.replace(/\s+/g, "-");
  slug = slug.replace(/-+/g, "-");
  return slug.replace(/^-|-$/g, "");
}

/**
 * Extract forum links and return [slug, topicId] pairs.
 */
export function extractForumLinks(text: string | null): Array<[string, string | null]> {
  if (!text) return [];
  const pattern = /forum\.arbitrum\.foundation\/t\/([a-zA-Z0-9_-]+)(?:\/(\d+))?/g;
  const matches: Array<[string, string | null]> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    matches.push([match[1].toLowerCase(), match[2] ?? null]);
  }
  return matches;
}

/**
 * Identify STIP/LTIPP protocol-specific titles.
 */
export function isStipLtippProtocolTitle(title: string | null): boolean {
  if (!title) return false;
  const patterns = [
    /STIP Proposal - Round 1$/i,
    /STIP Addendum$/i,
    /LTIPP Council Recommended Proposal$/i,
    /STIP Bridge Challenge$/i,
    /LTIPP \[Post Council Feedback\]$/i,
  ];
  return patterns.some(pattern => pattern.test(title));
}

/**
 * Identify election-style titles that are not forum proposals.
 */
export function isElectionTitle(title: string | null): boolean {
  if (!title) return false;
  const patterns = [
    /Security Council.*Election/i,
    /reconfirmation.*council/i,
    /D\.A\.O\..*Elections/i,
    /Domain Allocator Election/i,
    /Council Election/i,
    /ARDC.*Election/i,
    /Advisor Elections/i,
    /Election of.*Members/i,
    /Election of.*Manager/i,
  ];
  return patterns.some(pattern => pattern.test(title));
}

/**
 * Skip generic forum slugs that reference programs, not specific proposals.
 */
export function isGenericForumSlug(slug: string): boolean {
  if (!slug) return true;
  if (slug.includes("short-term-incentive")) return true;
  if (slug.includes("stip")) return true;
  if (slug.includes("ltipp")) return true;
  if (slug.includes("arbitrum-arbos-upgrades")) return true;
  return false;
}
