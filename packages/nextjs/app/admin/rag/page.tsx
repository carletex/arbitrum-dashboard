"use client";

import { useState } from "react";

interface Citation {
  proposal_id: string;
  stage: string;
  url: string;
  snippet: string;
  title?: string;
}

interface QueryResponse {
  success: boolean;
  answer?: string;
  citations?: Citation[];
  error?: string;
}

export default function RagAdminPage() {
  const [query, setQuery] = useState("");
  const [queryResponse, setQueryResponse] = useState<QueryResponse | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);

  const [stageFilters, setStageFilters] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("");

  const handleQuery = async () => {
    if (!query.trim()) return;

    setQueryLoading(true);
    setQueryResponse(null);

    try {
      const filters: { stage?: string[]; status?: string[] } = {};
      if (stageFilters.length > 0) {
        filters.stage = stageFilters;
      }
      if (statusFilter) {
        filters.status = [statusFilter];
      }

      const res = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        }),
      });

      const data = await res.json();
      setQueryResponse(data);
    } catch (error) {
      setQueryResponse({
        success: false,
        error: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      setQueryLoading(false);
    }
  };

  const toggleStageFilter = (stage: string) => {
    setStageFilters(prev => (prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage]));
  };

  const getStageBadgeClass = (stage: string) => {
    switch (stage) {
      case "forum":
        return "badge-info";
      case "snapshot":
        return "badge-warning";
      case "tally":
        return "badge-success";
      default:
        return "badge-ghost";
    }
  };

  return (
    <div className="flex flex-col gap-8 px-4 py-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold mb-2">Proposal RAG</h1>
        <p className="text-base-content/70">Search and query Arbitrum governance proposals using natural language.</p>
      </div>

      {/* Query Section */}
      <div className="bg-base-100 rounded-xl p-6 shadow-lg border border-base-300">
        <h2 className="text-xl font-semibold mb-4">Ask a Question</h2>

        <div className="flex flex-col gap-4">
          <textarea
            className="textarea textarea-bordered w-full min-h-24 text-base"
            placeholder="What proposals are related to treasury management?"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleQuery();
              }
            }}
          />

          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Stage:</span>
              {["forum", "snapshot", "tally"].map(stage => (
                <button
                  key={stage}
                  className={`btn btn-xs ${stageFilters.includes(stage) ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => toggleStageFilter(stage)}
                >
                  {stage}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <select
                className="select select-bordered select-sm"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="pending">Pending</option>
                <option value="executed">Executed</option>
                <option value="defeated">Defeated</option>
              </select>
            </div>
          </div>

          <button
            className={`btn btn-primary w-full ${queryLoading ? "loading" : ""}`}
            onClick={handleQuery}
            disabled={queryLoading || !query.trim()}
          >
            {queryLoading ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Query Response */}
        {queryResponse && (
          <div className="mt-6">
            {queryResponse.success ? (
              <div className="flex flex-col gap-4">
                <div className="bg-base-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-2">Answer</h3>
                  <p className="whitespace-pre-wrap">{queryResponse.answer}</p>
                </div>

                {queryResponse.citations && queryResponse.citations.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Sources</h3>
                    <div className="flex flex-col gap-2">
                      {queryResponse.citations.map((citation, idx) => (
                        <div key={idx} className="bg-base-200 rounded-lg p-3 text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`badge badge-sm ${getStageBadgeClass(citation.stage)}`}>
                              {citation.stage}
                            </span>
                            {citation.title && <span className="font-medium">{citation.title}</span>}
                          </div>
                          <p className="text-base-content/70 text-xs mb-2">{citation.snippet}</p>
                          {citation.url && (
                            <a
                              href={citation.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="link link-primary text-xs"
                            >
                              View Source →
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="alert alert-error">
                <span>{queryResponse.error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
