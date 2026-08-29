// Casamento deterministico credito x titulo (SPEC 5.3). Sem modelo.

export type LancamentoRow = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
};

export type Titulo = {
  cod_titulo: string;
  cod_cliente: string;
  nota_fiscal: string;
  valor: number;
  emissao: string;
  vencimento: string;
  status: string;
};

export type Cliente = { cod_cliente: string; nome: string };

export type ResultadoCasamento = {
  lancamento_id: string;
  situacao: "casado" | "divergente" | "ignorado";
  cod_titulo_casado: string | null;
  divergencia: {
    tipo_inicial: string;
    cod_titulo: string | null;
    valor_lancamento: number | null;
    valor_titulo: number | null;
  } | null;
};

export type DivergenciaTitulo = {
  tipo_inicial: "vencido_sem_pagamento";
  cod_titulo: string;
  valor_titulo: number;
};

const CENTAVOS = 0.005;

function soDigitos(s: string): string {
  return String(s ?? "").replace(/\D/g, "");
}

function nfDaDescricao(descricao: string): string {
  const m = String(descricao ?? "").match(/NF[-\s]?(\d{3,})/i);
  return m ? m[1] : "";
}

function semAcento(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
}

function diasEntre(a: string, b: string): number {
  const ms = new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime();
  return Math.abs(ms) / (1000 * 60 * 60 * 24);
}

// Cliente identificavel pelo nome na descricao do lancamento.
export function identificarCliente(descricao: string, clientes: Cliente[]): string | null {
  const d = semAcento(descricao);
  for (const c of clientes) {
    const palavras = semAcento(c.nome)
      .split(/\s+/)
      .filter((p) => p.length >= 4);
    if (palavras.length > 0 && palavras.every((p) => d.includes(p))) {
      return c.cod_cliente;
    }
  }
  return null;
}

export function casarLancamentos(
  lancamentos: LancamentoRow[],
  titulos: Titulo[],
  clientes: Cliente[],
  dataFinalExtrato: string,
): { casamentos: ResultadoCasamento[]; divergenciasTitulos: DivergenciaTitulo[] } {
  const abertos = titulos.filter((t) => (t.status || "aberto").toLowerCase() === "aberto");
  const usados = new Set<string>();
  const casamentos: ResultadoCasamento[] = [];

  for (const l of lancamentos) {
    if (l.tipo === "debito") {
      casamentos.push({
        lancamento_id: l.id,
        situacao: "ignorado",
        cod_titulo_casado: null,
        divergencia: null,
      });
      continue;
    }

    const nf = nfDaDescricao(l.descricao);
    const porNf = nf
      ? abertos.find((t) => soDigitos(t.nota_fiscal) === nf)
      : undefined;

    // Regra 1 / duplicado / valor_diferente_mesma_nf
    if (porNf) {
      const mesmoValor = Math.abs(porNf.valor - l.valor) < CENTAVOS;
      if (mesmoValor && !usados.has(porNf.cod_titulo)) {
        usados.add(porNf.cod_titulo);
        casamentos.push({
          lancamento_id: l.id,
          situacao: "casado",
          cod_titulo_casado: porNf.cod_titulo,
          divergencia: null,
        });
        continue;
      }
      if (mesmoValor && usados.has(porNf.cod_titulo)) {
        casamentos.push({
          lancamento_id: l.id,
          situacao: "divergente",
          cod_titulo_casado: null,
          divergencia: {
            tipo_inicial: "duplicado",
            cod_titulo: porNf.cod_titulo,
            valor_lancamento: l.valor,
            valor_titulo: porNf.valor,
          },
        });
        continue;
      }
      casamentos.push({
        lancamento_id: l.id,
        situacao: "divergente",
        cod_titulo_casado: null,
        divergencia: {
          tipo_inicial: "valor_diferente_mesma_nf",
          cod_titulo: porNf.cod_titulo,
          valor_lancamento: l.valor,
          valor_titulo: porNf.valor,
        },
      });
      continue;
    }

    // Regra 2: um unico titulo em aberto, mesmo valor, vencimento a ate 5 dias.
    const porValorEData = abertos.filter(
      (t) =>
        !usados.has(t.cod_titulo) &&
        Math.abs(t.valor - l.valor) < CENTAVOS &&
        diasEntre(t.vencimento, l.data) <= 5,
    );
    if (porValorEData.length === 1) {
      usados.add(porValorEData[0].cod_titulo);
      casamentos.push({
        lancamento_id: l.id,
        situacao: "casado",
        cod_titulo_casado: porValorEData[0].cod_titulo,
        divergencia: null,
      });
      continue;
    }

    // Regra 3: divergente
    const clienteId = identificarCliente(l.descricao, clientes);
    const mesmoValorQualquer = abertos.some((t) => Math.abs(t.valor - l.valor) < CENTAVOS);

    // possivel_soma: dois titulos (de preferencia do mesmo cliente) somam o valor
    const candidatosSoma = clienteId
      ? abertos.filter((t) => !usados.has(t.cod_titulo) && t.cod_cliente === clienteId)
      : abertos.filter((t) => !usados.has(t.cod_titulo));
    let ehSoma = false;
    for (let i = 0; i < candidatosSoma.length && !ehSoma; i++) {
      for (let j = i + 1; j < candidatosSoma.length; j++) {
        if (Math.abs(candidatosSoma[i].valor + candidatosSoma[j].valor - l.valor) < 0.01) {
          ehSoma = true;
          break;
        }
      }
    }

    let tipoInicial = "sem_titulo_correspondente";
    if (ehSoma) tipoInicial = "possivel_soma";
    else if (mesmoValorQualquer) tipoInicial = "sem_titulo_correspondente";

    casamentos.push({
      lancamento_id: l.id,
      situacao: "divergente",
      cod_titulo_casado: null,
      divergencia: {
        tipo_inicial: tipoInicial,
        cod_titulo: null,
        valor_lancamento: l.valor,
        valor_titulo: null,
      },
    });
  }

  // Titulos vencidos sem pagamento.
  const divergenciasTitulos: DivergenciaTitulo[] = [];
  for (const t of abertos) {
    if (usados.has(t.cod_titulo)) continue;
    if (t.vencimento && t.vencimento < dataFinalExtrato) {
      divergenciasTitulos.push({
        tipo_inicial: "vencido_sem_pagamento",
        cod_titulo: t.cod_titulo,
        valor_titulo: t.valor,
      });
    }
  }

  return { casamentos, divergenciasTitulos };
}
