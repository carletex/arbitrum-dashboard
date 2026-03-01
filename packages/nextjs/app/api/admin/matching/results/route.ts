import { NextResponse } from "next/server";
import { getAllMatchingResults } from "~~/services/database/repositories/matching";
import { isAdminSession } from "~~/utils/auth";

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await getAllMatchingResults();
    return NextResponse.json(results);
  } catch (error) {
    console.error("Error fetching matching results:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
