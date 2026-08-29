import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { processarPedido } from "@/lib/orquestradores/vendas";

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
  if (!areas.includes("vendas")) {
    return NextResponse.json({ erro: "Sem acesso a Vendas." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }
  const codPedido = String(body.cod_pedido ?? "").trim();
  if (!codPedido) {
    return NextResponse.json({ erro: "Informe cod_pedido." }, { status: 400 });
  }

  try {
    await processarPedido(codPedido);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha ao processar o pedido." },
      { status: 500 },
    );
  }
}
