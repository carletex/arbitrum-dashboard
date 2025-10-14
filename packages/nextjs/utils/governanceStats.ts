import { ArrowTrendingUpIcon, CalendarDaysIcon, InboxStackIcon, UsersIcon } from "@heroicons/react/24/outline";
import { mockProposals } from "~~/components/dashboard/mockData";

export type Stats = {
  discussions: number;
  offchain: number;
  onchain: number;
  done: number;
};

export type StatCardConfig = {
  title: string;
  sub: string;
  color: string;
  Icon: React.ComponentType<{ className?: string }>;
  key: keyof Stats;
};

export const STAT_CARD_CONFIG: StatCardConfig[] = [
  {
    title: "Active Discussions",
    sub: "Forum stage proposals",
    color: "text-orange-500",
    Icon: UsersIcon,
    key: "discussions",
  },
  {
    title: "Active Offchain Votes",
    sub: "Snapshot voting in progress",
    color: "text-purple-500",
    Icon: InboxStackIcon,
    key: "offchain",
  },
  {
    title: "Active Onchain Votes",
    sub: "Tally voting in progress",
    color: "text-cyan-500",
    Icon: ArrowTrendingUpIcon,
    key: "onchain",
  },
  {
    title: "Executed / Pending Execution",
    sub: "Completed or awaiting execution",
    color: "text-cyan-500",
    Icon: CalendarDaysIcon,
    key: "done",
  },
];

export const computeStats = (): Stats => ({
  discussions: mockProposals.filter(p => p.forumStatus === "Active Discussion").length,
  offchain: mockProposals.filter(p => p.snapshotStatus && !["Passed", "Failed"].includes(p.snapshotStatus)).length,
  onchain: mockProposals.filter(
    p => p.tallyStatus && !["Executed", "Canceled"].includes(p.tallyStatus) && !p.tallyStatus.startsWith("Pending"),
  ).length,
  done: mockProposals.filter(p => p.tallyStatus === "Executed" || p.tallyStatus?.startsWith("Pending")).length,
});
