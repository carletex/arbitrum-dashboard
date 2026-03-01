import { NextResponse } from "next/server";
import { getUnprocessedSnapshotStages, getUnprocessedTallyStages } from "~~/services/database/repositories/matching";
import { isAdminSession } from "~~/utils/auth";

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [snapshotRows, tallyRows] = await Promise.all([getUnprocessedSnapshotStages(), getUnprocessedTallyStages()]);

    const pending = [
      ...snapshotRows.map(r => ({
        sourceType: "snapshot" as const,
        stageId: r.snapshotStage.id,
        title: r.snapshotStage.title,
        authorName: r.snapshotStage.author_name,
        url: r.snapshotStage.url,
      })),
      ...tallyRows.map(r => ({
        sourceType: "tally" as const,
        stageId: r.tallyStage.id,
        title: r.tallyStage.title,
        authorName: r.tallyStage.author_name,
        url: r.tallyStage.url,
      })),
    ];

    return NextResponse.json(pending);
  } catch (error) {
    console.error("Error fetching pending stages:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
