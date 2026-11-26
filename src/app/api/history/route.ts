import { NextResponse } from "next/server";
import { allowPublic, tooMany } from "@/lib/guard";
import { getStore } from "@/lib/server/store";
import { history } from "@/lib/server/rounds";
import { bad, ok } from "@/lib/server/respond";
import { MARKET_IDS } from "@/config/markets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* Hourly bars of one market from its Chainlink round history (committed snapshot + rounds read live since). */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "history", 40, 800))) return tooMany();
  const asset = new URL(request.url).searchParams.get("asset") ?? "";
  if (!MARKET_IDS.includes(asset)) return bad("Unknown asset.");
  const h = await history(asset);
  if (!h) return NextResponse.json({ error: "No history for this asset." }, { status: 404 });
  return ok(h, 30);
}
