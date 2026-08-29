import { createAdminClient } from "@/utils/supabase/admin";
import {
  agente,
  iniciarOrquestrador,
  finalizarOrquestrador,
  type ContextoExecucao,
} from "@/lib/agente";
import {
  casarLancamentos,
  identificarCliente,
  type Titulo,
  type Cliente,
  type LancamentoRow,
} from "@/lib/financeiro/casar";

type Db = ReturnType<typeof createAdminClient>;

const N = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function diasEntre(a: string, b: string): number {
  const ms = new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime();
  return Math.abs(ms) / (1000 * 60 * 60 * 24);
}

async function carregarTitulos(db: Db, titulosBruto: unknown): Promise<Titulo[]> {
  if (Array.isArray(titulosBruto) && titulosBruto.length > 0) {
    return (titulosBruto as Titulo[]).map((t) => ({ ...t, valor: N(t.valor) }));
  }
  const { data } = await db
    .from("titulos_receber")
    .select("cod_titulo, cod_cliente, nota_fiscal, valor, emissao, vencimento, status");
  return (data ?? []).map((t) => ({ ...t, valor: N(t.valor) })) as Titulo[];
}

/**
 * Conciliacao do extrato (SPEC 5.3 + 5.4). Casamento e codigo; o modelo so
 * entra pelo Investigador, Consolidador e Revisor.
 */
export async function conciliarExtrato(extratoId: string): Promise<void> {
  const db = createAdminClient();

  const { data: extrato } = await db
    .from("extratos_importados")
    .select("id, nome_arquivo, titulos_bruto")
    .eq("id", extratoId)
    .maybeSingle();
  if (!extrato) throw new Error(`Extrato ${extratoId} nao encontrado.`);

  const { data: lancamentosDb } = await db
    .from("lancamentos")
    .select("id, data, descricao, valor, tipo")
    .eq("extrato_id", extratoId)
    .order("data", { ascending: true });
  const lancamentos = (lancamentosDb ?? []) as LancamentoRow[];
  if (lancamentos.length === 0) throw new Error("Extrato sem lancamentos.");

  const { data: clientesDb } = await db.from("clientes").select("cod_cliente, nome");
  const clientes = (clientesDb ?? []) as Cliente[];
  const nomePorCod = new Map(clientes.map((c) => [c.cod_cliente, c.nome]));

  const titulos = await carregarTitulos(db, extrato.titulos_bruto);

  // ---- limpa resultado anterior (Conciliar e idempotente) ----
  const { data: divsAntigas } = await db
    .from("divergencias")
    .select("id")
    .eq("extrato_id", extratoId);
  const idsAntigos = (divsAntigas ?? []).map((d) => d.id);
  if (idsAntigos.length > 0) {
    await db.from("aprovacoes").delete().eq("area", "financeiro").in("item_id", idsAntigos);
  }
  await db.from("execucoes_agentes").delete().eq("item_id", extratoId);
  await db.from("divergencias").delete().eq("extrato_id", extratoId);

  // ---- casamento deterministico (SPEC 5.3) ----
  const dataFinal = lancamentos[lancamentos.length - 1].data;
  const { casamentos, divergenciasTitulos } = casarLancamentos(
    lancamentos,
    titulos,
    clientes,
    dataFinal,
  );

  for (const c of casamentos) {
    await db
      .from("lancamentos")
      .update({ situacao: c.situacao, cod_titulo_casado: c.cod_titulo_casado })
      .eq("id", c.lancamento_id);
  }

  const divergenciasParaInserir: Record<string, unknown>[] = [];
  for (const c of casamentos) {
    if (c.situacao === "divergente" && c.divergencia) {
      divergenciasParaInserir.push({
        extrato_id: extratoId,
        tipo_inicial: c.divergencia.tipo_inicial,
        lancamento_id: c.lancamento_id,
        cod_titulo: c.divergencia.cod_titulo,
        valor_lancamento: c.divergencia.valor_lancamento,
        valor_titulo: c.divergencia.valor_titulo,
        status: "nova",
      });
    }
  }
  for (const d of divergenciasTitulos) {
    divergenciasParaInserir.push({
      extrato_id: extratoId,
      tipo_inicial: d.tipo_inicial,
      lancamento_id: null,
      cod_titulo: d.cod_titulo,
      valor_lancamento: null,
      valor_titulo: d.valor_titulo,
      status: "nova",
    });
  }

  if (divergenciasParaInserir.length > 0) {
    await db.from("divergencias").insert(divergenciasParaInserir);
  }

  // ---- orquestrador (SPEC 5.4) ----
  const base: ContextoExecucao = {
    area: "financeiro",
    item_tipo: "divergencia",
    item_id: extratoId,
  };
  const raizId = await iniciarOrquestrador(base);
  const ctx: ContextoExecucao = { ...base, chamado_por: raizId };

  try {
    const { data: divergencias } = await db
      .from("divergencias")
      .select("id, tipo_inicial, lancamento_id, cod_titulo, valor_lancamento, valor_titulo")
      .eq("extrato_id", extratoId)
      .order("criado_em", { ascending: true });
    const divs = divergencias ?? [];

    await db
      .from("divergencias")
      .update({ status: "investigando" })
      .eq("extrato_id", extratoId);

    const lancPorId = new Map(lancamentos.map((l) => [l.id, l]));
    const tituloPorCod = new Map(titulos.map((t) => [t.cod_titulo, t]));

    // 2. Investigador, um por divergencia, em paralelo.
    const investigacoes = await Promise.all(
      divs.map(async (d) => {
        const lanc = d.lancamento_id ? lancPorId.get(d.lancamento_id) ?? null : null;
        const dataRef = lanc?.data ?? dataFinal;
        const valorRef = lanc ? N(lanc.valor) : N(d.valor_titulo);

        let clienteId: string | null = null;
        if (d.cod_titulo && tituloPorCod.has(d.cod_titulo)) {
          clienteId = tituloPorCod.get(d.cod_titulo)!.cod_cliente || null;
        } else if (lanc) {
          clienteId = identificarCliente(lanc.descricao, clientes);
        }

        const candidatos = titulos
          .filter((t) => (t.status || "aberto").toLowerCase() === "aberto")
          .filter((t) => {
            const mesmoCliente = clienteId != null && t.cod_cliente === clienteId;
            const valorProximo =
              valorRef > 0 && Math.abs(t.valor - valorRef) / valorRef <= 0.1;
            const vencProximo = t.vencimento ? diasEntre(t.vencimento, dataRef) <= 30 : false;
            return (mesmoCliente || valorProximo) && (vencProximo || mesmoCliente);
          })
          .slice(0, 12)
          .map((t) => ({
            cod_titulo: t.cod_titulo,
            cod_cliente: t.cod_cliente,
            nome_cliente: nomePorCod.get(t.cod_cliente) ?? null,
            nota_fiscal: t.nota_fiscal,
            valor: t.valor,
            vencimento: t.vencimento,
            status: t.status,
          }));

        const { saida } = await agente(
          "investigador",
          {
            divergencia: {
              tipo_inicial: d.tipo_inicial,
              valor_lancamento: d.valor_lancamento,
              valor_titulo: d.valor_titulo,
            },
            lancamento: lanc
              ? { data: lanc.data, descricao: lanc.descricao, valor: N(lanc.valor) }
              : null,
            titulos_candidatos: candidatos,
          },
          ctx,
        );

        await db.from("divergencias").update({ hipotese: saida }).eq("id", d.id);
        return { divergenciaId: d.id, divergencia: d, lancamento: lanc, saida };
      }),
    );

    // resumo do casamento
    const casados = casamentos.filter((c) => c.situacao === "casado");
    const valorCasado = casados.reduce((s, c) => {
      const l = lancPorId.get(c.lancamento_id);
      return s + (l ? N(l.valor) : 0);
    }, 0);
    const valorDivergente = investigacoes.reduce((s, i) => {
      const v = i.lancamento ? N(i.lancamento.valor) : N(i.divergencia.valor_titulo);
      return s + v;
    }, 0);
    const periodo = `${lancamentos[0].data} a ${dataFinal}`;
    const resumoCasamento = {
      qtd_casados: casados.length,
      valor_casado: Number(valorCasado.toFixed(2)),
      qtd_divergencias: investigacoes.length,
      valor_divergente: Number(valorDivergente.toFixed(2)),
      periodo,
    };

    const hipoteses = investigacoes.map((i) => i.saida);

    // 3. Consolidador
    let consolidado = await agente(
      "consolidador",
      { resumo_casamento: resumoCasamento, hipoteses },
      ctx,
    );

    // 4. Revisor (refaz apenas o Consolidador uma vez)
    const titulosAbertos = titulos
      .filter((t) => (t.status || "aberto").toLowerCase() === "aberto")
      .map((t) => ({
        cod_titulo: t.cod_titulo,
        valor: t.valor,
        cod_cliente: t.cod_cliente,
        vencimento: t.vencimento,
      }));

    let revisao = await agente(
      "revisor",
      {
        hipoteses,
        titulos_abertos: titulosAbertos,
        relatorio: consolidado.saida,
      },
      ctx,
    );

    if (revisao.saida.aprovado === false) {
      consolidado = await agente(
        "consolidador",
        {
          resumo_casamento: resumoCasamento,
          hipoteses,
          ajustes: revisao.saida.motivos ?? [],
        },
        ctx,
      );
      revisao = await agente(
        "revisor",
        { hipoteses, titulos_abertos: titulosAbertos, relatorio: consolidado.saida },
        ctx,
      );
    }

    // 5. cada hipotese vira item na fila
    for (const inv of investigacoes) {
      const s = inv.saida as Record<string, unknown>;
      const hip = String(s.hipotese ?? "outro");
      const clienteOuDesc =
        inv.lancamento?.descricao ??
        (inv.divergencia.cod_titulo
          ? `titulo ${inv.divergencia.cod_titulo}`
          : "divergencia");
      const valor =
        inv.lancamento != null
          ? N(inv.lancamento.valor)
          : N(inv.divergencia.valor_titulo);
      await db.from("aprovacoes").insert({
        area: "financeiro",
        item_tipo: "divergencia",
        item_id: inv.divergenciaId,
        titulo: `${hip} · ${String(clienteOuDesc).slice(0, 40)} · R$ ${valor.toFixed(2)}`,
        proposta: {
          hipotese: s.hipotese,
          explicacao: s.explicacao,
          confianca: s.confianca,
          acao_sugerida: s.acao_sugerida,
          cod_titulos_envolvidos: s.cod_titulos_envolvidos ?? [],
          valor_a_baixar: s.valor_a_baixar ?? null,
          valor_pendente: s.valor_pendente ?? null,
          divergencia: {
            tipo_inicial: inv.divergencia.tipo_inicial,
            cod_titulo: inv.divergencia.cod_titulo,
          },
        },
        status: "pendente",
      });
    }

    await db
      .from("divergencias")
      .update({ status: "aguardando_aprovacao" })
      .eq("extrato_id", extratoId);

    await finalizarOrquestrador(raizId, "ok");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finalizarOrquestrador(raizId, "erro", msg);
    throw e;
  }
}
