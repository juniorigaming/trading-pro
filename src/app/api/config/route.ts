import { getConfig, saveConfig } from "@/lib/config";
import { Config } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getConfig();
    return Response.json(config);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to load config" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<Config>;
    const updated = await saveConfig(body);
    return Response.json(updated);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to save config" }, { status: 500 });
  }
}
