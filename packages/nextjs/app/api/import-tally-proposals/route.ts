import { NextRequest, NextResponse } from "next/server";
import { importTallyProposals } from "~~/services/tally/import";

export async function POST(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron using the CRON_SECRET
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error("Unauthorized attempt to access import-tally-proposals endpoint");
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    console.log("Importing Tally proposals...");
    await importTallyProposals();

    return NextResponse.json({
      success: true,
      message: "Tally proposals imported successfully",
    });
  } catch (error) {
    console.error("Error importing Tally proposals:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    );
  }
}
