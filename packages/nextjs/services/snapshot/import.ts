import {
  createSnapshotStage,
  getAllSnapshotStagesForComparison,
  updateSnapshotStageBySnapshotId,
} from "~~/services/database/repositories/snapshot";
import { SnapshotAPIResponse, SnapshotProposal } from "~~/services/snapshot/types";

const SNAPSHOT_GRAPHQL_URL = "https://hub.snapshot.org/graphql";
const GRAPHQL_QUERY = `
  query ArbitrumDAOProposals {
    proposals(
      first: 1000,
      skip: 0,
      where: {
        space_in: ["arbitrumfoundation.eth"]
      },
      orderBy: "created",
      orderDirection: desc
    ) {
      id
      title
      body
      state
      link
      created
      start
      end
      author
      choices
      scores
      scores_total
    }
  }
`;

/**
 * Fetch Snapshot proposals from GraphQL API
 */
const fetchSnapshotProposals = async (): Promise<SnapshotProposal[]> => {
  const response = await fetch(SNAPSHOT_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: GRAPHQL_QUERY,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Snapshot proposals: ${response.statusText}`);
  }

  const data: SnapshotAPIResponse = await response.json();
  return data.data.proposals;
};

/**
 * Transform Snapshot proposal to database format
 */
const transformProposalData = (proposal: SnapshotProposal) => {
  return {
    snapshot_id: proposal.id,
    title: proposal.title,
    body: proposal.body,
    author_name: proposal.author,
    url: proposal.link,
    status: proposal.state,
    voting_start: new Date(proposal.start * 1000),
    voting_end: new Date(proposal.end * 1000),
    options: {
      choices: proposal.choices,
      scores: proposal.scores,
    },
    updated_at: new Date(),
    proposal_id: null,
  };
};

type ExistingSnapshotStage = {
  snapshot_id: string | null;
  title: string | null;
  author_name: string | null;
  status: string | null;
  voting_start: Date | null;
  voting_end: Date | null;
  options: unknown;
  url: string | null;
};

/**
 * Check if the proposal data has changed compared to the existing snapshot stage
 */
const hasChanges = (existing: ExistingSnapshotStage, proposal: SnapshotProposal): boolean => {
  const newOptions = {
    choices: proposal.choices,
    scores: proposal.scores,
  };

  const existingOptions = existing.options as { choices?: string[]; scores?: number[] } | null;

  const optionsChanged =
    JSON.stringify(existingOptions?.choices) !== JSON.stringify(newOptions.choices) ||
    JSON.stringify(existingOptions?.scores) !== JSON.stringify(newOptions.scores);

  const newVotingStart = new Date(proposal.start * 1000).getTime();
  const newVotingEnd = new Date(proposal.end * 1000).getTime();
  const existingVotingStart = existing.voting_start?.getTime() ?? 0;
  const existingVotingEnd = existing.voting_end?.getTime() ?? 0;

  return (
    existing.title !== proposal.title ||
    existing.author_name !== proposal.author ||
    existing.status !== proposal.state ||
    existing.url !== proposal.link ||
    existingVotingStart !== newVotingStart ||
    existingVotingEnd !== newVotingEnd ||
    optionsChanged
  );
};

/**
 * Create a new snapshot stage for a proposal
 */
const createNewSnapshotStage = async (proposal: SnapshotProposal) => {
  const snapshotData = transformProposalData(proposal);

  const snapshotStage = await createSnapshotStage(snapshotData);
  console.log("Created snapshot stage:", snapshotStage.title);
};

/**
 * Update an existing snapshot stage with latest data
 */
const updateExistingSnapshotStage = async (proposal: SnapshotProposal) => {
  const snapshotData = transformProposalData(proposal);

  // Remove fields that shouldn't be updated
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { snapshot_id, proposal_id, ...updates } = snapshotData;

  const snapshotStage = await updateSnapshotStageBySnapshotId(proposal.id, updates);
  console.log("Updated snapshot stage:", snapshotStage.title);
};

/**
 * Main function to import Snapshot proposals into the database
 */
export async function importSnapshotProposals() {
  try {
    const existingSnapshotStages = await getAllSnapshotStagesForComparison();
    const snapshotStageMap = new Map(
      existingSnapshotStages
        .filter(snapshotStage => snapshotStage.snapshot_id)
        .map(validSnapshotStage => [validSnapshotStage.snapshot_id, validSnapshotStage]),
    );

    console.log("Fetching Snapshot proposals...");
    const proposals = await fetchSnapshotProposals();

    console.log(`Processing ${proposals.length} Snapshot proposals`);

    for (const proposal of proposals) {
      const existing = snapshotStageMap.get(proposal.id);

      if (!existing) {
        await createNewSnapshotStage(proposal);
      } else if (hasChanges(existing, proposal)) {
        await updateExistingSnapshotStage(proposal);
      }
    }

    console.log("Snapshot proposals imported successfully");
  } catch (error) {
    console.error("Error in importSnapshotProposals:", error);
    throw error;
  }
}
