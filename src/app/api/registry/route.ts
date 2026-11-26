import { allowPublic, tooMany } from "@/lib/guard";
import { getStore } from "@/lib/server/store";
import { readRegistry } from "@/lib/server/registry";
import { bad, fail, ok } from "@/lib/server/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* Configs of a wallet (?owner=0x…) or one config (?id=N) in OrlunoLimitRegistry, with their events from the logs. */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "registry", 20, 400))) return tooMany();
  const q = new URL(request.url).searchParams;
  const owner = q.get("owner");
  const id = q.get("id");
  if (owner && !/^0x[0-9a-fA-F]{40}$/.test(owner)) return bad("owner must be an address.");
  if (id && !/^[1-9][0-9]{0,8}$/.test(id)) return bad("id must be a positive number.");
  if (!owner && !id) return bad("Give ?owner=0x… or ?id=N.");
  try {
    return ok(await readRegistry(id ? { id: Number(id) } : { owner: owner! }), 5);
  } catch (e) {
    return fail(e);
  }
}
