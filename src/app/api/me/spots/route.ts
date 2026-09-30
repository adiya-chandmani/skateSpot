import { db, getUser, unauthorized } from "@/lib/server";

// Author's own list incl. hidden status (PRD §3). Not a public profile.
export async function GET(req: Request) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const { data } = await db
    .from("spots")
    .select("id, name, visibility, updated_at")
    .eq("created_by", user.id)
    .in("visibility", ["published", "hidden"])
    .order("created_at", { ascending: false });
  return Response.json({ spots: data ?? [] });
}
