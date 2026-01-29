import { NextRequest, NextResponse } from "next/server";
import { matchProposalsAcrossStages } from "~~/services/matching/matcher";

export async function POST(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron using the CRON_SECRET
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error("Unauthorized attempt to access match-proposals endpoint");
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    console.log("Starting proposal matching...");
    const report = await matchProposalsAcrossStages();

    return NextResponse.json({
      success: true,
      message: "Proposal matching completed successfully",
      report,
    });
  } catch (error) {
    console.error("Error matching proposals:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    );
  }
}
