/**
 * CLI script for running LLM-based matching of snapshot/tally stages to proposals.
 *
 * Usage:
 *   yarn match:llm --type tally --id <stage-uuid>    # Match a specific tally stage
 *   yarn match:llm --type snapshot --id <stage-uuid>  # Match a specific snapshot stage
 *   yarn match:llm --type tally --all                 # Match all unprocessed tally stages
 *   yarn match:llm --type snapshot --all              # Match all unprocessed snapshot stages
 *   yarn match:llm --all                              # Match all unprocessed stages (both types)
 */
import { matchAllUnprocessed, matchStage } from "./llm-matching";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables before importing database modules
dotenv.config({ path: path.resolve(__dirname, "../../.env.development") });

function parseArgs(): { type?: "tally" | "snapshot"; id?: string; all: boolean } {
  const args = process.argv.slice(2);
  let type: "tally" | "snapshot" | undefined;
  let id: string | undefined;
  let all = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--type":
        type = args[++i] as "tally" | "snapshot";
        if (type !== "tally" && type !== "snapshot") {
          console.error(`Invalid type: ${type}. Must be "tally" or "snapshot".`);
          process.exit(1);
        }
        break;
      case "--id":
        id = args[++i];
        break;
      case "--all":
        all = true;
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  return { type, id, all };
}

function printUsage(): void {
  console.log(`
Usage:
  yarn match:llm --type tally --id <stage-uuid>    Match a specific tally stage
  yarn match:llm --type snapshot --id <stage-uuid>  Match a specific snapshot stage
  yarn match:llm --type tally --all                 Match all unprocessed tally stages
  yarn match:llm --type snapshot --all              Match all unprocessed snapshot stages
  yarn match:llm --all                              Match all unprocessed stages (both types)
`);
}

async function main(): Promise<void> {
  const { type, id, all } = parseArgs();

  if (id) {
    // Match a specific stage by ID
    if (!type) {
      console.error("--type is required when using --id");
      process.exit(1);
    }
    console.log(`Matching ${type} stage: ${id}\n`);
    const result = await matchStage(type, id);
    console.log(`\nResult: ${result.status}${result.proposalId ? ` → ${result.proposalId}` : ""}`);
  } else if (all) {
    // Match all unprocessed stages
    await matchAllUnprocessed(type);
  } else {
    printUsage();
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch(error => {
    console.error("LLM matching failed:", error);
    process.exit(1);
  });
