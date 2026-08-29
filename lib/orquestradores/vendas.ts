import { createAdminClient } from "@/utils/supabase/admin";
import {
  agente,
  iniciarOrquestrador,
  finalizarOrquestrador,
  type ContextoExecucao,
} from "@/lib/agente";

type Db = ReturnType<typeof createAdminClient>;

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "para", "pra", "com", "por", "sem", "em",
  "na", "no", "nas", "nos", "e", "ou", "um", "uma", "uns", "umas", "the",
  "que", "se", "ao", "aos", "cada", "tem", "ter", "uns", "meia", "meio",
]);

// Palavras principais de uma descricao livre, para o ilike no catalogo.
function palavrasPrincipais(descricao: unknown): string[] {
  return String(descricao ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}/.\-\s]/gu, " ")
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3 && !STOPWORDS.has(p))
    .slice(0, 6);
}

// SPEC 4.2 passo 3: consulta ao catalogo em codigo, nao pelo modelo.
async function buscarCandidatosCatalogo(db: Db, itens: unknown[]) {
  const saida: { descricao_cliente: unknown; candidatos: unknown[] }[] = [];
  for (const item of itens) {
    const it = (item ?? {}) as Record<string, unknown>;
    const palavras = palavrasPrincipais(it.descricao_cliente);
    let candidatos: unknown[] = [];
    if (palavras.length > 0) {
      const filtro = palavras.map((p) => `descricao.ilike.%${p}%`).join(",");
      const { data } = await db
        .from("produtos")
        .select(
          "cod_produto, descricao, unidade, preco_unitario, preco_acima_100_un, estoque, prazo_reposicao_dias",
        )
        .or(filtro)
        .limit(8);
      candidatos = data ?? [];
    }
    saida.push({ descricao_cliente: it.descricao_cliente, candidatos });
  }
  return saida;
}

// SPEC 4.2 passo 3: pedidos anteriores do mesmo cliente nos ultimos 30 dias.
async function buscarPedidosAnteriores(db: Db, codCliente: string, codPedidoAtual: string) {
  const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { data } = await db
    .from("pedidos_orcamento")
    .select("cod_pedido, data, canal, mensagem, status")
    .eq("cod_cliente", codCliente)
    .neq("cod_pedido", codPedidoAtual)
    .gte("data", limite)
    .order("data", { ascending: false });
  return data ?? [];
}

/**
 * Orquestrador de Vendas (SPEC 4.2). Toda decisao de fluxo e codigo;
 * o modelo so entra pelas chamadas a agente().
 */
export async function processarPedido(codPedido: string): Promise<void> {
  const db = createAdminClient();

  const { data: pedido } = await db
    .from("pedidos_orcamento")
    .select("cod_pedido, data, cod_cliente, canal, mensagem, status")
    .eq("cod_pedido", codPedido)
    .maybeSingle();
  if (!pedido) throw new Error(`Pedido ${codPedido} nao encontrado.`);

  const { data: cliente } = await db
    .from("clientes")
    .select(
      "cod_cliente, nome, cidade, segmento, prazo_pagamento_dias, desconto_maximo_pct, cliente_desde",
    )
    .eq("cod_cliente", pedido.cod_cliente)
    .maybeSingle();

  // 1. processando + execucao raiz
  await db.from("pedidos_orcamento").update({ status: "processando" }).eq("cod_pedido", codPedido);

  const base: ContextoExecucao = { area: "vendas", item_tipo: "pedido", item_id: codPedido };
  const raizId = await iniciarOrquestrador(base);
  const ctx: ContextoExecucao = { ...base, chamado_por: raizId };

  try {
    // 2. Triador
    const { saida: triagem } = await agente(
      "triador",
      {
        mensagem: pedido.mensagem,
        canal: pedido.canal,
        cliente: {
          cod_cliente: cliente?.cod_cliente ?? pedido.cod_cliente,
          nome: cliente?.nome ?? null,
          segmento: cliente?.segmento ?? null,
        },
      },
      ctx,
    );

    const tipo = String(triagem.tipo ?? "outro");
    if (tipo !== "orcamento" && tipo !== "complemento") {
      await db.from("aprovacoes").insert({
        area: "vendas",
        item_tipo: "pedido",
        item_id: codPedido,
        titulo: `Nao e orcamento: ${tipo}`,
        proposta: { triagem },
        status: "pendente",
      });
      await db
        .from("pedidos_orcamento")
        .update({ status: "aguardando_aprovacao" })
        .eq("cod_pedido", codPedido);
      await finalizarOrquestrador(raizId, "ok");
      return;
    }

    // 3. Pesquisador (duas consultas em paralelo, feitas em codigo)
    const itensPedidos = Array.isArray(triagem.itens) ? triagem.itens : [];
    const [candidatosCatalogo, pedidosAnteriores] = await Promise.all([
      buscarCandidatosCatalogo(db, itensPedidos),
      buscarPedidosAnteriores(db, pedido.cod_cliente, codPedido),
    ]);

    const { saida: contexto } = await agente(
      "pesquisador",
      {
        itens_pedidos: itensPedidos,
        candidatos_catalogo: candidatosCatalogo,
        cliente: cliente ?? {},
        pedidos_anteriores: pedidosAnteriores,
      },
      ctx,
    );

    // 4 + 5. Redator e Revisor, no maximo 2 voltas.
    // `regras` do Revisor vem do arquivo de prompt (CLAUDE.md: nao copiar prompt no codigo).
    let entradaRedator: Record<string, unknown> = {
      triagem,
      contexto,
      cliente: { nome: cliente?.nome ?? null, segmento: cliente?.segmento ?? null },
    };

    let redacao = await agente("redator", entradaRedator, ctx);
    let revisao = await agente(
      "revisor",
      { resposta: redacao.saida.resposta, contexto },
      ctx,
    );

    let voltas = 0;
    while (revisao.saida.aprovado === false && voltas < 2) {
      voltas += 1;
      entradaRedator = { ...entradaRedator, ajustes: revisao.saida.motivos ?? [] };
      redacao = await agente("redator", entradaRedator, ctx);
      revisao = await agente(
        "revisor",
        { resposta: redacao.saida.resposta, contexto },
        ctx,
      );
    }

    // 6. item na fila de aprovacao
    const resumo = String(redacao.saida.resumo ?? "");
    const nomeCliente = cliente?.nome ?? pedido.cod_cliente;
    await db.from("aprovacoes").insert({
      area: "vendas",
      item_tipo: "pedido",
      item_id: codPedido,
      titulo: `${nomeCliente} · ${resumo}`,
      proposta: {
        resposta: redacao.saida.resposta,
        resumo,
        triagem,
        contexto,
        revisao: revisao.saida,
      },
      status: "pendente",
    });
    await db
      .from("pedidos_orcamento")
      .update({ status: "aguardando_aprovacao" })
      .eq("cod_pedido", codPedido);

    await finalizarOrquestrador(raizId, "ok");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finalizarOrquestrador(raizId, "erro", msg);
    // devolve o pedido para 'novo' para permitir reprocessar.
    await db.from("pedidos_orcamento").update({ status: "novo" }).eq("cod_pedido", codPedido);
    throw e;
  }
}
