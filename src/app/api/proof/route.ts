import { allowPublic, tooMany } from "@/lib/guard";
import { getStore } from "@/lib/server/store";
import { proofs } from "@/lib/server/proof";
import { fail, ok } from "@/lib/server/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* Live identity proof of each market token (see src/lib/server/proof.ts). */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "proof", 30, 600))) return tooMany();
  const p = await proofs();
  return p ? ok(p, 60) : fail(new Error("unreachable"));
}
