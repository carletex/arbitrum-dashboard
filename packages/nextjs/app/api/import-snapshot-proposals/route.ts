import { NextRequest, NextResponse } from "next/server";
import { importSnapshotProposals } from "~~/services/snapshot/import";

export async function POST(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron using the CRON_SECRET
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error("Unauthorized attempt to access import-snapshot-proposals endpoint");
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    console.log("Importing Snapshot proposals...");
    await importSnapshotProposals();

    return NextResponse.json({
      success: true,
      message: "Snapshot proposals imported successfully",
    });
  } catch (error) {
    console.error("Error importing Snapshot proposals:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    );
  }
}
