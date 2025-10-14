"use client";

import { useMemo, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  ArrowTrendingUpIcon,
  CalendarDaysIcon,
  InboxStackIcon,
  MagnifyingGlassIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

// Mock data based on the provided Arbitrum governance information (ported from v0)
const mockProposals = [
  {
    id: 1,
    title: "[CONSTITUTIONAL] AIP: ArbOS Version 50 Dia",
    forumLink: "https://forum.arbitrum.foundation/t/constitutional-aip-arbos-version-50-dia/29835",
    snapshotLink: null,
    tallyLink: null,
    forumStatus: "Active Discussion",
    snapshotStatus: null,
    tallyStatus: null,
    forumLastUpdate: "3d ago",
    snapshotLastUpdate: null,
    tallyLastUpdate: null,
    category: "Constitutional",
    author: "Offchain Labs",
    description: "Upgrade Arbitrum One and Nova to ArbOS 50 Dia with Fusaka compatibility",
  },
  {
    id: 2,
    title: "[CONSTITUTIONAL] Register $BORING in the Arbitrum generic-custom gateway",
    forumLink:
      "https://forum.arbitrum.foundation/t/constitutional-register-boring-in-the-arbitrum-generic-custom-gateway/29206",
    snapshotLink: "https://snapshot.box/#/s:arbitrumfoundation.eth/proposal/0x123",
    tallyLink:
      "https://www.tally.xyz/gov/arbitrum/proposal/97685288731263391833044854304895851471157040105038894699042975271050068874277",
    forumStatus: "Completed",
    snapshotStatus: "Passed",
    tallyStatus: "Executed",
    forumLastUpdate: "24d ago",
    snapshotLastUpdate: "18d ago",
    tallyLastUpdate: "12d ago",
    category: "Constitutional",
    author: "L2BEAT",
    description: "Register $BORING token in Arbitrum bridge for cross-chain functionality",
    votes: { for: "212.95M", against: "43.07K", total: "213.08M" },
    executionDate: "Jul 28th, 2025",
  },
  {
    id: 3,
    title: "Entropy Advisors: Exclusively Working with the Arbitrum DAO",
    forumLink:
      "https://forum.arbitrum.foundation/t/entropy-advisors-exclusively-working-with-the-arbitrum-dao-y2-y3/29458",
    snapshotLink: "https://snapshot.box/#/s:arbitrumfoundation.eth/proposal/0x456",
    tallyLink:
      "https://www.tally.xyz/gov/arbitrum/proposal/37638751032596392177176596241110468090299645534448966767963399982622616318705",
    forumStatus: "Completed",
    snapshotStatus: "Passed",
    tallyStatus: "Pending execution (Proposal queued)",
    forumLastUpdate: "45d ago",
    snapshotLastUpdate: "32d ago",
    tallyLastUpdate: "2d ago",
    category: "Treasury",
    author: "Entropy Advisors",
    description: "Exclusive engagement proposal for treasury management services",
    votes: { for: "158.68M", against: "16.59M", total: "215.95M" },
  },
  {
    id: 4,
    title: "Proposal: Revert the Delegate Incentive Program (DIP) to Version 1.5",
    forumLink:
      "https://forum.arbitrum.foundation/t/proposal-revert-the-delegate-incentive-program-dip-to-version-1-5/29867",
    snapshotLink: null,
    tallyLink: null,
    forumStatus: "Active Discussion",
    snapshotStatus: null,
    tallyStatus: null,
    forumLastUpdate: "16h ago",
    snapshotLastUpdate: null,
    tallyLastUpdate: null,
    category: "Non-Constitutional",
    author: "Instinct",
    description: "Proposal to revert DIP changes and return to previous version",
  },
  {
    id: 5,
    title: "[Constitutional] AIP: Constitutional Quorum Threshold Reduction",
    forumLink: "https://forum.arbitrum.foundation/t/constitutional-aip-constitutional-quorum-threshold-reduction/29145",
    snapshotLink: "https://snapshot.box/#/s:arbitrumfoundation.eth/proposal/0x789",
    tallyLink:
      "https://www.tally.xyz/gov/arbitrum/proposal/94423886836435773843507976898262621297544156552971145658873213763398017341229",
    forumStatus: "Completed",
    snapshotStatus: "Passed",
    tallyStatus: "Executed",
    forumLastUpdate: "21d ago",
    snapshotLastUpdate: "18d ago",
    tallyLastUpdate: "15d ago",
    category: "Constitutional",
    author: "Arbitrum Foundation",
    description: "Reduce quorum threshold to improve governance participation",
    votes: { for: "215.7M", against: "6.31M", total: "241.01M" },
    executionDate: "Jun 16th, 2025",
  },
  {
    id: 6,
    title: "[Treasury] Fund Arbitrum Gaming Catalyst Program",
    forumLink: "https://forum.arbitrum.foundation/t/fund-arbitrum-gaming-catalyst-program/29234",
    snapshotLink: "https://snapshot.box/#/s:arbitrumfoundation.eth/proposal/0xabc",
    tallyLink:
      "https://www.tally.xyz/gov/arbitrum/proposal/12345678901234567890123456789012345678901234567890123456789012345678901234567890",
    forumStatus: "Completed",
    snapshotStatus: "Passed",
    tallyStatus: "Pending execution (L2 Execution)",
    forumLastUpdate: "35d ago",
    snapshotLastUpdate: "28d ago",
    tallyLastUpdate: "5d ago",
    category: "Treasury",
    author: "Gaming DAO",
    description: "Funding proposal for gaming ecosystem development",
    votes: { for: "189.45M", against: "12.33M", total: "201.78M" },
  },
  {
    id: 7,
    title: "[Non-Constitutional] Arbitrum Research & Development Collective",
    forumLink: "https://forum.arbitrum.foundation/t/arbitrum-research-development-collective/29567",
    snapshotLink: "https://snapshot.box/#/s:arbitrumfoundation.eth/proposal/0xdef",
    tallyLink:
      "https://www.tally.xyz/gov/arbitrum/proposal/98765432109876543210987654321098765432109876543210987654321098765432109876543210",
    forumStatus: "Completed",
    snapshotStatus: "Passed",
    tallyStatus: "Pending execution (L2-to-L1 message)",
    forumLastUpdate: "42d ago",
    snapshotLastUpdate: "35d ago",
    tallyLastUpdate: "7d ago",
    category: "Non-Constitutional",
    author: "Research Collective",
    description: "Establish research and development collective for Arbitrum ecosystem",
    votes: { for: "167.89M", against: "8.91M", total: "176.80M" },
  },
  {
    id: 8,
    title: "[Constitutional] Update Arbitrum Security Council Election Process",
    forumLink: "https://forum.arbitrum.foundation/t/update-arbitrum-security-council-election-process/29678",
    snapshotLink: "https://snapshot.box/#/s:arbitrumfoundation.eth/proposal/0x999",
    tallyLink:
      "https://www.tally.xyz/gov/arbitrum/proposal/11111111111111111111111111111111111111111111111111111111111111111111111111111111",
    forumStatus: "Completed",
    snapshotStatus: "Failed",
    tallyStatus: "Canceled",
    forumLastUpdate: "28d ago",
    snapshotLastUpdate: "21d ago",
    tallyLastUpdate: "18d ago",
    category: "Constitutional",
    author: "Security Council",
    description: "Proposed updates to security council election procedures",
    votes: { for: "89.12M", against: "156.78M", total: "245.90M" },
  },
  {
    id: 9,
    title: "[Treasury] Arbitrum Developer Incentive Program Phase 2",
    forumLink: "https://forum.arbitrum.foundation/t/arbitrum-developer-incentive-program-phase-2/29789",
    snapshotLink: "https://snapshot.box/#/s:arbitrumfoundation.eth/proposal/0xdev2",
    tallyLink: null,
    forumStatus: "Completed",
    snapshotStatus: "Passed",
    tallyStatus: null,
    forumLastUpdate: "25d ago",
    snapshotLastUpdate: "8d ago",
    tallyLastUpdate: null,
    category: "Treasury",
    author: "Developer DAO",
    description: "Second phase of developer incentive program with expanded scope",
    votes: { for: "198.45M", against: "22.15M", total: "220.60M" },
  },
  {
    id: 10,
    title: "[Non-Constitutional] Arbitrum Ecosystem Growth Initiative",
    forumLink: "https://forum.arbitrum.foundation/t/arbitrum-ecosystem-growth-initiative/29823",
    snapshotLink: "https://snapshot.box/#/s:arbitrumfoundation.eth/proposal/0xgrow",
    tallyLink: null,
    forumStatus: "Completed",
    snapshotStatus: "Passed",
    tallyStatus: null,
    category: "Non-Constitutional",
    author: "Ecosystem Team",
    description: "Comprehensive initiative to accelerate ecosystem growth and adoption",
    votes: { for: "176.89M", against: "18.44M", total: "195.33M" },
  },
];

// Helper function to get overall status (ported from v0 logic)
const getOverallStatus = (proposal: any) => {
  if (proposal.tallyStatus === "Executed") return { status: "Executed", stage: "onchain" };
  if (proposal.tallyStatus && proposal.tallyStatus.startsWith("Pending execution"))
    return { status: "Pending execution", stage: "onchain" };
  if (proposal.tallyStatus === "Canceled") return { status: "Canceled", stage: "onchain" };
  if (proposal.snapshotStatus === "Passed") return { status: "Awaiting On-chain Vote", stage: "offchain" };
  if (proposal.snapshotStatus === "Failed") return { status: "Failed Off-chain", stage: "offchain" };
  if (proposal.forumStatus === "Active Discussion") return { status: "In Discussion", stage: "forum" };
  return { status: "Draft", stage: "forum" };
};

export const ArbitrumGovernanceDashboard = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showForumOnly, setShowForumOnly] = useState(false);

  // Filter proposals per PRD
  const filteredProposals = useMemo(() => {
    return mockProposals.filter(proposal => {
      const matchesSearch =
        proposal.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (proposal.author ? proposal.author.toLowerCase().includes(searchTerm.toLowerCase()) : false);

      const overall = getOverallStatus(proposal);

      const matchesStatus = statusFilter === "all" || overall.status.toLowerCase().includes(statusFilter.toLowerCase());

      const matchesCategory =
        categoryFilter === "all" || (proposal.category || "").toLowerCase() === categoryFilter.toLowerCase();

      // When toggle is OFF, exclude forum-only proposals; when ON, include all
      const matchesForumFilter = showForumOnly || proposal.snapshotStatus || proposal.tallyStatus;

      return matchesSearch && matchesStatus && matchesCategory && !!matchesForumFilter;
    });
  }, [searchTerm, statusFilter, categoryFilter, showForumOnly]);

  // Stats per PRD
  const stats = useMemo(() => {
    return {
      activeDiscussions: mockProposals.filter(p => p.forumStatus === "Active Discussion").length,
      activeOffchainVotes: mockProposals.filter(
        p => p.snapshotStatus && !["Passed", "Failed"].includes(p.snapshotStatus),
      ).length,
      activeOnchainVotes: mockProposals.filter(
        p =>
          p.tallyStatus &&
          !(["Executed", "Canceled"] as string[]).includes(p.tallyStatus) &&
          !String(p.tallyStatus).startsWith("Pending execution"),
      ).length,
      executedPending: mockProposals.filter(
        p => p.tallyStatus === "Executed" || String(p.tallyStatus).startsWith("Pending execution"),
      ).length,
    };
  }, []);

  // Hierarchical badge color for Status column (match link chip palette and compact size)
  const getOverallStatusBadgeClass = (proposal: (typeof mockProposals)[0]): string => {
    if (proposal.tallyLink) {
      return "badge-sm whitespace-nowrap border border-cyan-200 bg-cyan-100 text-cyan-600";
    }
    if (proposal.snapshotLink) {
      return "badge-sm whitespace-nowrap border border-purple-200 bg-purple-100 text-purple-600";
    }
    return "badge-sm whitespace-nowrap border border-orange-200 bg-orange-100 text-orange-600";
  };

  return (
    <div className="p-1 lg:p-3 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Arbitrum DAO Governance</h1>
          <p className="text-base-content/60">Unified proposal tracking across all governance stages</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card bg-base-100 border border-base-300 shadow-sm rounded-xl">
          <div className="card-body p-4">
            <div className="flex justify-between items-start">
              <h2 className="card-title text-sm font-medium">Active Discussions</h2>
              <UsersIcon className="h-4 w-4 text-base-content/60" />
            </div>
            <div className="text-2xl font-bold text-orange-500">{stats.activeDiscussions}</div>
            <p className="text-xs text-base-content/60">Forum stage proposals</p>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300 shadow-sm rounded-xl">
          <div className="card-body p-4">
            <div className="flex justify-between items-start">
              <h2 className="card-title text-sm font-medium">Active Offchain Votes</h2>
              <InboxStackIcon className="h-4 w-4 text-base-content/60" />
            </div>
            <div className="text-2xl font-bold text-purple-500">{stats.activeOffchainVotes}</div>
            <p className="text-xs text-base-content/60">Snapshot voting in progress</p>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300 shadow-sm rounded-xl">
          <div className="card-body p-4">
            <div className="flex justify-between items-start">
              <h2 className="card-title text-sm font-medium">Active Onchain Votes</h2>
              <ArrowTrendingUpIcon className="h-4 w-4 text-base-content/60" />
            </div>
            <div className="text-2xl font-bold text-cyan-500">{stats.activeOnchainVotes}</div>
            <p className="text-xs text-base-content/60">Tally voting in progress</p>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300 shadow-sm rounded-xl">
          <div className="card-body p-4">
            <div className="flex justify-between items-start">
              <h2 className="card-title text-sm font-medium">Executed / Pending Execution</h2>
              <CalendarDaysIcon className="h-4 w-4 text-base-content/60" />
            </div>
            <div className="text-2xl font-bold text-cyan-500">{stats.executedPending}</div>
            <p className="text-xs text-base-content/60">Completed or awaiting execution</p>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="w-full">
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
      </div>

      {/* Proposals Table */}
      <div className="card bg-base-100 border border-base-300 shadow-sm rounded-xl">
        <div className="card-body p-0">
          <div className="p-3 lg:p-4 border-b border-base-300 flex items-center justify-end gap-3">
            <p className="text-sm text-base-content/60 py-0 my-0">
              Showing {filteredProposals.length} of {mockProposals.length} proposals
            </p>
          </div>

          <div className="overflow-x-auto lg:overflow-x-visible">
            <table className="table table-sm w-full">
              <thead>
                <tr>
                  <th className="w-[33%]">Proposal</th>
                  <th className="w-[12%]">Status</th>
                  <th className="w-[14%]">
                    <div className="flex flex-col">
                      <span>Offchain</span>
                      <span className="text-xs text-base-content/60 font-normal">(Snapshot)</span>
                    </div>
                  </th>
                  <th className="w-[14%]">
                    <div className="flex flex-col">
                      <span>Onchain</span>
                      <span className="text-xs text-base-content/60 font-normal">(Tally)</span>
                    </div>
                  </th>
                  <th className="w-[10%]">Category</th>
                  <th className="w-[10%]">Votes</th>
                  <th className="w-[5%]">Links</th>
                </tr>
              </thead>
              <tbody>
                {filteredProposals.map(proposal => {
                  const overallStatus = getOverallStatus(proposal);

                  return (
                    <tr key={proposal.id}>
                      <td className="max-w-xl">
                        <div className="font-medium text-sm mb-1 truncate">{proposal.title}</div>
                        {proposal.author && <div className="text-xs text-base-content/60">by {proposal.author}</div>}
                      </td>
                      <td>
                        <div className={`badge ${getOverallStatusBadgeClass(proposal)}`}>{overallStatus.status}</div>
                      </td>
                      <td>
                        {proposal.snapshotStatus ? (
                          <div className="flex flex-col gap-1">
                            <div className="badge badge-sm whitespace-nowrap border border-purple-200 bg-purple-100 text-purple-600">
                              {proposal.snapshotStatus}
                            </div>
                            {proposal.snapshotLastUpdate && (
                              <span className="text-xs text-base-content/60">{proposal.snapshotLastUpdate}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-base-content/60">Not started</span>
                        )}
                      </td>
                      <td>
                        {proposal.tallyStatus ? (
                          <div className="flex flex-col gap-1">
                            <div className="badge badge-sm whitespace-nowrap border border-cyan-200 bg-cyan-100 text-cyan-600">
                              {proposal.tallyStatus.startsWith("Pending execution")
                                ? proposal.tallyStatus.replace("Pending execution (", "").replace(")", "")
                                : proposal.tallyStatus}
                            </div>
                            {proposal.tallyLastUpdate && (
                              <span className="text-xs text-base-content/60">{proposal.tallyLastUpdate}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-base-content/60">Not started</span>
                        )}
                      </td>
                      <td>
                        <div className="badge badge-sm whitespace-nowrap border border-base-300 bg-transparent text-base-content/70">
                          {proposal.category}
                        </div>
                      </td>
                      <td>
                        {proposal.votes ? (
                          <div className="text-xs leading-tight">
                            <div className="text-green-600 font-semibold">For: {proposal.votes.for}</div>
                            <div className="text-red-600 font-semibold">Against: {proposal.votes.against}</div>
                            <div className="text-base-content/60">Total: {proposal.votes.total}</div>
                          </div>
                        ) : (
                          <span className="text-base-content/60 text-xs">No votes yet</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-col gap-1">
                          {proposal.forumLink && (
                            <a
                              href={proposal.forumLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-orange-500 hover:underline"
                            >
                              <div className="w-4 h-4 rounded bg-orange-100 flex items-center justify-center">
                                <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
                              </div>
                              <span className="text-xs">Forum</span>
                            </a>
                          )}
                          {proposal.snapshotLink && (
                            <a
                              href={proposal.snapshotLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-purple-500 hover:underline"
                            >
                              <div className="w-4 h-4 rounded bg-purple-100 flex items-center justify-center">
                                <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
                              </div>
                              <span className="text-xs">Snapshot</span>
                            </a>
                          )}
                          {proposal.tallyLink && (
                            <a
                              href={proposal.tallyLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-cyan-500 hover:underline"
                            >
                              <div className="w-4 h-4 rounded bg-cyan-100 flex items-center justify-center">
                                <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
                              </div>
                              <span className="text-xs">Tally</span>
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
