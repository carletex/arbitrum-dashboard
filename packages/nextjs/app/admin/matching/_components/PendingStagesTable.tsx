"use client";

import { PendingStage } from "./types";

interface Props {
  stages: PendingStage[];
  runningJobs: Map<string, string>;
  onMatch: (sourceType: "snapshot" | "tally", stageId: string) => void;
  onMatchAll: () => void;
}

export function PendingStagesTable({ stages, runningJobs, onMatch, onMatchAll }: Props) {
  if (stages.length === 0) {
    return (
      <div className="bg-base-200 rounded-xl p-6 text-center text-base-content/60">No pending stages to match.</div>
    );
  }

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm rounded-xl">
      <div className="p-3 lg:p-4 border-b border-base-300 flex items-center justify-between">
        <span className="text-sm text-base-content/60">{stages.length} pending stage(s)</span>
        <button className="btn btn-primary btn-sm" onClick={onMatchAll} disabled={runningJobs.size > 0}>
          {runningJobs.size > 0 ? (
            <>
              <span className="loading loading-spinner loading-xs" /> Matching...
            </>
          ) : (
            "Match All Pending"
          )}
        </button>
      </div>
      <div className="relative w-full overflow-x-auto">
        <table className="table table-sm w-full">
          <thead>
            <tr>
              <th>Type</th>
              <th>Title</th>
              <th>Author</th>
              <th>URL</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {stages.map(stage => {
              const isRunning = runningJobs.has(stage.stageId);
              return (
                <tr key={stage.stageId}>
                  <td>
                    <span
                      className={`badge badge-sm ${stage.sourceType === "snapshot" ? "badge-info" : "badge-warning"}`}
                    >
                      {stage.sourceType}
                    </span>
                  </td>
                  <td className="max-w-xs truncate" title={stage.title ?? ""}>
                    {stage.title ?? "—"}
                  </td>
                  <td className="max-w-[120px] truncate">{stage.authorName ?? "—"}</td>
                  <td>
                    {stage.url ? (
                      <a
                        href={stage.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link link-primary text-xs"
                      >
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn-primary btn-xs"
                      onClick={() => onMatch(stage.sourceType, stage.stageId)}
                      disabled={isRunning}
                    >
                      {isRunning ? <span className="loading loading-spinner loading-xs" /> : "Match"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
