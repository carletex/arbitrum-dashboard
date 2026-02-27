"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import type { VotingStageItem } from "~~/services/database/repositories/proposals";

type ColorScheme = {
  border: string;
  bg: string;
  text: string;
};

export const VotingStageCell = ({
  status,
  lastUpdate,
  history,
  colorScheme,
}: {
  status: string | null;
  lastUpdate: string | null;
  history: VotingStageItem[];
  colorScheme: ColorScheme;
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasHistory = history.length > 0;

  if (!status) {
    return <span className="text-xs text-base-content/60">Not started</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Latest stage */}
      <div className="flex items-center gap-1.5">
        <div
          className={`badge badge-sm whitespace-nowrap border ${colorScheme.border} ${colorScheme.bg} ${colorScheme.text}`}
        >
          {status}
        </div>
        {hasHistory && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-0.5 text-[10px] text-base-content/60 hover:text-base-content/90 transition-colors cursor-pointer"
          >
            <span>+{history.length}</span>
            <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      {lastUpdate && <span className="text-xs text-base-content/60">{lastUpdate}</span>}

      {/* Expandable history */}
      {hasHistory && (
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-1.5 pt-1.5 border-t border-base-200 mt-1">
              {history.map(item => (
                <HistoryItem key={item.id} item={item} colorScheme={colorScheme} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const HistoryItem = ({ item, colorScheme }: { item: VotingStageItem; colorScheme: ColorScheme }) => {
  return (
    <div className="flex flex-col gap-0.5 opacity-80">
      {item.displayStatus && (
        <div
          className={`badge badge-xs whitespace-nowrap border ${colorScheme.border} ${colorScheme.bg} ${colorScheme.text}`}
        >
          {item.displayStatus}
        </div>
      )}
      {item.lastUpdate && <span className="text-[10px] text-base-content/70">{item.lastUpdate}</span>}
      {item.votes && (
        <div className="text-[10px] leading-tight">
          <span className="text-green-600">F:{item.votes.for}</span>{" "}
          <span className="text-red-600">A:{item.votes.against}</span>
        </div>
      )}
    </div>
  );
};
