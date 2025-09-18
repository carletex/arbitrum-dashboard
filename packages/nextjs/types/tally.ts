export interface TallyBlock {
  number: number;
  timestamp: string;
}

export interface TallyCreator {
  address: string;
  name: string;
  ens: string;
}

export interface TallyGovernor {
  name: string;
  slug: string;
  timelockId?: string;
}

export interface TallyMetadata {
  title: string;
  description: string;
  eta?: string;
  ipfsHash?: string;
  previousEnd?: string;
  timelockId?: string;
  txHash?: string;
  discourseURL?: string;
  snapshotURL?: string;
}

export interface TallyVoteStat {
  type: "for" | "against" | "abstain" | "pendingfor" | "pendingagainst" | "pendingabstain";
  votesCount: string;
  votersCount: number;
  percent: number;
}

export interface TallyExecutableCall {
  calldata: string;
  target: string;
  value: string;
}

export type TallyProposalEventType =
  | "created"
  | "activated"
  | "queued"
  | "executed"
  | "canceled"
  | "defeated"
  | "expired"
  | "extended"
  | "succeeded"
  | "drafted"
  | "pendingexecution"
  | "callexecuted"
  | "crosschainexecuted";

export interface TallyProposalEvent {
  block?: TallyBlock;
  chainId: string;
  createdAt: string;
  type: TallyProposalEventType;
  txHash?: string;
}

export interface TallyProposal {
  id: string;
  onchainId: string;
  chainId: string;
  status: string;
  metadata: TallyMetadata;
  creator: TallyCreator;
  proposer: TallyCreator;
  governor: TallyGovernor;
  voteStats: TallyVoteStat[];
  start: TallyBlock;
  end: TallyBlock;
  createdAt: string;
  executableCalls: TallyExecutableCall[];
  events?: TallyProposalEvent[];
}

export interface TallyPageInfo {
  firstCursor: string;
  lastCursor: string;
  count: number;
}

export interface TallyProposalsResponse {
  data: {
    proposals: {
      nodes: TallyProposal[];
      pageInfo: TallyPageInfo;
    };
  };
}

export interface TallyApiError {
  message: string;
  extensions?: {
    code?: string;
  };
}

export interface TallyErrorResponse {
  errors: TallyApiError[];
}
