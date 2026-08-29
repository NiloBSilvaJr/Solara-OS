// Limpeza deterministica do extrato bancario e dos titulos (SPEC 5.3).
// Sem modelo: so parsing e normalizacao.

export type LancamentoLimpo = {
  data: string; // ISO aaaa-mm-dd
  descricao: string;
  valor: number; // sempre positivo
  tipo: "credito" | "debito";
};

export type ResultadoLimpeza = {
  linhasBrutas: string[];
  lancamentos: LancamentoLimpo[];
};

export type TituloLimpo = {
  cod_titulo: string;
  cod_cliente: string;
  nota_fiscal: string;
  valor: number;
  emissao: string;
  vencimento: string;
  status: string;
};

function detectarSeparador(linhas: string[]): ";" | "," {
  let pontoEVirgula = 0;
  let virgula = 0;
  for (const l of linhas.slice(0, 15)) {
    pontoEVirgula += (l.match(/;/g) || []).length;
    virgula += (l.match(/,/g) || []).length;
  }
  return pontoEVirgula >= virgula ? ";" : ",";
}

function dataParaIso(bruta: string): string | null {
  const t = bruta.trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return null;
}

// "1.250,00" -> 1250.00 ; "-45,90" -> -45.9 ; "1250.00" -> 1250
function numeroBr(bruto: string): number {
  const t = String(bruto).trim();
  if (!t) return NaN;
  if (t.includes(",")) return parseFloat(t.replace(/\./g, "").replace(",", "."));
  return parseFloat(t);
}

// Divide uma linha CSV simples respeitando aspas.
function dividir(linha: string, sep: string): string[] {
  const out: string[] = [];
  let atual = "";
  let aspas = false;
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas;
    else if (ch === sep && !aspas) {
      out.push(atual);
      atual = "";
    } else atual += ch;
  }
  out.push(atual);
  return out.map((c) => c.trim());
}

export function limparExtrato(conteudo: string): ResultadoLimpeza {
  const linhasBrutas = conteudo
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim() !== "");

  const primeira = (linhasBrutas[0] ?? "").toLowerCase();

  // Arquivo ja limpo: cabecalho cod_lancamento,data,descricao,valor,tipo
  if (primeira.startsWith("cod_lancamento")) {
    const sep = detectarSeparador(linhasBrutas);
    const lancamentos: LancamentoLimpo[] = [];
    for (const linha of linhasBrutas.slice(1)) {
      const p = dividir(linha, sep);
      if (p.length < 5) continue;
      const data = dataParaIso(p[1]);
      const n = numeroBr(p[3]);
      if (!data || Number.isNaN(n)) continue;
      const tipoColuna = (p[4] || "").toLowerCase();
      const tipo: "credito" | "debito" =
        tipoColuna === "debito" || tipoColuna === "débito" || n < 0 ? "debito" : "credito";
      lancamentos.push({ data, descricao: p[2], valor: Math.abs(n), tipo });
    }
    return { linhasBrutas, lancamentos };
  }

  // Extrato bruto do banco.
  const sep = detectarSeparador(linhasBrutas);
  const iCabecalho = linhasBrutas.findIndex((l) => /^data\s*[;,]/i.test(l.trim()));
  const corpo = iCabecalho >= 0 ? linhasBrutas.slice(iCabecalho + 1) : linhasBrutas;

  const lancamentos: LancamentoLimpo[] = [];
  for (const linha of corpo) {
    const p = dividir(linha, sep);
    const data = dataParaIso(p[0] ?? "");
    if (!data) continue; // rodape, texto solto
    const descricao = p[1] ?? "";
    if (/saldo/i.test(descricao)) continue;
    const n = numeroBr(p[2] ?? "");
    if (Number.isNaN(n)) continue; // linha de saldo sem valor
    lancamentos.push({
      data,
      descricao,
      valor: Math.abs(n),
      tipo: n < 0 ? "debito" : "credito",
    });
  }
  return { linhasBrutas, lancamentos };
}

// Titulos enviados junto (opcional). Aceita o mesmo layout do CSV de titulos_receber.
export function limparTitulos(conteudo: string): TituloLimpo[] {
  const linhas = conteudo
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, "").trim())
    .filter((l) => l !== "");
  if (linhas.length < 2) return [];

  const sep = detectarSeparador(linhas);
  const cabecalho = dividir(linhas[0], sep).map((c) => c.toLowerCase());
  const idx = (nome: string) => cabecalho.indexOf(nome);

  const iCod = idx("cod_titulo");
  const iCliente = idx("cod_cliente");
  const iNf = idx("nota_fiscal");
  const iValor = idx("valor");
  const iEmissao = idx("emissao");
  const iVenc = idx("vencimento");
  const iStatus = idx("status");
  if (iCod < 0 || iValor < 0) return [];

  const titulos: TituloLimpo[] = [];
  for (const linha of linhas.slice(1)) {
    const p = dividir(linha, sep);
    const valor = numeroBr(p[iValor] ?? "");
    if (!p[iCod] || Number.isNaN(valor)) continue;
    titulos.push({
      cod_titulo: p[iCod],
      cod_cliente: iCliente >= 0 ? p[iCliente] ?? "" : "",
      nota_fiscal: iNf >= 0 ? p[iNf] ?? "" : "",
      valor,
      emissao: iEmissao >= 0 ? dataParaIso(p[iEmissao] ?? "") ?? "" : "",
      vencimento: iVenc >= 0 ? dataParaIso(p[iVenc] ?? "") ?? "" : "",
      status: iStatus >= 0 ? p[iStatus] ?? "aberto" : "aberto",
    });
  }
  return titulos;
}
