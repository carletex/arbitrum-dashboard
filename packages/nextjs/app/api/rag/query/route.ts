import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_STATUSES, RagQueryInput, queryRag } from "~~/services/rag";

const ALLOWED_STAGES = ["forum", "snapshot", "tally"] as const;

/**
 * POST /api/rag/query
 *
 * Query the RAG system with natural language questions about proposals.
 *
 * Request body:
 * - query: string (required) - The natural language question
 * - filters: object (optional)
 *   - stage: string[] - Filter by stage ("forum", "snapshot", "tally")
 *   - status: string[] - Filter by status ("active", "closed", etc.)
 * - topK: number (optional) - Number of results to retrieve (default: 5, max: 20)
 *
 * Response:
 * - answer: string - The generated answer
 * - citations: array - Source citations with proposal_id, stage, url, snippet
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON body",
        },
        { status: 400 },
      );
    }

    // Validate query
    const input = body as Record<string, unknown>;
    if (!input.query || typeof input.query !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Query is required and must be a string",
        },
        { status: 400 },
      );
    }

    if (input.query.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Query cannot be empty",
        },
        { status: 400 },
      );
    }

    if (input.query.length > 1000) {
      return NextResponse.json(
        {
          success: false,
          error: "Query must be less than 1000 characters",
        },
        { status: 400 },
      );
    }

    // Validate filters
    const filters = input.filters as { stage?: unknown; status?: unknown } | undefined;
    const validatedFilters: RagQueryInput["filters"] = {};

    if (filters?.stage) {
      if (!Array.isArray(filters.stage)) {
        return NextResponse.json(
          {
            success: false,
            error: "filters.stage must be an array",
          },
          { status: 400 },
        );
      }
      const validStages = filters.stage.filter((s): s is (typeof ALLOWED_STAGES)[number] =>
        ALLOWED_STAGES.includes(s as (typeof ALLOWED_STAGES)[number]),
      );
      if (validStages.length > 0) {
        validatedFilters.stage = validStages;
      }
    }

    if (filters?.status) {
      if (!Array.isArray(filters.status)) {
        return NextResponse.json(
          {
            success: false,
            error: "filters.status must be an array",
          },
          { status: 400 },
        );
      }
      const validStatuses = filters.status
        .map(s => (typeof s === "string" ? s.toLowerCase() : ""))
        .filter((s): s is (typeof ALLOWED_STATUSES)[number] =>
          ALLOWED_STATUSES.includes(s as (typeof ALLOWED_STATUSES)[number]),
        );
      if (validStatuses.length > 0) {
        validatedFilters.status = validStatuses;
      }
    }

    // Validate topK
    let topK: number | undefined;
    if (input.topK !== undefined) {
      topK = typeof input.topK === "number" ? input.topK : parseInt(String(input.topK), 10);
      if (isNaN(topK) || topK < 1) {
        return NextResponse.json(
          {
            success: false,
            error: "topK must be a positive number",
          },
          { status: 400 },
        );
      }
      topK = Math.min(topK, 20); // Cap at 20
    }

    // Build query input
    const ragInput: RagQueryInput = {
      query: input.query.trim(),
      filters: Object.keys(validatedFilters).length > 0 ? validatedFilters : undefined,
      topK,
    };

    console.log("RAG query:", ragInput);

    // Execute query
    const result = await queryRag(ragInput);

    return NextResponse.json({
      success: true,
      answer: result.answer,
      citations: result.citations,
    });
  } catch (error) {
    console.error("Error during RAG query:", error);

    // Check for timeout
    if (error instanceof Error && error.message.includes("timed out")) {
      return NextResponse.json(
        {
          success: false,
          error: "Query timed out. Please try a simpler question.",
        },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    );
  }
}
