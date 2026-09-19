import { getDb } from "@/db";
import { trades } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function DELETE() {
  try {
    await getDb().delete(trades);
    return Response.json({ success: true, message: "Todas operações deletadas" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST() {
  return DELETE();
}
