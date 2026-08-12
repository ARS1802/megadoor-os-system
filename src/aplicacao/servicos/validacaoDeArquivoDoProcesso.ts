import { TipoProcessoProducao, rotuloDoProcesso } from "@/dominio/enumeracoes";

const EXTENSOES_POR_PROCESSO: Readonly<Record<TipoProcessoProducao, readonly string[]>> = {
  [TipoProcessoProducao.IMPRESSAO]: [".pdf", ".jpg", ".jpeg", ".png"],
  [TipoProcessoProducao.PLOTAGEM]: [".plt", ".pdf"],
  [TipoProcessoProducao.CORTE]: [".plt", ".pdf"],
};

export function extensoesPermitidasParaProcesso(processo: TipoProcessoProducao): readonly string[] {
  return EXTENSOES_POR_PROCESSO[processo];
}

export function validarArquivoDoProcesso(
  processo: TipoProcessoProducao,
  arquivo: File,
): string | null {
  const extensoes = extensoesPermitidasParaProcesso(processo);
  const nomeNormalizado = arquivo.name.toLocaleLowerCase("pt-BR");

  if (!extensoes.some((extensao) => nomeNormalizado.endsWith(extensao))) {
    return `O processo de ${rotuloDoProcesso(processo).toLocaleLowerCase("pt-BR")} aceita apenas ${extensoes.join(", ")}.`;
  }
  if (arquivo.size <= 0) return "O arquivo selecionado está vazio.";
  return null;
}
