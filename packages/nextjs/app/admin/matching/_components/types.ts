export interface PendingStage {
  sourceType: "snapshot" | "tally";
  stageId: string;
  title: string | null;
  authorName: string | null;
  url: string | null;
}

export interface MatchingResultRow {
  id: string;
  source_type: string;
  source_stage_id: string;
  proposal_id: string | null;
  status: string;
  method: string;
  confidence: number | null;
  reasoning: string | null;
  source_title: string | null;
  source_url: string | null;
  matched_forum_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  proposal_title: string | null;
}
