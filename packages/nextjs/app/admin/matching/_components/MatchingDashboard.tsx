"use client";

import { useCallback, useEffect, useState } from "react";
import { MatchingResultsTable } from "./MatchingResultsTable";
import { PendingStagesTable } from "./PendingStagesTable";
import { MatchingResultRow, PendingStage } from "./types";

export function MatchingDashboard() {
  const [pending, setPending] = useState<PendingStage[]>([]);
  const [results, setResults] = useState<MatchingResultRow[]>([]);
  const [runningJobs, setRunningJobs] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [pendingRes, resultsRes] = await Promise.all([
        fetch("/api/admin/matching/pending"),
        fetch("/api/admin/matching/results"),
      ]);

      if (pendingRes.ok) setPending(await pendingRes.json());
      if (resultsRes.ok) setResults(await resultsRes.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pollJob = useCallback(
    async (jobId: string, stageId: string) => {
      let retries = 0;
      const poll = async () => {
        try {
          const res = await fetch(`/api/admin/matching/status/${jobId}`);
          if (!res.ok) {
            retries++;
            if (retries >= 3) {
              // After 3 failed polls, give up and clean up loading state
              setRunningJobs(prev => {
                const next = new Map(prev);
                next.delete(stageId);
                return next;
              });
              setError("Lost track of matching job. Please refresh the page.");
              return;
            }
            setTimeout(poll, 2000);
            return;
          }
          retries = 0;
          const job = await res.json();

          if (job.status === "completed" || job.status === "error") {
            setRunningJobs(prev => {
              const next = new Map(prev);
              next.delete(stageId);
              return next;
            });
            await fetchData();
            return;
          }

          // Still running, poll again
          setTimeout(poll, 2000);
        } catch {
          // On error, stop polling
          setRunningJobs(prev => {
            const next = new Map(prev);
            next.delete(stageId);
            return next;
          });
        }
      };
      setTimeout(poll, 2000);
    },
    [fetchData],
  );

  const executeMatch = useCallback(
    async (sourceType: "snapshot" | "tally", stageId: string) => {
      // Show loading immediately before the API call
      setRunningJobs(prev => new Map(prev).set(stageId, "pending"));

      try {
        const res = await fetch("/api/admin/matching/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType, stageId }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to start matching");
          setRunningJobs(prev => {
            const next = new Map(prev);
            next.delete(stageId);
            return next;
          });
          return;
        }

        const { jobId } = await res.json();
        setRunningJobs(prev => new Map(prev).set(stageId, jobId));
        pollJob(jobId, stageId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start matching");
        setRunningJobs(prev => {
          const next = new Map(prev);
          next.delete(stageId);
          return next;
        });
      }
    },
    [pollJob],
  );

  const matchAll = useCallback(() => {
    for (const stage of pending) {
      executeMatch(stage.sourceType, stage.stageId);
    }
  }, [pending, executeMatch]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section>
        <h2 className="text-2xl font-semibold mb-4">Pending Stages</h2>
        <PendingStagesTable stages={pending} runningJobs={runningJobs} onMatch={executeMatch} onMatchAll={matchAll} />
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Matching Results</h2>
        <MatchingResultsTable results={results} runningJobs={runningJobs} onRematch={executeMatch} />
      </section>
    </div>
  );
}
