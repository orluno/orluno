import { allowPublic, tooMany } from "@/lib/guard";
import { getStore } from "@/lib/server/store";
import { latestAll } from "@/lib/server/rounds";
import { ok } from "@/lib/server/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* The latest Chainlink answer and the bar count of every market. */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "latest", 40, 800))) return tooMany();
  return ok({ markets: await latestAll(), readAt: Date.now() }, 30);
}
