"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Organograma from "@/components/Organograma";
import FilaAprovacao from "@/components/FilaAprovacao";

type ExtratoInfo = {
  id: string;
  nome_arquivo: string | null;
  total_linhas: number | null;
  total_creditos: number | null;
};

type Lancamento = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: string;
  cod_titulo_casado: string | null;
  situacao: string | null;
};

type Divergencia = {
  id: string;
  tipo_inicial: string;
  cod_titulo: string | null;
  valor_lancamento: number | null;
  valor_titulo: number | null;
  status: string;
  hipotese: Record<string, unknown> | null;
};

type LinhaNormalizada = { data: string; descricao: string; valor: number; tipo: string };

const COLUNAS_DIV = [
  { chave: "nova", rotulo: "Nova" },
  { chave: "investigando", rotulo: "Investigando" },
  { chave: "aguardando_aprovacao", rotulo: "Aguardando aprovacao" },
  { chave: "resolvida", rotulo: "Resolvida" },
];

const real = (v: number | null | undefined) =>
  "R$ " + (Number(v ?? 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FinanceiroTela({
  extratoInicial,
}: {
  extratoInicial: ExtratoInfo | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [extrato, setExtrato] = useState<ExtratoInfo | null>(extratoInicial);
  const [preview, setPreview] = useState<{ antes: string[]; depois: LinhaNormalizada[]; titulos: number } | null>(
    null,
  );
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);
  const [relatorio, setRelatorio] = useState<string | null>(null);
  const [aba, setAba] = useState<"resultado" | "relatorio" | "aprovacoes">("resultado");

  const [importando, setImportando] = useState(false);
  const [conciliando, setConciliando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const extratoRef = useRef<HTMLInputElement>(null);
  const titulosRef = useRef<HTMLInputElement>(null);

  const extratoId = extrato?.id ?? null;

  useEffect(() => {
    if (!extratoId) return;
    let ativo = true;

    const carregar = async () => {
      const [lanc, divs, rel] = await Promise.all([
        supabase
          .from("lancamentos")
          .select("id, data, descricao, valor, tipo, cod_titulo_casado, situacao")
          .eq("extrato_id", extratoId)
          .order("data", { ascending: true }),
        supabase
          .from("divergencias")
          .select("id, tipo_inicial, cod_titulo, valor_lancamento, valor_titulo, status, hipotese")
          .eq("extrato_id", extratoId)
          .order("criado_em", { ascending: true }),
        supabase
          .from("execucoes_agentes")
          .select("saida, fim")
          .eq("item_id", extratoId)
          .eq("agente", "consolidador")
          .eq("status", "ok")
          .order("fim", { ascending: false })
          .limit(1),
      ]);
      if (!ativo) return;
      if (lanc.data) setLancamentos(lanc.data as Lancamento[]);
      if (divs.data) setDivergencias(divs.data as Divergencia[]);
      const saida = rel.data?.[0]?.saida as { relatorio_markdown?: string } | undefined;
      if (saida?.relatorio_markdown) setRelatorio(saida.relatorio_markdown);
    };
    carregar();

    const canal = supabase
      .channel(`financeiro-${extratoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lancamentos", filter: `extrato_id=eq.${extratoId}` },
        () => carregar(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "divergencias", filter: `extrato_id=eq.${extratoId}` },
        () => carregar(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "execucoes_agentes", filter: `item_id=eq.${extratoId}` },
        (payload) => {
          const nova = payload.new as { agente?: string; status?: string; saida?: { relatorio_markdown?: string } };
          if (nova?.agente === "consolidador" && nova.status === "ok" && nova.saida?.relatorio_markdown) {
            setRelatorio(nova.saida.relatorio_markdown);
          }
        },
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [supabase, extratoId]);

  async function importar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const arquivo = extratoRef.current?.files?.[0];
    if (!arquivo) {
      setErro("Selecione o arquivo do extrato.");
      return;
    }
    const fd = new FormData();
    fd.append("extrato", arquivo);
    const tit = titulosRef.current?.files?.[0];
    if (tit) fd.append("titulos", tit);

    setImportando(true);
    try {
      const resp = await fetch("/api/financeiro/importar", { method: "POST", body: fd });
      const dados = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErro(dados.erro ?? "Falha ao importar.");
        return;
      }
      setPreview({ antes: dados.antes ?? [], depois: dados.depois ?? [], titulos: dados.titulos_enviados ?? 0 });
      setRelatorio(null);
      setLancamentos([]);
      setDivergencias([]);
      setExtrato({
        id: dados.extrato_id,
        nome_arquivo: arquivo.name,
        total_linhas: dados.total_linhas ?? null,
        total_creditos: dados.total_creditos ?? null,
      });
    } catch {
      setErro("Erro de rede ao importar.");
    } finally {
      setImportando(false);
    }
  }

  async function conciliar() {
    if (!extratoId) return;
    setErro(null);
    setConciliando(true);
    try {
      const resp = await fetch("/api/financeiro/conciliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extrato_id: extratoId }),
      });
      const dados = await resp.json().catch(() => ({}));
      if (!resp.ok) setErro(dados.erro ?? "Falha ao conciliar.");
    } catch {
      setErro("Erro de rede ao conciliar.");
    } finally {
      setConciliando(false);
    }
  }

  const bateram = lancamentos.filter((l) => l.situacao === "casado");
  const ignorados = lancamentos.filter((l) => l.situacao === "ignorado");

  return (
    <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Organograma da conciliacao corrente */}
      {extratoId ? (
        <Organograma area="financeiro" itemId={extratoId} />
      ) : (
        <div style={caixaVazia}>Importe um extrato para comecar.</div>
      )}

      {/* Bloco Importar */}
      <form onSubmit={importar} style={cartao}>
        <h2 style={h2}>Importar</h2>
        <label style={rotulo}>
          Extrato (obrigatorio, CSV limpo ou bruto)
          <input ref={extratoRef} type="file" accept=".csv,text/csv,text/plain" required />
        </label>
        <label style={rotulo}>
          Titulos (opcional)
          <input ref={titulosRef} type="file" accept=".csv,text/csv,text/plain" />
        </label>
        <button type="submit" disabled={importando} style={botao("#1a1a1a")}>
          {importando ? "Importando..." : "Importar"}
        </button>
      </form>

      {erro ? <p style={{ color: "#c0392b", fontSize: "0.85rem" }}>{erro}</p> : null}

      {/* Antes e depois */}
      {preview ? (
        <div style={cartao}>
          <h2 style={h2}>Antes e depois {preview.titulos > 0 ? `(${preview.titulos} titulos enviados)` : ""}</h2>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 20rem", minWidth: 0 }}>
              <div style={subtitulo}>Como veio (6 primeiras linhas)</div>
              <pre style={preBox}>{preview.antes.join("\n") || "-"}</pre>
            </div>
            <div style={{ flex: "1 1 20rem", minWidth: 0 }}>
              <div style={subtitulo}>Normalizado (6 primeiras linhas)</div>
              <pre style={preBox}>
                {preview.depois
                  .map((l) => `${l.data} | ${l.descricao} | ${l.valor.toFixed(2)} | ${l.tipo}`)
                  .join("\n") || "-"}
              </pre>
            </div>
          </div>
        </div>
      ) : null}

      {/* Conciliar */}
      {extratoId ? (
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <button onClick={conciliar} disabled={conciliando} style={botao("#2e7d32")}>
            {conciliando ? "Conciliando..." : "Conciliar"}
          </button>
          <span style={{ fontSize: "0.8rem", color: "#777" }}>
            {extrato?.nome_arquivo} · {extrato?.total_linhas ?? "?"} linhas · {extrato?.total_creditos ?? "?"} creditos
          </span>
        </div>
      ) : null}

      {/* Abas */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button onClick={() => setAba("resultado")} style={abaEstilo(aba === "resultado")}>
          Resultado
        </button>
        <button onClick={() => setAba("relatorio")} style={abaEstilo(aba === "relatorio")}>
          Relatorio
        </button>
        <button onClick={() => setAba("aprovacoes")} style={abaEstilo(aba === "aprovacoes")}>
          Aprovacoes
        </button>
      </div>

      {aba === "aprovacoes" ? <FilaAprovacao area="financeiro" /> : null}

      {aba === "relatorio" ? (
        <div style={cartao}>
          {relatorio ? renderMarkdown(relatorio) : <p style={{ color: "#888" }}>Sem relatorio ainda. Rode Conciliar.</p>}
        </div>
      ) : null}

      {aba === "resultado" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Bateram */}
          <div style={cartao}>
            <h2 style={{ ...h2, color: "#2e7d32" }}>Bateram ({bateram.length})</h2>
            <ListaLancamentos itens={bateram} mostrarTitulo />
          </div>

          {/* Divergencias */}
          <div style={cartao}>
            <h2 style={h2}>Divergencias ({divergencias.length})</h2>
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", gap: "0.75rem", minWidth: "min-content" }}>
                {COLUNAS_DIV.map((col) => {
                  const daColuna = divergencias.filter((d) => d.status === col.chave);
                  return (
                    <div key={col.chave} style={{ width: "15rem", flex: "0 0 auto" }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#555", padding: "0.25rem 0.1rem" }}>
                        {col.rotulo} ({daColuna.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {daColuna.map((d) => {
                          const hip = d.hipotese?.hipotese as string | undefined;
                          const valor = d.valor_lancamento ?? d.valor_titulo;
                          return (
                            <article key={d.id} style={cardDiv}>
                              <div style={{ fontWeight: 600 }}>{d.tipo_inicial}</div>
                              <div style={{ color: "#555" }}>{real(valor)}</div>
                              {d.cod_titulo ? <div style={{ color: "#888", fontSize: "0.75rem" }}>{d.cod_titulo}</div> : null}
                              {hip ? (
                                <div style={{ marginTop: 4, fontSize: "0.75rem", color: "#1a1a1a" }}>
                                  hipotese: {hip}
                                  {typeof d.hipotese?.confianca === "number"
                                    ? ` (${Math.round((d.hipotese.confianca as number) * 100)}%)`
                                    : ""}
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Ignorados */}
          <div style={cartao}>
            <h2 style={{ ...h2, color: "#777" }}>Ignorados ({ignorados.length})</h2>
            <ListaLancamentos itens={ignorados} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ListaLancamentos({ itens, mostrarTitulo = false }: { itens: Lancamento[]; mostrarTitulo?: boolean }) {
  if (itens.length === 0) return <p style={{ color: "#999", fontSize: "0.85rem" }}>Nada aqui.</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
        <tbody>
          {itens.map((l) => (
            <tr key={l.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "0.35rem 0.5rem", color: "#999", whiteSpace: "nowrap" }}>{l.data}</td>
              <td style={{ padding: "0.35rem 0.5rem" }}>{l.descricao}</td>
              <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", whiteSpace: "nowrap" }}>
                {real(l.valor)}
              </td>
              {mostrarTitulo ? (
                <td style={{ padding: "0.35rem 0.5rem", color: "#2e7d32", whiteSpace: "nowrap" }}>
                  {l.cod_titulo_casado ?? ""}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Renderizador minimo de markdown (#, ##, ###, listas, paragrafos).
function renderMarkdown(md: string) {
  const linhas = md.split(/\r?\n/);
  const blocos: React.ReactNode[] = [];
  let lista: string[] = [];
  const fechaLista = (k: number) => {
    if (lista.length) {
      blocos.push(
        <ul key={`ul-${k}`} style={{ margin: "0.25rem 0 0.75rem 1.25rem" }}>
          {lista.map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </ul>,
      );
      lista = [];
    }
  };
  linhas.forEach((l, i) => {
    const t = l.trim();
    if (t.startsWith("### ")) {
      fechaLista(i);
      blocos.push(<h4 key={i} style={{ margin: "0.75rem 0 0.25rem" }}>{t.slice(4)}</h4>);
    } else if (t.startsWith("## ")) {
      fechaLista(i);
      blocos.push(<h3 key={i} style={{ margin: "0.9rem 0 0.35rem" }}>{t.slice(3)}</h3>);
    } else if (t.startsWith("# ")) {
      fechaLista(i);
      blocos.push(<h2 key={i} style={{ margin: "0.5rem 0" }}>{t.slice(2)}</h2>);
    } else if (t.startsWith("- ") || t.startsWith("* ")) {
      lista.push(t.slice(2));
    } else if (t === "") {
      fechaLista(i);
    } else {
      fechaLista(i);
      blocos.push(<p key={i} style={{ margin: "0.35rem 0" }}>{t}</p>);
    }
  });
  fechaLista(linhas.length);
  return <div style={{ fontSize: "0.9rem", lineHeight: 1.55 }}>{blocos}</div>;
}

const cartao: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 8,
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
};
const caixaVazia: React.CSSProperties = {
  background: "#fff",
  border: "1px dashed #ccc",
  borderRadius: 8,
  padding: "1.25rem",
  color: "#999",
  textAlign: "center",
  fontSize: "0.9rem",
};
const cardDiv: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 6,
  padding: "0.55rem",
  fontSize: "0.82rem",
};
const h2: React.CSSProperties = { fontSize: "1rem" };
const subtitulo: React.CSSProperties = { fontSize: "0.75rem", color: "#888", marginBottom: 4 };
const rotulo: React.CSSProperties = { fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.3rem" };
const preBox: React.CSSProperties = {
  margin: 0,
  padding: "0.6rem",
  background: "#f6f6f6",
  borderRadius: 4,
  fontSize: "0.72rem",
  overflowX: "auto",
  whiteSpace: "pre",
};

function botao(cor: string): React.CSSProperties {
  return {
    padding: "0.5rem 0.9rem",
    background: cor,
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: "0.85rem",
    alignSelf: "flex-start",
  };
}
function abaEstilo(ativa: boolean): React.CSSProperties {
  return {
    padding: "0.45rem 0.9rem",
    background: ativa ? "#1a1a1a" : "#fff",
    color: ativa ? "#fff" : "#333",
    border: "1px solid " + (ativa ? "#1a1a1a" : "#ccc"),
    borderRadius: 4,
    cursor: "pointer",
    fontSize: "0.85rem",
  };
}
