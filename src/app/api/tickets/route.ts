import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("id, user_id, customer_message, status, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listing tickets failed:", error);
    return NextResponse.json({ error: "Could not load tickets." }, { status: 500 });
  }
  return NextResponse.json({ tickets: data });
}
