import {
  ROTULOS_PROCESSOS,
  SentidoDoAjuste,
  TipoContadorProducao,
  TipoProcessoProducao,
} from "@/dominio/enumeracoes";
import type { ResultadoConclusaoForcada } from "@/aplicacao/contratos/Repositorios";

export interface TotaisDoProcessoNoRegistro {
  produzidas: number | null;
  faltantes: number | null;
}

export interface LinhaDeRegistroInterpretada {
  texto: string;
  dataHora: string;
  data: string;
  evento: string;
  idDaOperacao: string;
  nomeDoUsuario: string;
  processo: TipoProcessoProducao | "";
  tipoContador: TipoContadorProducao | "";
  sentido: SentidoDoAjuste | "";
  variacaoEmUnidades: number | null;
  justificativa: string;
  totaisPorProcesso: Record<TipoProcessoProducao, TotaisDoProcessoNoRegistro>;
  nomeDoArquivoAnterior: string;
  caminhoDoArquivoAnterior: string;
  nomeDoArquivoNovo: string;
  caminhoDoArquivoNovo: string;
}

interface DadosDaLinhaDeAjuste {
  dataHora?: Date;
  idDaOperacao: string;
  nomeDoUsuario: string;
  processo: TipoProcessoProducao;
  tipoContador: TipoContadorProducao;
  sentido: SentidoDoAjuste;
  variacaoEmUnidades: number;
}

interface DadosDaLinhaDeConclusaoForcada {
  dataHora?: Date;
  nomeDoAdministrador: string;
  justificativa: string;
  resultado: ResultadoConclusaoForcada;
}

export interface DadosDaLinhaDeSubstituicaoDeArquivo {
  dataHora?: Date;
  idDaOperacao: string;
  nomeDoUsuario: string;
  processo: TipoProcessoProducao;
  nomeDoArquivoAnterior: string;
  caminhoDoArquivoAnterior: string;
  nomeDoArquivoNovo: string;
  caminhoDoArquivoNovo: string;
}

function campoSeguro(valor: string): string {
  return valor
    .replace(/[\r\n]+/g, " ")
    .replaceAll("|", "/")
    .trim();
}

function valorDoCampo(linha: string, campo: string): string {
  for (const trecho of linha.split("|")) {
    const indiceDoSeparador = trecho.indexOf("=");
    if (indiceDoSeparador < 0) continue;
    const nome = trecho.slice(0, indiceDoSeparador).trim();
    if (nome === campo) return trecho.slice(indiceDoSeparador + 1).trim();
  }
  return "";
}

function valorInteiroDoCampo(linha: string, campo: string): number | null {
  const valor = valorDoCampo(linha, campo);
  return /^[+-]?\d+$/.test(valor) ? Number(valor) : null;
}

function trechoLegado(linha: string, valores: readonly string[]): string {
  return (
    linha
      .split("|")
      .map((trecho) => trecho.trim())
      .find((trecho) => valores.includes(trecho)) ?? ""
  );
}

function totaisDosProcessos(
  linha: string,
): Record<TipoProcessoProducao, TotaisDoProcessoNoRegistro> {
  return Object.fromEntries(
    Object.values(TipoProcessoProducao).map((processo) => [
      processo,
      {
        produzidas: valorInteiroDoCampo(linha, `${processo}_PRODUZIDAS`),
        faltantes: valorInteiroDoCampo(linha, `${processo}_FALTANTES`),
      },
    ]),
  ) as Record<TipoProcessoProducao, TotaisDoProcessoNoRegistro>;
}

export function criarLinhaDeAjuste(dados: DadosDaLinhaDeAjuste): string {
  const sinal = dados.variacaoEmUnidades >= 0 ? "+" : "";
  return [
    `[${(dados.dataHora ?? new Date()).toISOString()}]`,
    `OPERACAO=${campoSeguro(dados.idDaOperacao)}`,
    `USUARIO=${campoSeguro(dados.nomeDoUsuario)}`,
    `PROCESSO=${dados.processo}`,
    `CONTADOR=${dados.tipoContador}`,
    `SENTIDO=${dados.sentido}`,
    `UNIDADES=${sinal}${dados.variacaoEmUnidades}`,
  ].join(" | ");
}

export function criarLinhaDeConclusaoForcada(dados: DadosDaLinhaDeConclusaoForcada): string {
  const totaisPorProcesso = dados.resultado.processos.flatMap((processo) => [
    `${processo.tipoProcesso}_PRODUZIDAS=${processo.unidadesProduzidas}`,
    `${processo.tipoProcesso}_FALTANTES=${processo.unidadesFaltantes}`,
  ]);
  return [
    `[${(dados.dataHora ?? new Date()).toISOString()}]`,
    "EVENTO=CONCLUSAO_FORCADA",
    `USUARIO=${campoSeguro(dados.nomeDoAdministrador)}`,
    `JUSTIFICATIVA=${campoSeguro(dados.justificativa)}`,
    ...totaisPorProcesso,
  ].join(" | ");
}

export function criarLinhaDeSubstituicaoDeArquivo(
  dados: DadosDaLinhaDeSubstituicaoDeArquivo,
): string {
  return [
    `[${(dados.dataHora ?? new Date()).toISOString()}]`,
    "EVENTO=ARQUIVO_SUBSTITUIDO",
    `OPERACAO=${campoSeguro(dados.idDaOperacao)}`,
    `USUARIO=${campoSeguro(dados.nomeDoUsuario)}`,
    `PROCESSO=${dados.processo}`,
    `ARQUIVO_ANTERIOR=${campoSeguro(dados.nomeDoArquivoAnterior)}`,
    `CAMINHO_ANTERIOR=${campoSeguro(dados.caminhoDoArquivoAnterior)}`,
    `ARQUIVO_NOVO=${campoSeguro(dados.nomeDoArquivoNovo)}`,
    `CAMINHO_NOVO=${campoSeguro(dados.caminhoDoArquivoNovo)}`,
  ].join(" | ");
}

export function interpretarLinhaDeRegistro(texto: string): LinhaDeRegistroInterpretada {
  const dataHora = texto.match(/^\[([^\]]+)]/)?.[1]?.trim() ?? "";
  const processoNomeado = valorDoCampo(texto, "PROCESSO");
  const processoLegado = trechoLegado(texto, Object.values(TipoProcessoProducao));
  const processo = Object.values(TipoProcessoProducao).includes(
    processoNomeado as TipoProcessoProducao,
  )
    ? (processoNomeado as TipoProcessoProducao)
    : (processoLegado as TipoProcessoProducao | "");
  const unidadesNomeadas = valorDoCampo(texto, "UNIDADES");
  const unidadesLegadas = texto.match(/(?:^|\|\s*)([+-]\d+)\s+UNIDADES(?:\s*\||$)/)?.[1] ?? "";
  const unidades = unidadesNomeadas || unidadesLegadas;
  const variacaoEmUnidades = /^[+-]?\d+$/.test(unidades) ? Number(unidades) : null;
  const contadorNomeado = valorDoCampo(texto, "CONTADOR");
  const contadorLegado = trechoLegado(texto, Object.values(TipoContadorProducao));
  const tipoContador = Object.values(TipoContadorProducao).includes(
    contadorNomeado as TipoContadorProducao,
  )
    ? (contadorNomeado as TipoContadorProducao)
    : (contadorLegado as TipoContadorProducao | "");
  const sentidoNomeado = valorDoCampo(texto, "SENTIDO");
  const sentido = Object.values(SentidoDoAjuste).includes(sentidoNomeado as SentidoDoAjuste)
    ? (sentidoNomeado as SentidoDoAjuste)
    : variacaoEmUnidades === null
      ? ""
      : variacaoEmUnidades < 0
        ? SentidoDoAjuste.REMOVER
        : SentidoDoAjuste.ADICIONAR;
  const eventoInformado = valorDoCampo(texto, "EVENTO");

  return {
    texto,
    dataHora,
    data: dataHora.slice(0, 10),
    evento: eventoInformado || (variacaoEmUnidades !== null ? "AJUSTE_PRODUCAO" : ""),
    idDaOperacao: valorDoCampo(texto, "OPERACAO"),
    nomeDoUsuario: valorDoCampo(texto, "USUARIO"),
    processo,
    tipoContador,
    sentido,
    variacaoEmUnidades,
    justificativa: valorDoCampo(texto, "JUSTIFICATIVA"),
    totaisPorProcesso: totaisDosProcessos(texto),
    nomeDoArquivoAnterior: valorDoCampo(texto, "ARQUIVO_ANTERIOR"),
    caminhoDoArquivoAnterior: valorDoCampo(texto, "CAMINHO_ANTERIOR"),
    nomeDoArquivoNovo: valorDoCampo(texto, "ARQUIVO_NOVO"),
    caminhoDoArquivoNovo: valorDoCampo(texto, "CAMINHO_NOVO"),
  };
}

function instanteDoRegistro(linha: string): number | null {
  const dataHora = interpretarLinhaDeRegistro(linha).dataHora;
  const instante = Date.parse(dataHora);
  return Number.isFinite(instante) ? instante : null;
}

/**
 * Escolhe a cópia informativa mais recente sem alterar o arquivo de auditoria.
 * Uma linha atual legada ou malformada não pode bloquear um registro novo válido.
 */
export function escolherRegistroMaisRecente(atual: string, candidato: string): string {
  const instanteCandidato = instanteDoRegistro(candidato);
  if (instanteCandidato === null) throw new Error("O registro recente não possui uma data válida.");
  if (!atual.trim()) return candidato;
  const instanteAtual = instanteDoRegistro(atual);
  return instanteAtual === null || instanteCandidato >= instanteAtual ? candidato : atual;
}

function valorCsv(valor: string | number): string {
  return `"${String(valor).replaceAll('"', '""')}"`;
}

export const COLUNAS_CSV_DOS_REGISTROS = [
  "data_hora",
  "evento",
  "id_da_operacao",
  "nome_do_usuario",
  "processo",
  "tipo_do_contador",
  "sentido",
  "unidades_adicionadas_ou_removidas",
  "justificativa",
  "impressao_unidades_produzidas",
  "impressao_unidades_faltantes",
  "plotagem_unidades_produzidas",
  "plotagem_unidades_faltantes",
  "corte_unidades_produzidas",
  "corte_unidades_faltantes",
  "nome_do_arquivo_anterior",
  "caminho_do_arquivo_anterior",
  "nome_do_arquivo_novo",
  "caminho_do_arquivo_novo",
  "registro_original",
] as const;

function numeroOuVazio(valor: number | null): number | "" {
  return valor ?? "";
}

export function gerarCsvDosRegistros(linhas: LinhaDeRegistroInterpretada[]): string {
  const registros = linhas.map((linha) => [
    linha.dataHora,
    linha.evento,
    linha.idDaOperacao,
    linha.nomeDoUsuario,
    linha.processo ? ROTULOS_PROCESSOS[linha.processo] : "",
    linha.tipoContador,
    linha.sentido,
    linha.variacaoEmUnidades === null
      ? ""
      : `${linha.variacaoEmUnidades >= 0 ? "+" : ""}${linha.variacaoEmUnidades}`,
    linha.justificativa,
    numeroOuVazio(linha.totaisPorProcesso.IMPRESSAO.produzidas),
    numeroOuVazio(linha.totaisPorProcesso.IMPRESSAO.faltantes),
    numeroOuVazio(linha.totaisPorProcesso.PLOTAGEM.produzidas),
    numeroOuVazio(linha.totaisPorProcesso.PLOTAGEM.faltantes),
    numeroOuVazio(linha.totaisPorProcesso.CORTE.produzidas),
    numeroOuVazio(linha.totaisPorProcesso.CORTE.faltantes),
    linha.nomeDoArquivoAnterior,
    linha.caminhoDoArquivoAnterior,
    linha.nomeDoArquivoNovo,
    linha.caminhoDoArquivoNovo,
    linha.texto,
  ]);
  return `\uFEFF${[COLUNAS_CSV_DOS_REGISTROS, ...registros]
    .map((colunas) => colunas.map(valorCsv).join(","))
    .join("\r\n")}`;
}
