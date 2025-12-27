import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function GET() {
  try {
    // Try to get from GitHub API first if we have a token (optional future use)
    // For now, let's just use local git as the primary source for dev
    
    let lastCommitDate = "";
    try {
      lastCommitDate = execSync('git log -1 --format=%cI').toString().trim();
    } catch (e) {
      console.error("Local git error:", e);
      // Fallback to current time or something if git fails
      lastCommitDate = new Date().toISOString();
    }

    return NextResponse.json({ date: lastCommitDate });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch git info" }, { status: 500 });
  }
}
