"use client";

import { useMemo, useRef, useState } from "react";
import { MatchingResultRow } from "./types";

interface Props {
  results: MatchingResultRow[];
  runningJobs: Map<string, string>;
  onRematch: (sourceType: "snapshot" | "tally", stageId: string) => void;
}

function statusBadgeColor(status: string) {
  switch (status) {
    case "matched":
      return "border-green-200 bg-green-100 text-green-600";
    case "no_match":
      return "border-red-200 bg-red-100 text-red-600";
    case "pending_review":
      return "border-yellow-200 bg-yellow-100 text-yellow-600";
    default:
      return "border-base-300 bg-transparent text-base-content/70";
  }
}

function typeBadgeColor(sourceType: string) {
  return sourceType === "snapshot"
    ? "border-purple-200 bg-purple-100 text-purple-600"
    : "border-cyan-200 bg-cyan-100 text-cyan-600";
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.round(diffDay / 30);
  return `${diffMonth}mo ago`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

function ResultDetailModal({
  result,
  isRunning,
  onRematch,
  onClose,
}: {
  result: MatchingResultRow;
  isRunning: boolean;
  onRematch: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <dialog ref={dialogRef} className="modal modal-open" onClose={onClose}>
      <div className="modal-box max-w-lg">
        <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>
          ✕
        </button>

        <h3 className="font-bold text-lg mb-4">Match Details</h3>

        {/* Source */}
        <div className="mb-3">
          <div className="text-xs text-base-content/60 mb-1">Source</div>
          <div className="flex items-start gap-2">
            <span
              className={`badge badge-sm whitespace-nowrap border ${typeBadgeColor(result.source_type)} shrink-0 mt-0.5`}
            >
              {result.source_type}
            </span>
            <span className="font-medium">{result.source_title ?? "—"}</span>
          </div>
          {result.source_url && (
            <a
              href={result.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="link link-primary text-sm mt-1 block break-all"
            >
              {result.source_url}
            </a>
          )}
        </div>

        {/* Status & Confidence */}
        <div className="flex gap-6 mb-3">
          <div>
            <div className="text-xs text-base-content/60 mb-1">Status</div>
            <span className={`badge badge-sm whitespace-nowrap border ${statusBadgeColor(result.status)}`}>
              {result.status}
            </span>
          </div>
          <div>
            <div className="text-xs text-base-content/60 mb-1">Confidence</div>
            <span className="font-mono">{result.confidence ?? "—"}</span>
          </div>
          <div>
            <div className="text-xs text-base-content/60 mb-1">Method</div>
            <span className="text-sm">{result.method}</span>
          </div>
        </div>

        {/* Matched Proposal */}
        <div className="mb-3">
          <div className="text-xs text-base-content/60 mb-1">Matched Proposal</div>
          <div className="font-medium">{result.proposal_title ?? "—"}</div>
        </div>

        {/* Forum URL */}
        <div className="mb-3">
          <div className="text-xs text-base-content/60 mb-1">Forum URL</div>
          {result.matched_forum_url ? (
            <a
              href={result.matched_forum_url}
              target="_blank"
              rel="noopener noreferrer"
              className="link link-secondary text-sm break-all"
            >
              {result.matched_forum_url}
            </a>
          ) : (
            <span className="text-sm text-base-content/40">—</span>
          )}
        </div>

        {/* Reasoning */}
        <div className="mb-3">
          <div className="text-xs text-base-content/60 mb-1">Reasoning</div>
          <div className="bg-base-200 rounded-lg p-3 text-sm whitespace-pre-wrap">{result.reasoning ?? "—"}</div>
        </div>

        {/* Timestamps */}
        <div className="flex gap-6 mb-4">
          <div>
            <div className="text-xs text-base-content/60 mb-1">Created</div>
            <span className="text-sm">{formatDate(result.created_at)}</span>
          </div>
          <div>
            <div className="text-xs text-base-content/60 mb-1">Updated</div>
            <span className="text-sm">{formatDate(result.updated_at)}</span>
          </div>
        </div>

        {/* Action */}
        <div className="modal-action">
          <button className="btn btn-primary btn-sm" onClick={onRematch} disabled={isRunning}>
            {isRunning ? <span className="loading loading-spinner loading-xs" /> : "Re-match"}
          </button>
          <button className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}

export function MatchingResultsTable({ results, runningJobs, onRematch }: Props) {
  const [selectedResult, setSelectedResult] = useState<MatchingResultRow | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceTypeFilter, setSourceTypeFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");

  const filtered = useMemo(() => {
    return results.filter(row => {
      if (searchTerm && !(row.source_title ?? "").toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (sourceTypeFilter && row.source_type !== sourceTypeFilter) return false;
      if (methodFilter && row.method !== methodFilter) return false;
      return true;
    });
  }, [results, searchTerm, statusFilter, sourceTypeFilter, methodFilter]);

  if (results.length === 0) {
    return <div className="bg-base-200 rounded-xl p-6 text-center text-base-content/60">No matching results yet.</div>;
  }

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm rounded-xl">
      <div className="p-3 lg:p-4 border-b border-base-300 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search by title…"
          className="input input-bordered input-sm w-56"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        <select
          className="select select-bordered select-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="matched">matched</option>
          <option value="no_match">no_match</option>
          <option value="pending_review">pending_review</option>
        </select>
        <select
          className="select select-bordered select-sm"
          value={sourceTypeFilter}
          onChange={e => setSourceTypeFilter(e.target.value)}
        >
          <option value="">All Sources</option>
          <option value="snapshot">snapshot</option>
          <option value="tally">tally</option>
        </select>
        <select
          className="select select-bordered select-sm"
          value={methodFilter}
          onChange={e => setMethodFilter(e.target.value)}
        >
          <option value="">All Methods</option>
          <option value="llm">llm</option>
          <option value="csv_import">csv_import</option>
          <option value="manual_override">manual_override</option>
        </select>
        <p className="text-sm text-base-content/60 p-0 m-0 ml-auto">
          Showing {filtered.length} of {results.length} result(s)
        </p>
      </div>
      <div className="relative w-full overflow-x-auto">
        <table className="table table-sm w-full">
          <thead>
            <tr>
              <th>Source Title</th>
              <th>Status</th>
              <th className="hidden xl:table-cell">Confidence</th>
              <th className="hidden xl:table-cell">Method</th>
              <th className="hidden lg:table-cell">Updated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => {
              const isRunning = runningJobs.has(row.source_stage_id);
              return (
                <tr key={row.id}>
                  <td className="max-w-[200px] lg:max-w-sm xl:max-w-xl">
                    <div className="flex items-center gap-2">
                      <span
                        className={`badge badge-sm whitespace-nowrap border ${typeBadgeColor(row.source_type)} shrink-0`}
                      >
                        {row.source_type}
                      </span>
                      <span className="font-medium text-sm truncate" title={row.source_title ?? ""}>
                        {row.source_title ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className={`badge badge-sm whitespace-nowrap border ${statusBadgeColor(row.status)}`}>
                        {row.status}
                      </span>
                      <button className="link text-xs" onClick={() => setSelectedResult(row)}>
                        Details
                      </button>
                    </div>
                  </td>
                  <td className="hidden xl:table-cell font-mono text-sm">{row.confidence ?? "—"}</td>
                  <td className="hidden xl:table-cell">
                    <span className="badge badge-sm whitespace-nowrap border border-base-300 bg-transparent text-base-content/70">
                      {row.method}
                    </span>
                  </td>
                  <td className="hidden lg:table-cell text-xs text-base-content/70" title={formatDate(row.updated_at)}>
                    {relativeTime(row.updated_at)}
                  </td>
                  <td>
                    <button
                      className="btn btn-primary btn-xs"
                      onClick={() => onRematch(row.source_type as "snapshot" | "tally", row.source_stage_id)}
                      disabled={isRunning}
                    >
                      {isRunning ? <span className="loading loading-spinner loading-xs" /> : "Re-match"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedResult && (
        <ResultDetailModal
          result={selectedResult}
          isRunning={runningJobs.has(selectedResult.source_stage_id)}
          onRematch={() => {
            onRematch(selectedResult.source_type as "snapshot" | "tally", selectedResult.source_stage_id);
          }}
          onClose={() => setSelectedResult(null)}
        />
      )}
    </div>
  );
}
