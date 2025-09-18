import { TallyErrorResponse, TallyProposal, TallyProposalsResponse } from "../../types/tally";

const TALLY_API_URL = "https://api.tally.xyz/query";

// Arbitrum governance contracts
export const ARBITRUM_GOVERNORS = {
  CURRENT: "eip155:42161:0x789fC99093B09aD01C34DC7251D0C89ce743e5a4", // Current governor
  LEGACY: "eip155:42161:0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9", // Legacy governor
} as const;

const GET_PROPOSALS_QUERY_V1 = `
  query GetProposals($governorId: ID!, $cursor: String, $limit: Int = 10) {
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

const GET_PROPOSALS_QUERY_INLINE = (governorId: string) => `
  query GetProposals($cursor: String, $limit: Int = 10) {
    proposals(
      input: {
        filters: { governorId: "${governorId}" }
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

export class TallyApiService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TALLY_API_KEY || "";
    if (!this.apiKey) {
      console.warn("Warning: No Tally API key provided. Requests may be rate limited.");
    }
  }

  async fetchProposalsByGovernor(governorId: string, cursor?: string, limit = 10): Promise<TallyProposalsResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Api-Key"] = this.apiKey;
    }
    const tryQueries: Array<{ query: string; variables: Record<string, unknown> }> = [
      { query: GET_PROPOSALS_QUERY_V1, variables: { governorId, cursor, limit } },
      { query: GET_PROPOSALS_QUERY_INLINE(governorId), variables: { cursor, limit } },
    ];
    let lastError: unknown = null;
    const maxRetries = 5;
    const baseDelayMs = 500;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    for (const attempt of tryQueries) {
      for (let i = 0; i < maxRetries; i++) {
        try {
          const response = await fetch(TALLY_API_URL, {
            method: "POST",
            headers,
            body: JSON.stringify({ query: attempt.query, variables: attempt.variables }),
          });
          const text = await response.text();
          if (!response.ok) {
            // Handle rate limit with backoff
            if (response.status === 429 || text.includes("429") || text.toLowerCase().includes("too many requests")) {
              const backoff = baseDelayMs * Math.pow(2, i) + Math.floor(Math.random() * 250);
              console.warn(
                `Rate limited (HTTP ${response.status}). Backing off ${backoff}ms (retry ${i + 1}/${maxRetries})`,
              );
              await sleep(backoff);
              continue;
            }
            lastError = new Error(`HTTP ${response.status}: ${text}`);
            break;
          }
          const data = JSON.parse(text);
          if (data.errors) {
            const errorResponse = data as TallyErrorResponse;
            const messages = errorResponse.errors.map((e: any) => e.message).join(", ");
            const isRateLimited = messages.toLowerCase().includes("rate") || messages.toLowerCase().includes("limit");
            if (isRateLimited && i < maxRetries - 1) {
              const backoff = baseDelayMs * Math.pow(2, i) + Math.floor(Math.random() * 250);
              console.warn(`GraphQL rate limited. Backing off ${backoff}ms (retry ${i + 1}/${maxRetries})`);
              await sleep(backoff);
              continue;
            }
            lastError = new Error(`GraphQL error: ${messages}`);
            break;
          }
          return data as TallyProposalsResponse;
        } catch (e) {
          lastError = e;
          // brief delay before retrying
          const backoff = baseDelayMs * Math.pow(2, i) + Math.floor(Math.random() * 250);
          await sleep(backoff);
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async fetchProposals(cursor?: string): Promise<TallyProposalsResponse> {
    // Backward-compat: default to CURRENT governor
    return this.fetchProposalsByGovernor(ARBITRUM_GOVERNORS.CURRENT, cursor);
  }

  async fetchAllProposalsForGovernor(governorId: string, limitPerPage = 25): Promise<TallyProposal[]> {
    let allProposals: TallyProposal[] = [];
    let cursor: string | null = null;
    let hasMore = true;
    let pageCount = 0;
    console.log(`Starting to fetch all proposals for governor ${governorId}...`);

    while (hasMore) {
      try {
        pageCount++;
        console.log(`Fetching page ${pageCount}${cursor ? ` (cursor: ${cursor.substring(0, 10)}...)` : ""}`);

        const response = await this.fetchProposalsByGovernor(governorId, cursor || undefined, limitPerPage);
        const proposals = response.data.proposals.nodes;
        const pageInfo = response.data.proposals.pageInfo;

        allProposals = [...allProposals, ...proposals];
        console.log(`Fetched ${proposals.length} proposals. Total so far: ${allProposals.length}`);

        // Check if there are more pages
        if (proposals.length < 10 || !pageInfo.lastCursor) {
          hasMore = false;
          console.log("Reached the end of proposals");
        } else {
          cursor = pageInfo.lastCursor || null;
        }

        // Add a small delay to be respectful to the API
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      } catch (error) {
        const msg = String((error as Error)?.message || error);
        console.warn(`Error fetching page ${pageCount}: ${msg}`);
        if (
          msg.includes("429") ||
          msg.toLowerCase().includes("too many requests") ||
          msg.toLowerCase().includes("rate")
        ) {
          // backoff and retry same page
          await new Promise(resolve => setTimeout(resolve, 1500));
          pageCount--;
          continue;
        }
        throw error;
      }
    }

    console.log(`Finished fetching all proposals for ${governorId}. Total: ${allProposals.length} proposals`);
    return allProposals;
  }

  async fetchAllProposals(): Promise<TallyProposal[]> {
    // Fetch from CURRENT then LEGACY sequentially to avoid rate limits
    const current = await this.fetchAllProposalsForGovernor(ARBITRUM_GOVERNORS.CURRENT, 25);
    await new Promise(resolve => setTimeout(resolve, 750));
    const legacy = await this.fetchAllProposalsForGovernor(ARBITRUM_GOVERNORS.LEGACY, 25);

    const byId = new Map<string, TallyProposal>();
    for (const p of [...current, ...legacy]) {
      if (!byId.has(p.id)) byId.set(p.id, p);
    }
    const merged = Array.from(byId.values());
    // Sort desc by id (string compare is ok as Tally uses bigints as strings; but keep as received order)
    return merged;
  }

  async fetchProposalById(
    proposalId: string,
    options?: { governorId?: string; maxPages?: number },
  ): Promise<TallyProposal | null> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Api-Key"] = this.apiKey;
    }

    const QUERY_BY_NODE_ID = `
      query ProposalById($id: ID!) {
        proposal(id: $id) {
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
    `;

    const QUERY_BY_NODE_INT = `
      query ProposalById($id: IntID!) {
        proposal(id: $id) {
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
    `;

    const QUERY_BY_FILTER_ID = `
      query ProposalsByIds($ids: [ID!]!) {
        proposals(input: { filters: { ids: $ids }, page: { limit: 1 } }) {
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
        }
      }
    `;

    const QUERY_BY_FILTER_INT = `
      query ProposalsByIds($ids: [IntID!]!) {
        proposals(input: { filters: { ids: $ids }, page: { limit: 1 } }) {
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
        }
      }
    `;

    const attempts: Array<{ query: string; variables: Record<string, unknown> }> = [];
    const isNumericId = /^\d+$/.test(proposalId);
    if (isNumericId) {
      attempts.push({ query: QUERY_BY_NODE_INT, variables: { id: proposalId } });
      attempts.push({ query: QUERY_BY_FILTER_INT, variables: { ids: [proposalId] } });
      // As a fallback, try ID-based filter in case the API aliases work
      attempts.push({ query: QUERY_BY_FILTER_ID, variables: { ids: [proposalId] } });
    } else {
      attempts.push({ query: QUERY_BY_NODE_ID, variables: { id: proposalId } });
      attempts.push({ query: QUERY_BY_FILTER_ID, variables: { ids: [proposalId] } });
      // Fallback to IntID filter just in case
      attempts.push({ query: QUERY_BY_FILTER_INT, variables: { ids: [proposalId] } });
    }

    for (const attempt of attempts) {
      try {
        const response = await fetch(TALLY_API_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: attempt.query, variables: attempt.variables }),
        });
        const text = await response.text();
        if (!response.ok) continue;
        const data = JSON.parse(text);
        if (data.errors) continue;
        if (data.data?.proposal) return data.data.proposal as TallyProposal;
        const node = data.data?.proposals?.nodes?.[0];
        if (node) return node as TallyProposal;
      } catch {
        // try next variant
      }
    }

    // Fallback: scan pages within a governor (if provided) or across both known governors
    const governorsToScan = options?.governorId
      ? [options.governorId]
      : [ARBITRUM_GOVERNORS.CURRENT, ARBITRUM_GOVERNORS.LEGACY];

    const maxPages = Math.max(1, Math.min(options?.maxPages ?? 25, 100));
    for (const gov of governorsToScan) {
      let cursor: string | null = null;
      let pages = 0;
      while (pages < maxPages) {
        pages++;
        try {
          const resp = await this.fetchProposalsByGovernor(gov, cursor || undefined, 50);
          const nodes: TallyProposal[] = resp.data?.proposals?.nodes || [];
          const found = nodes.find(n => n.id === proposalId || n.onchainId === proposalId);
          if (found) return found;
          const next = resp.data?.proposals?.pageInfo?.lastCursor;
          if (!next || nodes.length === 0) break;
          cursor = next;
        } catch {
          break;
        }
      }
    }

    return null;
  }
}

// Export a function that creates the service with current env vars
export function createTallyApiService(apiKey?: string): TallyApiService {
  return new TallyApiService(apiKey || process.env.TALLY_API_KEY);
}

// Lazy-loaded singleton that checks env vars when first accessed
let _tallyApiInstance: TallyApiService | null = null;
export const tallyApi = {
  get instance(): TallyApiService {
    if (!_tallyApiInstance) {
      _tallyApiInstance = createTallyApiService();
    }
    return _tallyApiInstance;
  },
};

// For backward compatibility, add methods directly to the export
Object.defineProperty(tallyApi, "fetchProposals", {
  get() {
    return this.instance.fetchProposals.bind(this.instance);
  },
});

Object.defineProperty(tallyApi, "fetchAllProposals", {
  get() {
    return this.instance.fetchAllProposals.bind(this.instance);
  },
});
