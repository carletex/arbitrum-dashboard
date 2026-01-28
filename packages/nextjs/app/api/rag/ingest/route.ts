import { NextRequest, NextResponse } from "next/server";
import { runIngestion } from "~~/services/rag";
import { isAdminSession } from "~~/utils/auth";

/**
 * POST /api/rag/ingest
 *
 * Admin-protected endpoint to trigger manual ingestion of proposals into the vector store.
 * Requires authenticated admin session.
 *
 * Request body (optional):
 * - clearFirst: boolean - Clear existing vectors before ingestion
 */
export async function POST(request: NextRequest) {
  try {
    // Check admin authentication
    const isAdmin = await isAdminSession();
    if (!isAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: Admin access required",
        },
        { status: 401 },
      );
    }

    // Parse request body
    let options: { clearFirst?: boolean } = {};
    try {
      const body = await request.json();
      options = {
        clearFirst: body.clearFirst === true,
      };
    } catch {
      // Empty body is fine, use defaults
    }

    console.log("Starting RAG ingestion...", options);

    // Run ingestion
    const result = await runIngestion(options);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Ingestion failed",
          details: result.errors,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Ingestion completed successfully",
      stats: {
        totalDocuments: result.totalDocuments,
        newNodes: result.newNodes,
        updatedNodes: result.updatedNodes,
        skippedNodes: result.skippedNodes,
      },
      warnings: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error("Error during RAG ingestion:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    );
  }
}
