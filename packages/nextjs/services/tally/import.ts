import {
  createTallyStage,
  getAllTallyStagesForComparison,
  updateTallyStageByTallyProposalId,
} from "~~/services/database/repositories/tally";
import { TALLY_GOVERNORS, TallyAPIResponse, TallyProposal } from "~~/services/tally/types";

const TALLY_GRAPHQL_URL = "https://api.tally.xyz/query";
const TALLY_API_KEY = process.env.TALLY_API_KEY;
const LIMIT = 100; // Number of proposals per page

if (!TALLY_API_KEY) {
  throw new Error("TALLY_API_KEY environment variable is required");
}
const REQUEST_DELAY_MS = 1000; // Delay between requests to avoid rate limiting
const MAX_RETRIES = 3; // Maximum number of retries for rate limit errors
const RETRY_DELAY_MS = 2000; // Initial delay for retries (exponential backoff)

const GRAPHQL_QUERY = `
  query GetProposals($governorId: AccountID!, $cursor: String, $limit: Int = 100) {
    proposals(
      input: {
        filters: { governorId: $governorId }
        sort: { sortBy: id, isDescending: true }
        page: { limit: $limit, afterCursor: $cursor }
      }
    ) {
      nodes {
        ... on Proposal {
          id
          onchainId
          chainId
          status
          metadata { title description eta ipfsHash previousEnd timelockId txHash discourseURL snapshotURL }
          creator { address name ens }
          proposer { address name ens }
          governor { name slug timelockId }
          voteStats { type votesCount votersCount percent }
          start { ... on Block { number timestamp } }
          end { ... on Block { number timestamp } }
          createdAt
          executableCalls { calldata target value }
          events {
            block { number timestamp }
            chainId
            createdAt
            type
            txHash
          }
        }
      }
      pageInfo { firstCursor lastCursor count }
    }
  }
`;

/**
 * Sleep utility function
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch Tally proposals from GraphQL API for a specific governor with retry logic
 */
const fetchTallyProposalsForGovernor = async (
  governorId: string,
  cursor: string | null = null,
  retryCount = 0,
): Promise<{ proposals: TallyProposal[]; nextCursor: string | null }> => {
  const variables: { governorId: string; cursor?: string | null; limit: number } = {
    governorId,
    limit: LIMIT,
    ...(cursor && { cursor }),
  };

  const requestBody = {
    query: GRAPHQL_QUERY,
    variables,
  };

  console.log(`Fetching proposals for governor: ${governorId}${cursor ? ` (cursor: ${cursor})` : ""}`);

  const response = await fetch(TALLY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": TALLY_API_KEY,
    },
    body: JSON.stringify(requestBody),
  });

  // Handle rate limiting with retry
  if (response.status === 429) {
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, retryCount); // Exponential backoff
      console.log(`Rate limited. Retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      return fetchTallyProposalsForGovernor(governorId, cursor, retryCount + 1);
    }
    const errorText = await response.text();
    console.error(`Tally API rate limit error after ${MAX_RETRIES} retries`);
    throw new Error(`Rate limit exceeded after ${MAX_RETRIES} retries. ${errorText}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Tally API error (${response.status}):`, errorText);
    throw new Error(`Failed to fetch Tally proposals: ${response.statusText}. ${errorText}`);
  }

  const data: TallyAPIResponse = await response.json();

  // Check for GraphQL errors
  if (data.errors) {
    console.error("GraphQL errors:", JSON.stringify(data.errors, null, 2));
    console.error("Request variables:", JSON.stringify(variables, null, 2));
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  if (data.data?.proposals?.nodes) {
    return {
      proposals: data.data.proposals.nodes,
      nextCursor: data.data.proposals.pageInfo.lastCursor,
    };
  }

  return { proposals: [], nextCursor: null };
};

/**
 * Fetch all Tally proposals for a governor with pagination
 */
const fetchAllTallyProposalsForGovernor = async (governorId: string): Promise<TallyProposal[]> => {
  const allProposals: TallyProposal[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let hasMore = true;
  let consecutiveEmptyPages = 0;

  while (hasMore) {
    const { proposals, nextCursor } = await fetchTallyProposalsForGovernor(governorId, cursor);

    // If we got no proposals, we're done
    if (proposals.length === 0) {
      console.log(`No more proposals for governor ${governorId}`);
      break;
    }

    allProposals.push(...proposals);

    // Check if we've seen this cursor before (infinite loop detection)
    if (nextCursor && seenCursors.has(nextCursor)) {
      console.log(`Detected cursor loop for governor ${governorId}, stopping pagination`);
      break;
    }

    if (nextCursor) {
      seenCursors.add(nextCursor);
    }

    // If cursor hasn't changed and we got results, check if we're stuck
    if (cursor === nextCursor && proposals.length > 0) {
      consecutiveEmptyPages++;
      if (consecutiveEmptyPages > 2) {
        console.log(`Cursor not advancing for governor ${governorId}, stopping pagination`);
        break;
      }
    } else {
      consecutiveEmptyPages = 0;
    }

    cursor = nextCursor;
    hasMore = nextCursor !== null && proposals.length > 0;

    // Add delay between pagination requests to avoid rate limiting
    if (hasMore) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log(`Fetched ${allProposals.length} total proposals for governor ${governorId}`);
  return allProposals;
};

/**
 * Transform Tally proposal to database format
 */
const transformProposalData = (proposal: TallyProposal) => {
  // Construct URL - Tally proposals use onchainId in the URL
  // Format: https://www.tally.xyz/gov/arbitrum/proposal/{onchain-id}
  const url = proposal.onchainId ? `https://www.tally.xyz/gov/arbitrum/proposal/${proposal.onchainId}` : null;

  // Get author name from creator or proposer
  const authorName = proposal.creator.name || proposal.proposer.name || proposal.creator.address;

  // Transform voteStats to options format
  const options = {
    voteStats: proposal.voteStats.map(stat => ({
      type: stat.type,
      votesCount: stat.votesCount,
      votersCount: stat.votersCount,
      percent: stat.percent,
    })),
    executableCalls: proposal.executableCalls,
  };

  // Clean title by removing markdown headers (# ## ### etc.) from the start
  const cleanTitle = (title: string | null): string | null => {
    if (!title) return null;
    return title.replace(/^#+\s*/, "").trim();
  };

  return {
    tally_proposal_id: proposal.id,
    title:
      cleanTitle(proposal.metadata.title) ||
      (proposal.onchainId ? `Proposal #${proposal.onchainId}` : null) ||
      `Tally Proposal ${proposal.id}`,
    author_name: authorName,
    url: url,
    onchain_id: proposal.onchainId || null,
    status: proposal.status || null,
    substatus: null, // Will be handled later via web scraping or onchain data
    substatus_deadline: null, // Will be handled later via web scraping or onchain data
    start_timestamp: proposal.start?.timestamp ? new Date(proposal.start.timestamp) : null,
    end_timestamp: proposal.end?.timestamp ? new Date(proposal.end.timestamp) : null,
    options: options,
    last_activity: proposal.end?.timestamp
      ? new Date(proposal.end.timestamp)
      : proposal.start?.timestamp
        ? new Date(proposal.start.timestamp)
        : new Date(proposal.createdAt),
    updated_at: new Date(),
    proposal_id: null,
  };
};

type ExistingTallyStage = {
  tally_proposal_id: string | null;
  title: string | null;
  author_name: string | null;
  url: string | null;
  onchain_id: string | null;
  status: string | null;
  substatus: string | null;
  substatus_deadline: Date | null;
  start_timestamp: Date | null;
  end_timestamp: Date | null;
  options: unknown;
  last_activity: Date | null;
};

/**
 * Normalize an object by sorting its keys recursively (for consistent comparison)
 */
const normalizeForComparison = (obj: unknown): string => {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return JSON.stringify(
      obj.map(item => (typeof item === "object" ? JSON.parse(normalizeForComparison(item)) : item)),
    );
  }

  if (typeof obj === "object") {
    const sortedObj: Record<string, unknown> = {};
    Object.keys(obj)
      .sort()
      .forEach(key => {
        sortedObj[key] = (obj as Record<string, unknown>)[key];
      });
    return JSON.stringify(sortedObj, Object.keys(sortedObj).sort());
  }

  return JSON.stringify(obj);
};

/**
 * Check if the proposal data has changed compared to the existing tally stage
 */
const hasChanges = (existing: ExistingTallyStage, proposal: TallyProposal): boolean => {
  const transformedData = transformProposalData(proposal);

  const existingStartTimestamp = existing.start_timestamp?.getTime() ?? null;
  const existingEndTimestamp = existing.end_timestamp?.getTime() ?? null;
  const existingLastActivity = existing.last_activity?.getTime() ?? null;

  const newStartTimestamp = transformedData.start_timestamp?.getTime() ?? null;
  const newEndTimestamp = transformedData.end_timestamp?.getTime() ?? null;
  const newLastActivity = transformedData.last_activity?.getTime() ?? null;

  // Use normalized comparison for options to ignore property order
  const optionsChanged = normalizeForComparison(existing.options) !== normalizeForComparison(transformedData.options);

  const changes = {
    title: existing.title !== transformedData.title,
    author_name: existing.author_name !== transformedData.author_name,
    url: existing.url !== transformedData.url,
    onchain_id: existing.onchain_id !== transformedData.onchain_id,
    status: existing.status !== transformedData.status,
    start_timestamp: existingStartTimestamp !== newStartTimestamp,
    end_timestamp: existingEndTimestamp !== newEndTimestamp,
    last_activity: existingLastActivity !== newLastActivity,
    options: optionsChanged,
  };

  const hasAnyChanges = Object.values(changes).some(changed => changed);

  if (hasAnyChanges) {
    console.log("Changes detected for proposal:", proposal.id);
    console.log(
      "Changed fields:",
      Object.entries(changes)
        .filter(([, changed]) => changed)
        .map(([field]) => field),
    );
  }

  return hasAnyChanges;
};

/**
 * Create a new tally stage for a proposal
 */
const createNewTallyStage = async (proposal: TallyProposal) => {
  const tallyData = transformProposalData(proposal);

  const tallyStage = await createTallyStage(tallyData);
  console.log("Created tally stage:", tallyStage.title);
};

/**
 * Update an existing tally stage with latest data
 */
const updateExistingTallyStage = async (proposal: TallyProposal) => {
  const tallyData = transformProposalData(proposal);

  // Remove fields that shouldn't be updated
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tally_proposal_id, proposal_id, ...updates } = tallyData;

  const tallyStage = await updateTallyStageByTallyProposalId(proposal.id, updates);
  console.log("Updated tally stage:", tallyStage.title);
};

/**
 * Main function to import Tally proposals into the database
 */
export async function importTallyProposals() {
  try {
    const existingTallyStages = await getAllTallyStagesForComparison();
    const tallyStageMap = new Map(
      existingTallyStages
        .filter(tallyStage => tallyStage.tally_proposal_id)
        .map(validTallyStage => [validTallyStage.tally_proposal_id, validTallyStage]),
    );

    console.log("Fetching Tally proposals...");

    // Fetch proposals for all governors
    const allProposals: TallyProposal[] = [];
    for (const governorId of TALLY_GOVERNORS) {
      console.log(`Fetching proposals for governor: ${governorId}`);
      const proposals = await fetchAllTallyProposalsForGovernor(governorId);
      allProposals.push(...proposals);
      console.log(`Fetched ${proposals.length} proposals for governor: ${governorId}`);

      // Add delay between governors to avoid rate limiting
      if (governorId !== TALLY_GOVERNORS[TALLY_GOVERNORS.length - 1]) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    // Deduplicate proposals by ID (in case same proposal appears from multiple governors or pagination)
    const uniqueProposals = new Map<string, TallyProposal>();
    for (const proposal of allProposals) {
      if (!uniqueProposals.has(proposal.id)) {
        uniqueProposals.set(proposal.id, proposal);
      }
    }

    console.log(`Processing ${uniqueProposals.size} unique Tally proposals (${allProposals.length} total fetched)`);

    for (const proposal of uniqueProposals.values()) {
      const existing = tallyStageMap.get(proposal.id);

      if (!existing) {
        await createNewTallyStage(proposal);
      } else if (hasChanges(existing, proposal)) {
        await updateExistingTallyStage(proposal);
      }
    }

    console.log("Tally proposals imported successfully");
  } catch (error) {
    console.error("Error in importTallyProposals:", error);
    throw error;
  }
}
