export interface MatchJob {
  id: string;
  status: "running" | "completed" | "error";
  result?: { status: string; proposalId: string | null };
  error?: string;
  createdAt: number;
  completedAt?: number;
}

// Use globalThis to ensure a single shared Map across all Next.js API route bundles
const globalJobs = globalThis as unknown as { __matchJobs?: Map<string, MatchJob>; __matchJobCounter?: number };
if (!globalJobs.__matchJobs) {
  globalJobs.__matchJobs = new Map<string, MatchJob>();
}
if (!globalJobs.__matchJobCounter) {
  globalJobs.__matchJobCounter = 0;
}

const jobs = globalJobs.__matchJobs;

function cleanup() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < oneHourAgo) {
      jobs.delete(id);
    }
  }
}

export function createJob(): string {
  cleanup();
  const id = `job_${Date.now()}_${++globalJobs.__matchJobCounter!}`;
  jobs.set(id, { id, status: "running", createdAt: Date.now() });
  return id;
}

export function completeJob(id: string, result: { status: string; proposalId: string | null }) {
  const job = jobs.get(id);
  if (job) {
    job.status = "completed";
    job.result = result;
    job.completedAt = Date.now();
  }
}

export function failJob(id: string, error: string) {
  const job = jobs.get(id);
  if (job) {
    job.status = "error";
    job.error = error;
    job.completedAt = Date.now();
  }
}

export function getJob(id: string): MatchJob | undefined {
  return jobs.get(id);
}
