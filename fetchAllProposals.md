Looking at your Tally API response, you have pagination with `pageInfo` that provides cursors for navigating through results. Here's how to handle pagination:

## 1. Initial Query (you already have this):

```graphql
query GetArbitrumProposals($cursor: String) {
  proposals(
    input: {
      filters: {
        governorId: "eip155:42161:0x789fC99093B09aD01C34DC7251D0C89ce743e5a4"
      }
      page: {
        limit: 10
        afterCursor: $cursor
      }
    }
  ) {
    nodes {
      ... on Proposal {
        # your fields here
      }
    }
    pageInfo {
      firstCursor
      lastCursor
      count
    }
  }
}
```

## 2. JavaScript/TypeScript code to fetch all results:

```javascript
async function fetchAllProposals() {
  let allProposals = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch("https://api.tally.xyz/query", {
      method: "POST",
      headers: {
        "Api-Key": "YOUR_API_KEY",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: GET_ARBITRUM_PROPOSALS_QUERY,
        variables: { cursor },
      }),
    });

    const data = await response.json();
    const proposals = data.data.proposals.nodes;
    const pageInfo = data.data.proposals.pageInfo;

    allProposals = [...allProposals, ...proposals];

    // Check if there are more pages
    if (proposals.length < 10 || !pageInfo.lastCursor) {
      hasMore = false;
    } else {
      cursor = pageInfo.lastCursor;
    }
  }

  return allProposals;
}
```

## 3. Process and store the data:

```javascript
async function processProposals(proposals) {
  for (const proposal of proposals) {
    // Check if proposal exists in your database
    const existingProposal = await db.proposals.findOne({
      where: {
        OR: [
          { tally_proposal_id: proposal.id },
          { onchain_id: proposal.onchainId },
        ],
      },
    });

    if (!existingProposal) {
      // Create new proposal
      const newProposal = await db.proposals.create({
        title: proposal.metadata.title,
        description: proposal.metadata.description,
        author_address: proposal.creator.address,
        author_name: proposal.creator.name,
        overall_status: proposal.status,
        // ... other fields
      });

      // Create tally_votes record
      await db.tally_votes.create({
        proposal_id: newProposal.id,
        tally_proposal_id: proposal.id,
        onchain_id: proposal.onchainId,
        status: proposal.status,
        for_votes: proposal.voteStats.find((v) => v.type === "for")?.votesCount,
        against_votes: proposal.voteStats.find((v) => v.type === "against")
          ?.votesCount,
        abstain_votes: proposal.voteStats.find((v) => v.type === "abstain")
          ?.votesCount,
        // ... other fields
      });
    } else {
      // Update existing proposal status
      await db.tally_votes.update({
        where: { proposal_id: existingProposal.id },
        data: {
          status: proposal.status,
          last_activity: new Date(),
        },
      });
    }
  }
}
```

## 4. Note about the data structure:

From your response, each proposal has:

- Basic info (id, title, status)
- Vote statistics array with types: 'for', 'against', 'abstain', 'pendingfor', 'pendingagainst', 'pendingabstain'
- Start/end blocks with timestamps
- Executable calls (if applicable)

The `pageInfo.count` tells you total proposals (8 in your case), so you know when you've fetched everything.

Would you like help with any specific aspect of processing this data?

## 5. This is my graphql query (in point 1 it said i already have this)

```graphql
query GetArbitrumProposals {
  proposals(
    input: {
      filters: {
        governorId: "eip155:42161:0x789fC99093B09aD01C34DC7251D0C89ce743e5a4"
      }
      sort: { sortBy: id, isDescending: true }
      page: { limit: 1000 }
    }
  ) {
    nodes {
      ... on Proposal {
        id
        onchainId
        chainId
        status
        metadata {
          title
          description
          eta
          ipfsHash
          previousEnd
          timelockId
          txHash
          discourseURL
          snapshotURL
        }
        creator {
          address
          name
          ens
        }
        proposer {
          address
          name
          ens
        }
        governor {
          name
          slug
        }
        voteStats {
          type
          votesCount
          votersCount
          percent
        }
        start {
          ... on Block {
            number
            timestamp
          }
        }
        end {
          ... on Block {
            number
            timestamp
          }
        }
        createdAt
        executableCalls {
          calldata
          target
          value
        }
      }
    }
    pageInfo {
      firstCursor
      lastCursor
      count
    }
  }
}
```
