import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { conciliarExtrato } from "@/lib/orquestradores/financeiro";

export const maxDuration = 60;

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });

  const admin = createAdminClient();
  const { data: perfil } = await admin
    .from("perfis")
    .select("areas")
    .eq("id", user.id)
    .maybeSingle();
  const areas = Array.isArray(perfil?.areas) ? perfil.areas : [];
  if (!areas.includes("financeiro")) {
    return NextResponse.json({ erro: "Sem acesso a Financeiro." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }
  const extratoId = String(body.extrato_id ?? "").trim();
  if (!extratoId) return NextResponse.json({ erro: "Informe extrato_id." }, { status: 400 });

  try {
    await conciliarExtrato(extratoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha ao conciliar." },
      { status: 500 },
    );
  }
}
