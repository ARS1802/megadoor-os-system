export enum CargoUsuario {
  ADMIN = "ADMIN",
  DESIGNER = "DESIGNER",
  MAQUINISTA = "MAQUINISTA",
}

export const ROTULOS_CARGOS: Record<CargoUsuario, string> = {
  [CargoUsuario.ADMIN]: "Administrador",
  [CargoUsuario.DESIGNER]: "Designer",
  [CargoUsuario.MAQUINISTA]: "Maquinista",
};

export enum StatusOrdemDeServico {
  PRONTA = "PRONTA",
  EM_PRODUCAO = "EM_PRODUCAO",
  PARADA = "PARADA",
  CONCLUIDA = "CONCLUIDA",
}

export const ROTULOS_STATUS_ORDEM: Record<StatusOrdemDeServico, string> = {
  [StatusOrdemDeServico.PRONTA]: "Pronta",
  [StatusOrdemDeServico.EM_PRODUCAO]: "Em produção",
  [StatusOrdemDeServico.PARADA]: "Parada",
  [StatusOrdemDeServico.CONCLUIDA]: "Concluída",
};

export enum TipoProcessoProducao {
  IMPRESSAO = "IMPRESSAO",
  PLOTAGEM = "PLOTAGEM",
  CORTE = "CORTE",
}

export const ROTULOS_PROCESSOS: Record<TipoProcessoProducao, string> = {
  [TipoProcessoProducao.IMPRESSAO]: "Impressão",
  [TipoProcessoProducao.PLOTAGEM]: "Plotagem",
  [TipoProcessoProducao.CORTE]: "Corte",
};

export function rotuloDoProcesso(tipo: TipoProcessoProducao): string {
  return ROTULOS_PROCESSOS[tipo];
}

export enum TipoContadorProducao {
  GRADE = "GRADE",
  UNIDADE = "UNIDADE",
}

export enum SentidoDoAjuste {
  ADICIONAR = "ADICIONAR",
  REMOVER = "REMOVER",
}

export enum TipoAlertaProducao {
  QUANTIDADE_EXCEDIDA = "QUANTIDADE_EXCEDIDA",
  INATIVIDADE = "INATIVIDADE",
}

export enum TipoDocumentoFiscal {
  CPF = "CPF",
  CNPJ = "CNPJ",
}

export enum StatusPresenca {
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
}

export enum StatusSincronizacaoRegistro {
  PENDENTE = "PENDENTE",
  EM_ENVIO = "EM_ENVIO",
  CONCLUIDA = "CONCLUIDA",
}
