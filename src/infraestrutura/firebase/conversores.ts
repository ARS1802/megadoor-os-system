import { Timestamp, type FirestoreDataConverter } from "firebase/firestore";
import { Candidato } from "@/dominio/entidades/Candidato";
import { Material } from "@/dominio/entidades/Material";
import { OrdemDeServico } from "@/dominio/entidades/OrdemDeServico";
import { ProcessoDeProducao } from "@/dominio/entidades/ProcessoDeProducao";
import { Usuario } from "@/dominio/entidades/Usuario";
import {
  DimensoesDaUnidade,
  DimensoesDoRolo,
  EspecificacaoDeGrade,
} from "@/dominio/objetosDeValor";
import {
  esquemaDocumentoCandidato,
  esquemaDocumentoMaterial,
  esquemaDocumentoOrdemDeServico,
  esquemaDocumentoProcesso,
  esquemaDocumentoUsuario,
} from "@/esquemas/documentosFirestore";
import type {
  DocumentoCandidato,
  DocumentoMaterial,
  DocumentoOrdemDeServico,
  DocumentoProcessoDeProducao,
  DocumentoUsuario,
} from "@/infraestrutura/firebase/documentos";

const data = (valor: Date) => Timestamp.fromDate(valor);

export const conversorUsuario: FirestoreDataConverter<Usuario, DocumentoUsuario> = {
  toFirestore(usuario) {
    return {
      nome: usuario.nome,
      email: usuario.email,
      cargo: usuario.cargo,
      ativo: usuario.ativo,
      referenciasOrdensParticipadas: usuario.referenciasOrdensParticipadas,
      criadoEm: Timestamp.now(),
      atualizadoEm: Timestamp.now(),
    };
  },
  fromFirestore(snapshot, options) {
    const dados = esquemaDocumentoUsuario.parse(snapshot.data(options)) as DocumentoUsuario;
    return new Usuario({ id: snapshot.id, ...dados });
  },
};

export const conversorCandidato: FirestoreDataConverter<Candidato, DocumentoCandidato> = {
  toFirestore(candidato) {
    return {
      nome: candidato.nome,
      nomeNormalizado: candidato.nomeNormalizado,
      ...(candidato.partido ? { partido: candidato.partido } : {}),
      ...(candidato.documentoFiscal ? { documentoFiscal: candidato.documentoFiscal } : {}),
      ...(candidato.observacoes ? { observacoes: candidato.observacoes } : {}),
      ativo: candidato.ativo,
      referenciaUsuarioCriador: candidato.referenciaUsuarioCriador,
      criadoEm: data(candidato.criadoEm),
      atualizadoEm: data(candidato.atualizadoEm),
    };
  },
  fromFirestore(snapshot, options) {
    const dados = esquemaDocumentoCandidato.parse(snapshot.data(options)) as DocumentoCandidato;
    return new Candidato({
      ...dados,
      id: snapshot.id,
      criadoEm: dados.criadoEm.toDate(),
      atualizadoEm: dados.atualizadoEm.toDate(),
    });
  },
};

export const conversorMaterial: FirestoreDataConverter<Material, DocumentoMaterial> = {
  toFirestore(material) {
    return {
      nome: material.nome,
      nomeNormalizado: material.nomeNormalizado,
      marca: material.marca,
      dimensoesDoRolo: material.dimensoesDoRolo.paraMapa(),
      ...(material.gramatura ? { gramatura: material.gramatura } : {}),
      ...(material.caminhoImagemEtiqueta
        ? { caminhoImagemEtiqueta: material.caminhoImagemEtiqueta }
        : {}),
      rolosUtilizados: material.rolosUtilizados,
      referenciasOrdensDeServico: material.referenciasOrdensDeServico,
      referenciaUsuarioCriador: material.referenciaUsuarioCriador,
      criadoEm: data(material.criadoEm),
      atualizadoEm: data(material.atualizadoEm),
    };
  },
  fromFirestore(snapshot, options) {
    const dados = esquemaDocumentoMaterial.parse(snapshot.data(options)) as DocumentoMaterial;
    return new Material({
      ...dados,
      id: snapshot.id,
      dimensoesDoRolo: new DimensoesDoRolo(
        dados.dimensoesDoRolo.larguraEmCentimetros,
        dados.dimensoesDoRolo.comprimentoEmCentimetros,
      ),
      criadoEm: dados.criadoEm.toDate(),
      atualizadoEm: dados.atualizadoEm.toDate(),
    });
  },
};

export const conversorOrdemDeServico: FirestoreDataConverter<
  OrdemDeServico,
  DocumentoOrdemDeServico
> = {
  toFirestore(ordem) {
    return {
      referenciaCandidato: ordem.referenciaCandidato,
      referenciaMaterial: ordem.referenciaMaterial,
      referenciaUsuarioCriador: ordem.referenciaUsuarioCriador,
      tiragem: ordem.tiragem,
      quantidadeTotal: ordem.quantidadeTotal,
      dimensoesDaUnidade: ordem.dimensoesDaUnidade.paraMapa(),
      especificacaoDeGrade: ordem.especificacaoDeGrade.paraMapa(),
      tiposDeProcessos: ordem.tiposDeProcessos,
      status: ordem.status,
      ultimaAtividadeEm: ordem.ultimaAtividadeEm ? data(ordem.ultimaAtividadeEm) : null,
      caminhoRegistro: ordem.caminhoRegistro,
      registroMaisRecente: ordem.registroMaisRecente,
      caminhoObservacao: ordem.caminhoObservacao,
      ...(ordem.dadosDeConclusao
        ? {
            dadosDeConclusao: {
              ...ordem.dadosDeConclusao,
              concluidaEm: data(ordem.dadosDeConclusao.concluidaEm),
            },
          }
        : {}),
      criadaEm: data(ordem.criadaEm),
      atualizadaEm: data(ordem.atualizadaEm),
    };
  },
  fromFirestore(snapshot, options) {
    const dadosBrutos = snapshot.data(options) as Record<string, unknown>;
    // Compatibilidade temporária: o domínio não conhece mais estas métricas,
    // mas documentos anteriores à migração ainda podem contê-las.
    const {
      metragemQuadradaCalculada: _metragemLegada,
      quantidadeRolosCalculada: _rolosLegados,
      ...documentoAtual
    } = dadosBrutos;
    const dados = esquemaDocumentoOrdemDeServico.parse(documentoAtual) as DocumentoOrdemDeServico;
    return new OrdemDeServico({
      ...dados,
      id: snapshot.id,
      dimensoesDaUnidade: new DimensoesDaUnidade(
        dados.dimensoesDaUnidade.larguraEmCentimetros,
        dados.dimensoesDaUnidade.alturaEmCentimetros,
      ),
      especificacaoDeGrade: new EspecificacaoDeGrade(
        dados.especificacaoDeGrade.larguraEmCentimetros,
        dados.especificacaoDeGrade.alturaEmCentimetros,
        dados.especificacaoDeGrade.unidadesPorGrade,
      ),
      ultimaAtividadeEm: dados.ultimaAtividadeEm?.toDate() ?? null,
      dadosDeConclusao: dados.dadosDeConclusao
        ? { ...dados.dadosDeConclusao, concluidaEm: dados.dadosDeConclusao.concluidaEm.toDate() }
        : undefined,
      criadaEm: dados.criadaEm.toDate(),
      atualizadaEm: dados.atualizadaEm.toDate(),
    });
  },
};

export const conversorProcesso: FirestoreDataConverter<
  ProcessoDeProducao,
  DocumentoProcessoDeProducao
> = {
  toFirestore(processo) {
    return {
      tipo: processo.tipo,
      arquivo: {
        ...processo.arquivo,
        ...(processo.arquivo.modificadoEm
          ? { modificadoEm: data(processo.arquivo.modificadoEm) }
          : {}),
      },
      unidadesProduzidas: processo.unidadesProduzidas,
      metaDeUnidades: processo.metaDeUnidades,
      ultimaAtividadeEm: processo.ultimaAtividadeEm ? data(processo.ultimaAtividadeEm) : null,
      referenciaUltimoUsuario: processo.referenciaUltimoUsuario,
      criadoEm: data(processo.criadoEm),
      atualizadoEm: data(processo.atualizadoEm),
    };
  },
  fromFirestore(snapshot, options) {
    const dados = esquemaDocumentoProcesso.parse(
      snapshot.data(options),
    ) as DocumentoProcessoDeProducao;
    return new ProcessoDeProducao({
      ...dados,
      arquivo: {
        ...dados.arquivo,
        modificadoEm: dados.arquivo.modificadoEm?.toDate(),
      },
      ultimaAtividadeEm: dados.ultimaAtividadeEm?.toDate() ?? null,
      criadoEm: dados.criadoEm.toDate(),
      atualizadoEm: dados.atualizadoEm.toDate(),
    });
  },
};
