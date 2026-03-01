import { NextRequest, NextResponse } from "next/server";
import { completeJob, createJob, failJob } from "~~/services/matching/job-tracker";
import { matchStage } from "~~/services/matching/llm-matching";
import { isAdminSession } from "~~/utils/auth";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { sourceType, stageId } = await request.json();

    if (!sourceType || !stageId) {
      return NextResponse.json({ error: "sourceType and stageId are required" }, { status: 400 });
    }

    if (sourceType !== "snapshot" && sourceType !== "tally") {
      return NextResponse.json({ error: "sourceType must be 'snapshot' or 'tally'" }, { status: 400 });
    }

    const jobId = createJob();

    // Fire-and-forget: run matching asynchronously
    matchStage(sourceType, stageId)
      .then(result => completeJob(jobId, result))
      .catch(err => failJob(jobId, err instanceof Error ? err.message : String(err)));

    return NextResponse.json({ jobId });
  } catch (error) {
    console.error("Error executing match:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
