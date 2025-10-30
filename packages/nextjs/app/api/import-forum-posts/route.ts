import { NextResponse } from "next/server";
import { importForumPosts } from "~~/services/forum/import";

export async function POST() {
  try {
    // TODO: Add authentication/authorization here
    console.log("Importing forum posts...");
    await importForumPosts();

    return NextResponse.json({
      success: true,
      message: "Forum posts imported successfully",
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
