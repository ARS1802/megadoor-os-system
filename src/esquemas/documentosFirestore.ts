import { z } from "zod";
import {
  CargoUsuario,
  StatusSincronizacaoRegistro,
  StatusOrdemDeServico,
  TipoDocumentoFiscal,
  TipoProcessoProducao,
} from "../dominio/enumeracoes";

export const esquemaReferenciaDeDocumento = z.custom<{ path: string }>(
  (valor) => typeof valor === "object" && valor !== null && "path" in valor,
  "Referência de documento inválida.",
);

export const esquemaTimestamp = z.custom<{ toDate(): Date }>(
  (valor) => typeof valor === "object" && valor !== null && "toDate" in valor,
  "Timestamp inválido.",
);

export const esquemaDimensoesDaUnidade = z.strictObject({
  larguraEmCentimetros: z.number().positive(),
  alturaEmCentimetros: z.number().positive(),
});

export const esquemaDimensoesDoRolo = z.strictObject({
  larguraEmCentimetros: z.number().positive(),
  comprimentoEmCentimetros: z.number().positive(),
});

export const esquemaEspecificacaoDeGrade = z.strictObject({
  larguraEmCentimetros: z.number().positive(),
  alturaEmCentimetros: z.number().positive(),
  unidadesPorGrade: z.number().int().positive(),
});

export const esquemaArquivoDeProducao = z.strictObject({
  nomeOriginal: z.string().min(1),
  extensao: z.string().min(1),
  tamanhoEmBytes: z.number().int().nonnegative(),
  caminhoNoServidor: z.string().min(1),
  // Opcional somente durante a leitura de documentos criados antes deste campo existir.
  modificadoEm: esquemaTimestamp.optional(),
});

export const esquemaDocumentoUsuario = z.strictObject({
  nome: z.string().min(1),
  email: z.email(),
  cargo: z.enum(CargoUsuario),
  ativo: z.boolean(),
  referenciasOrdensParticipadas: z.array(esquemaReferenciaDeDocumento),
  criadoEm: esquemaTimestamp,
  atualizadoEm: esquemaTimestamp,
});

export const esquemaDocumentoCandidato = z.strictObject({
  nome: z.string().min(1),
  nomeNormalizado: z.string().min(1),
  partido: z.string().min(1).optional(),
  documentoFiscal: z
    .strictObject({ tipo: z.enum(TipoDocumentoFiscal), numero: z.string().min(1) })
    .optional(),
  observacoes: z.string().optional(),
  ativo: z.boolean(),
  referenciaUsuarioCriador: esquemaReferenciaDeDocumento,
  criadoEm: esquemaTimestamp,
  atualizadoEm: esquemaTimestamp,
});

export const esquemaDocumentoMaterial = z.strictObject({
  nome: z.string().min(1),
  nomeNormalizado: z.string().min(1),
  marca: z.string().min(1),
  dimensoesDoRolo: esquemaDimensoesDoRolo,
  gramatura: z.number().positive().optional(),
  caminhoImagemEtiqueta: z.string().optional(),
  rolosUtilizados: z.number().int().nonnegative(),
  referenciasOrdensDeServico: z.array(esquemaReferenciaDeDocumento),
  referenciaUsuarioCriador: esquemaReferenciaDeDocumento,
  criadoEm: esquemaTimestamp,
  atualizadoEm: esquemaTimestamp,
});

export const esquemaDocumentoOrdemDeServico = z.strictObject({
  referenciaCandidato: esquemaReferenciaDeDocumento,
  referenciaMaterial: esquemaReferenciaDeDocumento,
  referenciaUsuarioCriador: esquemaReferenciaDeDocumento,
  tiragem: z.number().int().positive(),
  quantidadeTotal: z.number().int().positive(),
  dimensoesDaUnidade: esquemaDimensoesDaUnidade,
  especificacaoDeGrade: esquemaEspecificacaoDeGrade,
  tiposDeProcessos: z
    .array(z.enum(TipoProcessoProducao))
    .min(1)
    .max(3)
    .refine((valores) => new Set(valores).size === valores.length),
  status: z.enum(StatusOrdemDeServico),
  ultimaAtividadeEm: esquemaTimestamp.nullable(),
  caminhoRegistro: z.string().regex(/^ordens-de-servico\/[A-Za-z0-9_-]+\/registro\.txt$/),
  // Documentos anteriores à introdução do resumo de atividade continuam legíveis.
  registroMaisRecente: z.string().default(""),
  caminhoObservacao: z.string().regex(/^ordens-de-servico\/[A-Za-z0-9_-]+\/observacao\.txt$/),
  dadosDeConclusao: z
    .strictObject({
      concluidaEm: esquemaTimestamp,
      referenciaUsuarioResponsavel: esquemaReferenciaDeDocumento,
      foiForcada: z.boolean(),
      justificativa: z.string().optional(),
    })
    .optional(),
  criadaEm: esquemaTimestamp,
  atualizadaEm: esquemaTimestamp,
});

export const esquemaDocumentoProcesso = z.strictObject({
  tipo: z.enum(TipoProcessoProducao),
  arquivo: esquemaArquivoDeProducao,
  unidadesProduzidas: z.number().int().nonnegative(),
  metaDeUnidades: z.number().int().positive(),
  ultimaAtividadeEm: esquemaTimestamp.nullable(),
  referenciaUltimoUsuario: esquemaReferenciaDeDocumento.nullable(),
  criadoEm: esquemaTimestamp,
  atualizadoEm: esquemaTimestamp,
});

export const esquemaDocumentoReservaDeNomeDeMaterial = z.strictObject({
  nomeNormalizado: z.string().min(1),
  referenciaMaterial: esquemaReferenciaDeDocumento,
  criadoEm: esquemaTimestamp,
});

export const esquemaDocumentoOperacaoIdempotente = z.strictObject({
  referenciaOrdemDeServico: esquemaReferenciaDeDocumento,
  referenciaUsuario: esquemaReferenciaDeDocumento,
  tipoProcesso: z.enum(TipoProcessoProducao),
  sincronizacaoDoRegistro: z.enum(StatusSincronizacaoRegistro),
  criadaEm: esquemaTimestamp,
  expiraEm: esquemaTimestamp,
});
