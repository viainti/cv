import { NextRequest, NextResponse } from "next/server";
import { inspectLinkedInJobWithPlaywright } from "@/lib/linkedin-playwright";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = String(body?.url || "").trim();

    if (!url) {
      return NextResponse.json({ success: false, reason: "Falta la URL del job." }, { status: 400 });
    }

    const result = await inspectLinkedInJobWithPlaywright(url);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "No se pudo leer LinkedIn con Playwright.";
    return NextResponse.json({ success: false, reason }, { status: 500 });
  }
}
