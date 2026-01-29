import { NextRequest, NextResponse } from "next/server";
import {
  fetchDataForMatching,
  applyMatch,
  applyMatches,
  MatchRecommendation,
} from "~~/services/matching/ai-matcher";

/**
 * GET - Fetch data for AI agent to analyze
 * Returns unmatched stages and candidate proposals
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const data = await fetchDataForMatching();

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error fetching matching data:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST - Apply matches recommended by the AI agent
 * Body: { matches: MatchRecommendation[], minConfidence?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { matches, minConfidence = 85 } = body as {
      matches: MatchRecommendation[];
      minConfidence?: number;
    };

    if (!matches || !Array.isArray(matches)) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid 'matches' array" },
        { status: 400 },
      );
    }

    console.log(`Applying ${matches.length} AI-recommended matches (minConfidence: ${minConfidence})`);

    const results = await applyMatches(matches, minConfidence);

    return NextResponse.json({
      success: true,
      message: `Applied ${results.applied} matches, skipped ${results.skipped}`,
      results,
    });
  } catch (error) {
    console.error("Error applying matches:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH - Apply a single match
 * Body: { stageId, stageType, proposalId }
 */
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { stageId, stageType, proposalId } = body;

    if (!stageId || !stageType || !proposalId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: stageId, stageType, proposalId" },
        { status: 400 },
      );
    }

    const result = await applyMatch(stageId, stageType, proposalId);

    return NextResponse.json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    console.error("Error applying single match:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
