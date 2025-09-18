#!/usr/bin/env tsx
import * as dotenv from "dotenv";
import * as path from "path";
import { db } from "~~/services/database/config/postgresClient";
import { findProposalByTallyId } from "~~/services/database/repositories/proposals";
import { createTallyApiService } from "~~/services/tally/api";
import { TallyProposal } from "~~/types/tally";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.development") });

function deriveCrossChainStage(p: TallyProposal) {
  const events = p.events ?? [];

  const parseFlexibleTimestamp = (value: unknown): Date | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "number") {
      if (value === 0) return undefined;
      const millis = value > 1e12 ? value : value * 1000;
      const d = new Date(millis);
      return isNaN(d.getTime()) ? undefined : d;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return undefined;
      if (/^\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        if (num === 0) return undefined;
        const millis = num > 1e12 ? num : num * 1000;
        const d = new Date(millis);
        return isNaN(d.getTime()) ? undefined : d;
      }
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? undefined : d;
    }
    return undefined;
  };

  const findAt = (type: string, chainId: string) => {
    const e = events.find(ev => ev.type === type && ev.chainId === chainId);
    return e?.block?.timestamp || e?.createdAt;
  };

  const l2Chain = "eip155:42161";
  const l1Chain = "eip155:1";

  const l2ExecutedAt = findAt("executed", l2Chain);
  const l1QueuedAt = findAt("queued", l1Chain);
  const l1ExecutedAt = findAt("executed", l1Chain);

  const timelockId = p.metadata?.timelockId || p.governor?.timelockId || "";
  const timelockChainIsL1 = timelockId.startsWith("eip155:1:");
  // Heuristic: if L2 executed and no L1 queued/executed yet, we expect an L1 step next
  const hasL2Executed = !!l2ExecutedAt;
  const hasL1Progress = !!l1QueuedAt || !!l1ExecutedAt;
  let requiresL1 = timelockChainIsL1 || !!l1QueuedAt || !!l1ExecutedAt;
  let waitingL2toL1 = false;
  let l2MessageAvailableAt: Date | undefined = undefined;

  if (hasL2Executed && !hasL1Progress) {
    waitingL2toL1 = true;
    requiresL1 = true; // interim expectation
    const base = parseFlexibleTimestamp(l2ExecutedAt);
    if (base) l2MessageAvailableAt = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  const l1ExecutionAvailableAt = parseFlexibleTimestamp(p.metadata?.eta);

  return {
    requiresL1Execution: requiresL1,
    waitingL2toL1Message: waitingL2toL1,
    l2ExecutedAt: parseFlexibleTimestamp(l2ExecutedAt),
    l1QueuedAt: parseFlexibleTimestamp(l1QueuedAt),
    l1ExecutedAt: parseFlexibleTimestamp(l1ExecutedAt),
    l2MessageAvailableAt,
    l1ExecutionAvailableAt,
    timelockId: timelockId || undefined,
  };
}

async function main() {
  try {
    const id = process.argv[2];
    const governorId = process.argv[3];
    if (!id) {
      console.error("Usage: tsx scripts/checkStage.ts <tally-proposal-id> [governorId]");
      process.exit(1);
    }

    const tallyApi = createTallyApiService();
    const p = await tallyApi.fetchProposalById(id, { governorId });
    if (!p) {
      console.error("❌ Proposal not found in Tally API for id:", id);
      process.exit(1);
    }

    console.log("\n🧭 Derived stage from API events:");
    const stage = deriveCrossChainStage(p);
    console.log(stage);

    console.log("\n🔎 DB comparison (run proposals:sync first to populate):");
    const dbRow = await findProposalByTallyId(id);
    if (!dbRow) {
      console.log("Not found in DB. Try: yarn proposals:sync or yarn proposals:sync:latest");
    } else {
      console.log({
        id: dbRow.proposal.id,
        title: dbRow.proposal.title,
        timelock_chain_id: (dbRow.proposal as any).timelock_chain_id,
        requires_l1_execution: (dbRow.proposal as any).requires_l1_execution,
        execution_chain_id: (dbRow.proposal as any).execution_chain_id,
        queued_at: (dbRow.proposal as any).queued_at,
        executed_at: (dbRow.proposal as any).executed_at,
        waiting_l2_to_l1: (dbRow.proposal as any).waiting_l2_to_l1,
        l2_message_available_at: (dbRow.proposal as any).l2_message_available_at,
      });
    }
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main();
}
