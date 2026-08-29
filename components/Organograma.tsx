"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Execucao = {
  id: string;
  agente: string;
  status: "rodando" | "ok" | "erro";
  saida: Record<string, unknown> | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  inicio: string;
  fim: string | null;
};

type Area = "vendas" | "financeiro";

const AGENTES_POR_AREA: Record<Area, string[]> = {
  vendas: ["triador", "pesquisador", "redator", "revisor"],
  financeiro: ["investigador", "consolidador", "revisor"],
};

const ROTULO: Record<string, string> = {
  orquestrador: "Orquestrador",
  triador: "Triador",
  pesquisador: "Pesquisador",
  redator: "Redator",
  revisor: "Revisor",
  investigador: "Investigador",
  consolidador: "Consolidador",
};

const COLUNAS = "id, agente, status, saida, tokens_entrada, tokens_saida, inicio, fim";

export default function Organograma({ area, itemId }: { area: Area; itemId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [execs, setExecs] = useState<Execucao[]>([]);
  const [setaFeedbackVermelha, setSetaFeedbackVermelha] = useState(false);
  const reprovacoesVistas = useRef<Set<string>>(new Set());

  useEffect(() => {
    let ativo = true;

    supabase
      .from("execucoes_agentes")
      .select(COLUNAS)
      .eq("item_id", itemId)
      .order("inicio", { ascending: true })
      .then(({ data }) => {
        if (ativo && data) setExecs(data as Execucao[]);
      });

    const canal = supabase
      .channel(`organograma-${itemId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "execucoes_agentes", filter: `item_id=eq.${itemId}` },
        (payload) => {
          const nova = payload.new as Execucao;
          if (!nova?.id) return;
          setExecs((prev) => {
            const i = prev.findIndex((e) => e.id === nova.id);
            if (i === -1) return [...prev, nova];
            const copia = prev.slice();
            copia[i] = nova;
            return copia;
          });
        },
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [supabase, itemId]);

  // Seta revisor -> redator vermelha por 3s quando o revisor reprova.
  useEffect(() => {
    const reprovacao = execs.find(
      (e) =>
        e.agente === "revisor" &&
        e.status === "ok" &&
        e.saida != null &&
        (e.saida as { aprovado?: unknown }).aprovado === false &&
        !reprovacoesVistas.current.has(e.id),
    );
    if (!reprovacao) return;
    reprovacoesVistas.current.add(reprovacao.id);
    setSetaFeedbackVermelha(true);
    const t = setTimeout(() => setSetaFeedbackVermelha(false), 3000);
    return () => clearTimeout(t);
  }, [execs]);

  const raiz = execs.filter((e) => e.agente === "orquestrador");
  const agentes = AGENTES_POR_AREA[area];

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      <Cartao rotulo={ROTULO.orquestrador} execs={raiz} />
      <div style={{ color: "#bbb", lineHeight: 1 }}>&#8595;</div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
        {agentes.map((nome, idx) => {
          const doAgente = execs.filter((e) => e.agente === nome);
          const agregado = area === "vendas" ? false : nome === "investigador";
          // separador entre este cartao e o anterior
          const anterior = agentes[idx - 1];
          const setaEntreRedatorERevisor = anterior === "redator" && nome === "revisor";
          return (
            <span key={nome} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {idx > 0 ? (
                <span
                  style={{
                    color: setaEntreRedatorERevisor && setaFeedbackVermelha ? "#c0392b" : "#bbb",
                    fontWeight: setaEntreRedatorERevisor && setaFeedbackVermelha ? 700 : 400,
                  }}
                >
                  &#8594;
                </span>
              ) : null}
              <Cartao rotulo={ROTULO[nome]} execs={doAgente} agregado={agregado} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Cartao({
  rotulo,
  execs,
  agregado = false,
}: {
  rotulo: string;
  execs: Execucao[];
  agregado?: boolean;
}) {
  const rodando = execs.filter((e) => e.status === "rodando").length;
  const ok = execs.filter((e) => e.status === "ok").length;
  const erro = execs.filter((e) => e.status === "erro").length;
  const ultima = execs[execs.length - 1];

  let fundo = "#f0f0f0";
  let borda = "1px solid #ddd";
  let animacao = "none";
  if (erro > 0) {
    fundo = "#f8d7da";
    borda = "1px solid #e0a0a8";
  } else if (rodando > 0) {
    fundo = "#fff3cd";
    borda = "1px solid #e0c98a";
    animacao = "pulso 1.1s ease-in-out infinite";
  } else if (ok > 0) {
    fundo = "#d4edda";
    borda = "1px solid #a3d0af";
  }

  let detalhe = "";
  if (agregado) {
    detalhe = `${rodando} rodando / ${ok} concluidos`;
  } else if (ultima?.status === "erro") {
    detalhe = "erro";
  } else if (ultima?.status === "ok" && ultima.fim) {
    const seg = (
      (new Date(ultima.fim).getTime() - new Date(ultima.inicio).getTime()) /
      1000
    ).toFixed(1);
    const tokens = (ultima.tokens_entrada ?? 0) + (ultima.tokens_saida ?? 0);
    detalhe = `${seg}s / ${tokens} tok`;
  } else if (ultima?.status === "rodando") {
    detalhe = "...";
  }

  return (
    <div
      style={{
        minWidth: 120,
        padding: "0.55rem 0.8rem",
        borderRadius: 8,
        border: borda,
        background: fundo,
        animation: animacao,
        textAlign: "center",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{rotulo}</div>
      <div style={{ fontSize: "0.72rem", color: "#555", marginTop: 2, minHeight: "1em" }}>{detalhe}</div>
    </div>
  );
}
