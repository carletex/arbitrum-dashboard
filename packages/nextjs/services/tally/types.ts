// Tally GraphQL API response types
export type TallyProposal = {
  id: string;
  onchainId: string | null;
  chainId: number;
  status: string;
  metadata: {
    title: string | null;
    description: string | null;
    eta: string | null;
    ipfsHash: string | null;
    previousEnd: string | null;
    timelockId: string | null;
    txHash: string | null;
    discourseURL: string | null;
    snapshotURL: string | null;
  };
  creator: {
    address: string;
    name: string | null;
    ens: string | null;
  };
  proposer: {
    address: string;
    name: string | null;
    ens: string | null;
  };
  governor: {
    name: string;
    slug: string;
    timelockId: string | null;
  };
  voteStats: Array<{
    type: string;
    votesCount: string;
    votersCount: string;
    percent: string;
  }>;
  start: {
    number: number;
    timestamp: string;
  } | null;
  end: {
    number: number;
    timestamp: string;
  } | null;
  createdAt: string;
  executableCalls: Array<{
    calldata: string;
    target: string;
    value: string;
  }>;
  events: Array<{
    block: {
      number: number;
      timestamp: string;
    };
    chainId: number;
    createdAt: string;
    type: string;
    txHash: string | null;
  }>;
};

export type TallyAPIResponse = {
  data?: {
    proposals: {
      nodes: TallyProposal[];
      pageInfo: {
        firstCursor: string | null;
        lastCursor: string | null;
        count: number;
      };
    };
  };
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
  }>;
};

export const TALLY_GOVERNORS = [
  "eip155:42161:0x789fC99093B09aD01C34DC7251D0C89ce743e5a4", // Arbitrum Treasury
  "eip155:42161:0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9", // Arbitrum CORE
] as const;
