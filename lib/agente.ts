import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/utils/supabase/admin";

const MODELO = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;

export type PapelAgente =
  | "triador"
  | "pesquisador"
  | "redator"
  | "revisor"
  | "investigador"
  | "consolidador";

export type ContextoExecucao = {
  area: "vendas" | "financeiro";
  item_tipo: "pedido" | "divergencia";
  item_id: string;
  chamado_por?: string | null;
};

export type ResultadoAgente = {
  saida: Record<string, unknown>;
  execucao_id: string;
};

let clienteAnthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!clienteAnthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY nao configurada.");
    clienteAnthropic = new Anthropic({ apiKey });
  }
  return clienteAnthropic;
}

async function lerSystemPrompt(area: string, papel: string): Promise<string> {
  const caminho = path.join(process.cwd(), "prompts", area, `${papel}.md`);
  return readFile(caminho, "utf-8");
}

// A resposta do modelo deve ser JSON. Aceita tambem JSON dentro de cerca ```json.
function parseJsonEstrito(texto: string): Record<string, unknown> {
  const limpo = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(limpo) as Record<string, unknown>;
}

/**
 * Unica porta de entrada para a API da Anthropic (SPEC 3.2).
 * Grava a execucao em `execucoes_agentes` no inicio (status `rodando`) e
 * atualiza no fim (`ok` ou `erro`).
 */
export async function agente(
  papel: PapelAgente,
  entrada: Record<string, unknown>,
  contexto: ContextoExecucao,
): Promise<ResultadoAgente> {
  const db = createAdminClient();

  const { data: exec, error: errInsert } = await db
    .from("execucoes_agentes")
    .insert({
      area: contexto.area,
      item_tipo: contexto.item_tipo,
      item_id: contexto.item_id,
      agente: papel,
      chamado_por: contexto.chamado_por ?? null,
      status: "rodando",
      entrada,
      inicio: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (errInsert || !exec) {
    throw new Error(
      `Nao foi possivel registrar a execucao do agente ${papel}: ${errInsert?.message}`,
    );
  }
  const execucaoId = exec.id as string;

  try {
    const system = await lerSystemPrompt(contexto.area, papel);

    const resposta = await anthropic().messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: JSON.stringify(entrada) }],
    });

    const texto = resposta.content
      .map((bloco) => (bloco.type === "text" ? bloco.text : ""))
      .join("");
    const tokensEntrada = resposta.usage.input_tokens;
    const tokensSaida = resposta.usage.output_tokens;

    let saida: Record<string, unknown>;
    try {
      saida = parseJsonEstrito(texto);
    } catch {
      await db
        .from("execucoes_agentes")
        .update({
          status: "erro",
          erro: `Resposta do agente ${papel} nao e JSON valido: ${texto.slice(0, 500)}`,
          tokens_entrada: tokensEntrada,
          tokens_saida: tokensSaida,
          fim: new Date().toISOString(),
        })
        .eq("id", execucaoId);
      throw new Error(`Agente ${papel} devolveu resposta que nao e JSON.`);
    }

    await db
      .from("execucoes_agentes")
      .update({
        status: "ok",
        saida,
        tokens_entrada: tokensEntrada,
        tokens_saida: tokensSaida,
        fim: new Date().toISOString(),
      })
      .eq("id", execucaoId);

    return { saida, execucao_id: execucaoId };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    // So grava se ainda estiver `rodando` (nao sobrescreve o erro de parse acima).
    await db
      .from("execucoes_agentes")
      .update({ status: "erro", erro: mensagem, fim: new Date().toISOString() })
      .eq("id", execucaoId)
      .eq("status", "rodando");
    throw e;
  }
}

/**
 * Cria a linha raiz do organograma: o `orquestrador` (SPEC 3.2). O id retornado
 * e passado como `chamado_por` para todos os agentes que o orquestrador dispara.
 */
export async function iniciarOrquestrador(contexto: ContextoExecucao): Promise<string> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("execucoes_agentes")
    .insert({
      area: contexto.area,
      item_tipo: contexto.item_tipo,
      item_id: contexto.item_id,
      agente: "orquestrador",
      chamado_por: null,
      status: "rodando",
      inicio: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Nao foi possivel criar a execucao raiz: ${error?.message}`);
  }
  return data.id as string;
}

export async function finalizarOrquestrador(
  execucaoId: string,
  status: "ok" | "erro" = "ok",
  erro?: string,
): Promise<void> {
  const db = createAdminClient();
  await db
    .from("execucoes_agentes")
    .update({ status, erro: erro ?? null, fim: new Date().toISOString() })
    .eq("id", execucaoId);
}
