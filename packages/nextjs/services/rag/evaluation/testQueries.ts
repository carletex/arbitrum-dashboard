// Curated test queries for RAG evaluation
//
// expectedProposalIds populated from first evaluation run (2026-02-12, commit 11b3cff).
// These represent the proposal IDs that SHOULD appear in retrieval results for each query.
// Re-run `yarn rag:eval --retrieval-only` after re-ingestion to verify they still hold.
import { EvalTestQuery } from "./types";

export const TEST_QUERIES: EvalTestQuery[] = [
  // --- Status lookups ---
  {
    id: "query-001",
    query: "What is the current status of the ArbitrumDAO Constitution proposal?",
    // "constitutional-extend-delay-on-l2time-lock" + "constitutional-aip-arbos-version-40-callisto"
    expectedProposalIds: ["7e87f27c-5806-4af8-92b9-9325fd63e9fb", "506fe504-450c-40a7-8551-8cd406fc57f9"],
    referenceAnswer:
      "The Constitution amendment proposal 'constitutional-extend-delay-on-l2time-lock' is at the Forum stage with a timeline including feedback period, temperature check, ARDC review, and a scheduled on-chain vote.",
    tags: ["status", "factual"],
  },
  {
    id: "query-002",
    query: "Which proposals are currently active on Snapshot?",
    // Listing query — hard to pin exact IDs; use proposals that mentioned active Snapshot in the report
    expectedProposalIds: ["78651690-2d36-47e9-b8cf-ab410db30a87", "f99a9cc0-8505-4387-b5d2-241cab449954"],
    tags: ["status", "listing"],
  },
  {
    id: "query-003",
    query: "What proposals have been executed on Tally recently?",
    // "Expand Tally Support" + "ARDC" tally proposals appeared in retrieval
    expectedProposalIds: ["7f47b97e-0621-4a1d-b8ca-54f99db643e8", "8bd39d65-978c-432a-ade1-9a0eae68be6a"],
    tags: ["status", "listing"],
  },

  // --- Author attribution ---
  {
    id: "query-004",
    query: "Who proposed the Arbitrum Short-Term Incentive Program (STIP)?",
    // Original STIP forum proposal by tnorm
    expectedProposalIds: ["71c572cb-272f-425e-9a04-ea9ffc710327"],
    referenceAnswer:
      "The Arbitrum Short-Term Incentive Program (STIP) was proposed by tnorm on the Arbitrum governance forum.",
    tags: ["author", "factual"],
  },
  {
    id: "query-005",
    query: "What proposals has Plurality Labs authored?",
    // Plurality Labs / DisruptionJoe proposals: fund milestone 1b (Ridge), Thank ARB milestone 2, Pluralist Grants, AIP-3
    expectedProposalIds: [
      "d29d2e55-ee8d-4f28-93a8-74b8aeb8c232",
      "40f89750-443e-45b2-97ff-935ad310d74e",
      "3dc3e0a8-6cd7-40b4-acaa-75dae6641c2b",
      "c738039c-6bab-466a-8931-97d7a1b4ca0b",
    ],
    referenceAnswer:
      "Plurality Labs (Disruption Joe / DisruptionJoe) authored several proposals including: AIP-3 Fund the Arbitrum Grants Framework (Milestone 1), Building a Pluralist Grants Framework (Milestone 1), Thank ARB by Plurality Labs (Milestone 2), and Proposal to Fund Plurality Labs Milestone 1b (Ridge).",
    tags: ["author", "listing"],
  },

  // --- Forum discussion ---
  {
    id: "query-006",
    query: "What concerns were raised in the forum discussion about the Gaming Catalyst Program?",
    // Main GCP proposal + GCP Clawback discussion
    expectedProposalIds: ["da509140-6545-4fc3-b3c0-05d9407baaa5", "73ee4a98-4a40-4e27-8b2c-01886041a9f1"],
    referenceAnswer:
      "Key concerns about the Gaming Catalyst Program included: the large budget size seen as exorbitant and risky, risk of misallocation and insufficient transparency, lack of legal clarity and clawback mechanisms, high GameFi industry failure rate, governance and accountability gaps between the Catalyst Team/Council/Foundation, operational cost and staffing worries, over-reliance on publishers potentially crowding out independent developers, and sustainability concerns about tokenomics and P2E incentives.",
    tags: ["forum", "discussion"],
  },
  {
    id: "query-007",
    query: "Summarize the community feedback on the Arbitrum Research & Development Collective proposal.",
    // Original ARDC proposal + ARDC Term 2 + ARDC V2 Extension
    expectedProposalIds: [
      "c016a434-9253-41e8-8a71-4d0f093cd5e1",
      "8bd39d65-978c-432a-ade1-9a0eae68be6a",
      "a88fd796-f124-48c4-a018-93c465898256",
    ],
    referenceAnswer:
      "Community feedback on the ARDC included: general recognition of the collective's value and past contributions, support for continuation with oversight and clearer KPIs, requests for better prioritization and community input, concerns about overlap with other bodies like the Procurement Committee, warnings that onerous reporting could discourage participation, and suggestions to leverage existing research rather than creating additional groups.",
    tags: ["forum", "discussion"],
  },
  {
    id: "query-008",
    query: "What are the key arguments for and against the Treasury Management proposal?",
    // TMC Consolidating + Strategic Treasury Management + Treasury Management v1.2
    expectedProposalIds: [
      "f8acceba-4240-466b-96c1-68847071cce3",
      "59d9ec7e-e4a1-4ae0-9203-dbd075204a6a",
      "3d3c871d-54c4-479d-8273-003f660c9f9e",
    ],
    referenceAnswer:
      "Arguments FOR: consolidate STEP/TMC/GMC into one council to reduce fragmentation, put idle treasury assets to productive use via yield-bearing strategies, enable diversified risk-aware deployment, and increase transparency with regular reporting. Arguments AGAINST: concentration of power in a single Execution Body, unclear cost breakdown and missing KPIs, market and governance risks from ARB/ETH conversions, timing concerns and data gaps, and need for clearer operational controls.",
    tags: ["forum", "discussion"],
  },

  // --- Cross-stage queries ---
  {
    id: "query-009",
    query: "How did the Snapshot vote results compare with forum sentiment for the STIP proposal?",
    // STIP-Bridge + original STIP + Incentives Detox (related discussion)
    expectedProposalIds: [
      "78498e37-369e-4829-9e44-2cffbe95066d",
      "71c572cb-272f-425e-9a04-ea9ffc710327",
      "ca0e82b3-1fcd-4be0-bec4-77bfcf1f273a",
    ],
    referenceAnswer:
      "Forum sentiment on STIP was mixed and often critical, with concerns about audits, PM oversight, tighter criteria, and operational strain. However, the Snapshot temperature check was successful, with the community deciding on 50M ARB. Proposers updated the proposal to address forum concerns, and some participants who expressed concerns on the forum ended up voting FOR on Tally.",
    tags: ["cross-stage", "comparison"],
  },
  {
    id: "query-010",
    query: "Track the full lifecycle of the Security Council Elections proposal from forum to on-chain vote.",
    // AIP-6 SC Elections + SC Election Start Date + SC Election Process Improvements + SC Improvement Proposal
    expectedProposalIds: [
      "42079e13-6001-42a5-a6f8-f03004d4ba6e",
      "6dcc947d-f364-47c3-9e42-3c416b3f388f",
      "c44fd087-f13a-46f7-971e-10ac0b06917b",
    ],
    referenceAnswer:
      "The Security Council Elections lifecycle: (1) Forum — AIP-6 proposed the election system with code and audits; (2) Forum — Constitutional AIP proposed changes to Section 4 of the Constitution for the election process; (3) Forum — A proposal to adjust the election start date for a security audit; (4) On-chain — The implementation went to a Tally vote, passed quorum, and was executed.",
    tags: ["cross-stage", "lifecycle"],
  },

  // --- Specific detail queries ---
  {
    id: "query-011",
    query: "What is the budget requested in the Questbook DDA program proposal?",
    // Questbook DDA Phase 2 + Additional Funding for DDA
    expectedProposalIds: ["deec594d-3be9-4ae3-b920-000d7dd4f8d8", "d75da74f-c431-44e4-b7f2-8f4ce06264da"],
    referenceAnswer:
      "The Questbook DDA Program Phase 2 Request for Continuation requested a budget of $4,000,000 for two quarters.",
    tags: ["detail", "factual"],
  },
  {
    id: "query-012",
    query: "What voting options were available for the ARB Staking proposal on Snapshot?",
    // Activate ARB Staking (FINAL) + ARB Staking Unlock
    expectedProposalIds: ["9d78f0c5-84a4-47f0-b76f-cce5b6fbc99c", "dfde6c34-48a4-4455-82fd-4d1d4b7becaf"],
    referenceAnswer:
      "The ARB Staking proposal used ranked-choice voting on Snapshot with five options: Fund staking with 1.75% (175M ARB), 1.5% (150M ARB), 1.25% (125M ARB), 1% (100M ARB) of total ARB supply, or Do not fund staking.",
    tags: ["detail", "factual"],
  },

  // --- Process knowledge queries (with reference answers for correctness) ---
  {
    id: "query-013",
    query: "What are the three stages a proposal goes through in Arbitrum governance?",
    // "How to submit a DAO Proposal" + "The incomplete guide"
    expectedProposalIds: ["ebd603be-79a2-4a16-95a4-f55b9f7cbb22", "f3dab617-1aa9-4af3-99be-4ecad3895836"],
    referenceAnswer:
      "Arbitrum governance proposals typically go through three stages: (1) Forum discussion on the Arbitrum DAO governance forum, (2) Snapshot temperature check for off-chain voting, and (3) Tally on-chain vote for final execution.",
    tags: ["factual", "process"],
  },
  {
    id: "query-014",
    query: "What is the role of the Security Council in Arbitrum governance?",
    // SC Improvement Proposal + AIP-6 SC Elections + SC Election Process Improvements
    expectedProposalIds: [
      "219ba0ae-ee51-4d93-8926-f5aa4a81a5e3",
      "42079e13-6001-42a5-a6f8-f03004d4ba6e",
      "c44fd087-f13a-46f7-971e-10ac0b06917b",
    ],
    referenceAnswer:
      "The Arbitrum Security Council is a 12-member multi-sig body responsible for emergency actions and routine maintenance of Arbitrum chains. It can act faster than the full AIP process in emergencies, approve routine software upgrades, and serve as a check on token-holder governance. Members are elected through a semi-annual on-chain governance process.",
    tags: ["factual", "process"],
  },
  {
    id: "query-015",
    query: "How does the Snapshot voting process work for Arbitrum proposals?",
    // "How to submit" + "Incomplete guide" + "AIP-1.2 Foundation and DAO governance"
    expectedProposalIds: [
      "ebd603be-79a2-4a16-95a4-f55b9f7cbb22",
      "f3dab617-1aa9-4af3-99be-4ecad3895836",
      "bdb07611-bd5a-4142-aa57-f33c88c7c5e7",
    ],
    referenceAnswer:
      "Snapshot voting for Arbitrum proposals is an off-chain, non-binding temperature check where ARB token holders vote without gas fees. Polls typically run for 7 days with simple majority and no quorum requirement. A wallet representing at least 0.01% of votable tokens (1M ARB) is required to post a Snapshot vote. The results gauge community sentiment before a proposal moves to an on-chain Tally vote.",
    tags: ["factual", "process"],
  },
];
