import {
  createSnapshotStage,
  getAllSnapshotIds,
  updateSnapshotStageBySnapshotId,
} from "~~/services/database/repositories/snapshot";
import { SnapshotAPIResponse, SnapshotProposal } from "~~/services/snapshot/types";

const SNAPSHOT_GRAPHQL_URL = "https://hub.snapshot.org/graphql";
const GRAPHQL_QUERY = `
  query ArbitrumDAOProposals {
    proposals(
      first: 100,
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
    author_name: proposal.author,
    url: proposal.link,
    status: proposal.state,
    voting_start: new Date(proposal.start * 1000),
    voting_end: new Date(proposal.end * 1000),
    options: {
      choices: proposal.choices,
      scores: proposal.scores,
    },
    last_activity: new Date(proposal.end * 1000),
    updated_at: new Date(),
    proposal_id: null,
  };
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
    const existingSnapshotIds = await getAllSnapshotIds();

    console.log("Fetching Snapshot proposals...");
    const proposals = await fetchSnapshotProposals();

    console.log(`Processing ${proposals.length} Snapshot proposals`);

    for (const proposal of proposals) {
      const isNewProposal = !existingSnapshotIds.includes(proposal.id);

      if (isNewProposal) {
        await createNewSnapshotStage(proposal);
      } else {
        await updateExistingSnapshotStage(proposal);
      }
    }

    console.log("Snapshot proposals imported successfully");
  } catch (error) {
    console.error("Error in importSnapshotProposals:", error);
    throw error;
  }
}
