"use client";

import { useMemo, useState } from "react";
import { StatsCard } from "./StatsCard";
import { ArrowTopRightOnSquareIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { STAT_CARD_CONFIG, computeStats } from "~~/utils/governanceStats";
import type { DashboardProposal } from "~~/utils/proposalTransforms";

const getStatus = (p: DashboardProposal) => {
  if (p.tallyStatus === "Executed") return "Executed";
  if (p.tallyStatus?.startsWith("Pending execution")) return "Pending execution";
  if (p.tallyStatus === "Canceled") return "Canceled";
  if (p.snapshotStatus === "Passed") return "Awaiting On-chain Vote";
  if (p.snapshotStatus === "Failed") return "Failed Off-chain";
  if (p.forumStatus === "Active Discussion") return "In Discussion";
  return "Draft";
};

const getBadgeColor = (p: DashboardProposal) => {
  if (p.tallyLink) return "border-cyan-200 bg-cyan-100 text-cyan-600";
  if (p.snapshotLink) return "border-purple-200 bg-purple-100 text-purple-600";
  return "border-orange-200 bg-orange-100 text-orange-600";
};

export const ArbitrumGovernanceDashboard = ({ proposals }: { proposals: DashboardProposal[] }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showForumOnly, setShowForumOnly] = useState(false);

  const filtered = useMemo(
    () =>
      proposals.filter(p => {
        const search = searchTerm.toLowerCase();
        if (search && !p.title.toLowerCase().includes(search) && !p.author?.toLowerCase().includes(search))
          return false;
        if (statusFilter !== "all" && !getStatus(p).toLowerCase().includes(statusFilter.toLowerCase())) return false;
        if (categoryFilter !== "all" && p.category?.toLowerCase() !== categoryFilter.toLowerCase()) return false;
        if (!showForumOnly && !p.snapshotStatus && !p.tallyStatus) return false;
        return true;
      }),
    [searchTerm, statusFilter, categoryFilter, showForumOnly, proposals],
  );

  const stats = useMemo(() => computeStats(proposals), [proposals]);

  return (
    <div className="mx-auto w-full max-w-[1480px] px-5  py-1 lg:py-3 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Arbitrum DAO Governance</h1>
        <p className="text-base-content/60">Unified proposal tracking across all governance stages</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARD_CONFIG.map(config => (
          <StatsCard key={config.key} config={config} value={stats[config.key]} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="input input-bordered flex items-center gap-2 w-72 max-w-full">
            <MagnifyingGlassIcon className="w-4 h-4" />
            <input
              type="text"
              className="grow"
              placeholder="Search proposals or authors..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </label>
          <select
            className="select select-bordered w-48 max-w-full"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="discussion">In Discussion</option>
            <option value="executed">Executed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="canceled">Canceled</option>
          </select>
          <select
            className="select select-bordered w-56 max-w-full"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            <option value="constitutional">Constitutional</option>
            <option value="non-constitutional">Non-Constitutional</option>
            <option value="treasury">Treasury</option>
          </select>
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-sm font-medium">Show forum proposals</span>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={showForumOnly}
            onChange={() => setShowForumOnly(!showForumOnly)}
          />
        </label>
      </div>

      {/* Table */}
      <div className="card bg-base-100 border border-base-300 shadow-sm rounded-xl">
        <div className="p-3 lg:p-4 border-b border-base-300 flex items-center justify-end">
          <p className="text-sm text-base-content/60 p-0 m-0">
            Showing {filtered.length} of {proposals.length} proposals
          </p>
        </div>
        <div className="relative w-full overflow-x-auto">
          <table className="table table-sm w-full min-w-[1100px]">
            <thead>
              <tr>
                <th className="w-[30%]">Proposal</th>
                <th>Status</th>
                <th>
                  <div className="flex flex-col">
                    <span>Offchain</span>
                    <span className="text-xs text-base-content/60 font-normal">(Snapshot)</span>
                  </div>
                </th>
                <th>
                  <div className="flex flex-col">
                    <span>Onchain</span>
                    <span className="text-xs text-base-content/60 font-normal">(Tally)</span>
                  </div>
                </th>
                <th>Category</th>
                <th>Votes</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-base-content/60">
                    No proposals found
                  </td>
                </tr>
              )}
              {filtered.map(p => (
                <tr key={p.id}>
                  <td className="max-w-xl">
                    <div className="font-medium text-sm mb-1 truncate">{p.title}</div>
                    {p.author && <div className="text-xs text-base-content/60">by {p.author}</div>}
                  </td>
                  <td>
                    <div className={`badge badge-sm whitespace-nowrap border ${getBadgeColor(p)}`}>{getStatus(p)}</div>
                  </td>
                  <td>
                    {p.snapshotStatus ? (
                      <div className="flex flex-col gap-1">
                        <div className="badge badge-sm whitespace-nowrap border border-purple-200 bg-purple-100 text-purple-600">
                          {p.snapshotStatus}
                        </div>
                        {p.snapshotLastUpdate && (
                          <span className="text-xs text-base-content/60">{p.snapshotLastUpdate}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-base-content/60">Not started</span>
                    )}
                  </td>
                  <td>
                    {p.tallyStatus ? (
                      <div className="flex flex-col gap-1">
                        <div className="badge badge-sm whitespace-nowrap border border-cyan-200 bg-cyan-100 text-cyan-600">
                          {p.tallyStatus.startsWith("Pending execution")
                            ? p.tallyStatus.replace("Pending execution (", "").replace(")", "")
                            : p.tallyStatus}
                        </div>
                        {p.tallyLastUpdate && <span className="text-xs text-base-content/60">{p.tallyLastUpdate}</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-base-content/60">Not started</span>
                    )}
                  </td>
                  <td>
                    <div className="badge badge-sm whitespace-nowrap border border-base-300 bg-transparent text-base-content/70">
                      {p.category}
                    </div>
                  </td>
                  <td>
                    {p.votes ? (
                      <div className="text-xs leading-tight">
                        <div className="text-green-600 font-semibold">For: {p.votes.for}</div>
                        <div className="text-red-600 font-semibold">Against: {p.votes.against}</div>
                        <div className="text-base-content/60">Total: {p.votes.total}</div>
                      </div>
                    ) : (
                      <span className="text-base-content/60 text-xs">No votes yet</span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      {p.forumLink && (
                        <Link href={p.forumLink} label="Forum" color="text-orange-500" bg="bg-orange-100" />
                      )}
                      {p.snapshotLink && (
                        <Link href={p.snapshotLink} label="Snapshot" color="text-purple-500" bg="bg-purple-100" />
                      )}
                      {p.tallyLink && <Link href={p.tallyLink} label="Tally" color="text-cyan-500" bg="bg-cyan-100" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const Link = ({ href, label, color, bg }: { href: string; label: string; color: string; bg: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={`flex items-center gap-1.5 ${color} hover:underline`}
  >
    <div className={`w-4 h-4 rounded ${bg} flex items-center justify-center`}>
      <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
    </div>
    <span className="text-xs">{label}</span>
  </a>
);
