import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

type Decisao = "aprovada" | "editada" | "rejeitada";

// Aplica a decisao da fila (SPEC 3.4) e os efeitos por area
// (Vendas: SPEC 4.3; Financeiro: SPEC 5.5).
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
  const areasDoUsuario = Array.isArray(perfil?.areas) ? perfil.areas : [];

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }

  const id = String(body.id ?? "");
  const decisao = String(body.decisao ?? "") as Decisao;
  if (!id || !["aprovada", "editada", "rejeitada"].includes(decisao)) {
    return NextResponse.json({ erro: "Informe id e decisao valida." }, { status: 400 });
  }

  const { data: item } = await admin
    .from("aprovacoes")
    .select("id, area, item_tipo, item_id, status, proposta")
    .eq("id", id)
    .maybeSingle();
  if (!item) return NextResponse.json({ erro: "Item nao encontrado." }, { status: 404 });
  if (!areasDoUsuario.includes(item.area)) {
    return NextResponse.json({ erro: `Sem acesso a area ${item.area}.` }, { status: 403 });
  }
  if (item.status !== "pendente") {
    return NextResponse.json({ erro: "Item ja foi decidido." }, { status: 409 });
  }

  const patch: Record<string, unknown> = {
    status: decisao,
    decidido_por: user.id,
    decidido_em: new Date().toISOString(),
  };
  if (decisao === "editada") {
    if (body.proposta === undefined) {
      return NextResponse.json({ erro: "Falta a proposta editada." }, { status: 400 });
    }
    patch.proposta = body.proposta;
  }
  if (decisao === "rejeitada") {
    const obs = String(body.observacao ?? "").trim();
    if (!obs) return NextResponse.json({ erro: "Observacao obrigatoria para rejeitar." }, { status: 400 });
    patch.observacao = obs;
  }

  const { error: errUpd } = await admin.from("aprovacoes").update(patch).eq("id", id);
  if (errUpd) return NextResponse.json({ erro: errUpd.message }, { status: 500 });

  // Efeitos por area
  if (item.area === "vendas" && item.item_tipo === "pedido") {
    const novoStatus = decisao === "rejeitada" ? "rejeitado" : "respondido";
    await admin
      .from("pedidos_orcamento")
      .update({ status: novoStatus })
      .eq("cod_pedido", item.item_id);
  }

  if (item.area === "financeiro" && item.item_tipo === "divergencia") {
    if (decisao === "rejeitada") {
      // SPEC 5.5: divergencia volta para 'nova' com a observacao.
      await admin
        .from("divergencias")
        .update({ status: "nova", hipotese: null })
        .eq("id", item.item_id);
    } else {
      await admin.from("divergencias").update({ status: "resolvida" }).eq("id", item.item_id);

      const p = (decisao === "editada" ? body.proposta : item.proposta) as
        | Record<string, unknown>
        | null;
      const cods = Array.isArray(p?.cod_titulos_envolvidos)
        ? (p!.cod_titulos_envolvidos as unknown[]).map(String)
        : [];
      const pendente = Number(p?.valor_pendente ?? 0);
      const hipotese = String(p?.hipotese ?? "");
      const divInfo = (p?.divergencia ?? {}) as { tipo_inicial?: string };

      let statusTitulo = "pago";
      if (hipotese === "vencido_sem_pagamento" || divInfo.tipo_inicial === "vencido_sem_pagamento") {
        statusTitulo = "vencido";
      } else if (pendente > 0.01) {
        statusTitulo = "pago_parcial";
      }

      for (const cod of cods) {
        await admin.from("titulos_receber").update({ status: statusTitulo }).eq("cod_titulo", cod);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
