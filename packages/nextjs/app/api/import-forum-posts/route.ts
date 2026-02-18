import { NextRequest, NextResponse } from "next/server";
import { importForumPosts } from "~~/services/forum/import";

export async function POST(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron using the CRON_SECRET
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error("Unauthorized attempt to access import-forum-posts endpoint");
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const maxPagesParam = request.nextUrl.searchParams.get("maxPages");
    const maxPages = maxPagesParam ? Number.parseInt(maxPagesParam, 10) : undefined;

    console.log("Importing forum posts...", {
      maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
    });

    const summary = await importForumPosts({
      maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
    });

    console.log("Forum posts import summary:", summary);

    return NextResponse.json({
      success: true,
      message: "Forum posts imported successfully",
      summary,
    });
  } catch (error) {
    console.error("Error importing forum posts:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    );
  }
}
