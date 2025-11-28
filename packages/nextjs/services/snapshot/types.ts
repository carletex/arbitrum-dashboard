// Snapshot GraphQL API response types
export type SnapshotProposal = {
  id: string;
  title: string;
  body: string;
  state: string;
  link: string;
  created: number;
  start: number;
  end: number;
  author: string;
  choices: string[];
  scores: number[];
  scores_total: number;
};

export type SnapshotAPIResponse = {
  data: {
    proposals: SnapshotProposal[];
  };
};
