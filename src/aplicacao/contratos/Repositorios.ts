import type { DocumentReference, Unsubscribe } from "firebase/firestore";
import type { Candidato } from "@/dominio/entidades/Candidato";
import type { Material } from "@/dominio/entidades/Material";
import type { OrdemDeServico } from "@/dominio/entidades/OrdemDeServico";
import type { ProcessoDeProducao } from "@/dominio/entidades/ProcessoDeProducao";
import type { Usuario } from "@/dominio/entidades/Usuario";
import type { ArquivoDeProducao, NovoArquivoDeProducao } from "@/dominio/objetosDeValor";
import type {
  SentidoDoAjuste,
  TipoContadorProducao,
  TipoProcessoProducao,
} from "@/dominio/enumeracoes";

export interface RepositorioDeUsuarios {
  salvar(usuario: Usuario): Promise<void>;
  obterPorId(id: string): Promise<Usuario | null>;
  referencia(id: string): DocumentReference;
}

export interface RepositorioDeCandidatos {
  criar(candidato: Candidato): Promise<void>;
  listarAtivos(): Promise<Candidato[]>;
  obterPorReferencia(referencia: DocumentReference): Promise<Candidato | null>;
  gerarReferencia(): DocumentReference;
}

export interface RepositorioDeMateriais {
  criarComNomeUnico(material: Material): Promise<void>;
  listarAtivos(): Promise<Material[]>;
  obterPorReferencia(referencia: DocumentReference): Promise<Material | null>;
  gerarReferencia(): DocumentReference;
}

export interface EntradaAjusteProducao {
  idDaOperacao: string;
  idDaOrdem: string;
  tipoProcesso: TipoProcessoProducao;
  tipoContador: TipoContadorProducao;
  sentido: SentidoDoAjuste;
  quantidadeDoAjuste: number;
  referenciaUsuario: DocumentReference;
}

export interface ResultadoAjusteProducao {
  variacaoEmUnidades: number;
  unidadesProduzidas: number;
  ordemFoiConcluida: boolean;
  operacaoJaExistia: boolean;
  /** A alteração foi persistida, mas uma etapa posterior ficou pendente. */
  aviso?: string;
}

export interface ResumoProcessoDaConclusaoForcada {
  tipoProcesso: TipoProcessoProducao;
  unidadesProduzidas: number;
  unidadesFaltantes: number;
}

export interface ResultadoConclusaoForcada {
  processos: ResumoProcessoDaConclusaoForcada[];
  /** A conclusão foi persistida, mas uma etapa posterior ficou pendente. */
  aviso?: string;
}

export interface IdentidadeDoArquivoEsperado {
  caminhoNoServidor: string;
  modificadoEm?: Date;
}

export interface EntradaSubstituicaoArquivoDoProcesso {
  idDaOrdem: string;
  tipoProcesso: TipoProcessoProducao;
  arquivoAnteriorEsperado: IdentidadeDoArquivoEsperado;
  arquivoNovo: NovoArquivoDeProducao;
}

export interface ResultadoSubstituicaoArquivoDoProcesso {
  arquivoAnterior: ArquivoDeProducao;
  arquivoNovo: NovoArquivoDeProducao;
  atualizadoEm: Date;
}

export interface RepositorioDeOrdensDeServico {
  gerarIdentificador(): string;
  criarComRelacionamentos(ordem: OrdemDeServico, processos: ProcessoDeProducao[]): Promise<void>;
  obterPorId(id: string): Promise<OrdemDeServico | null>;
  listar(): Promise<OrdemDeServico[]>;
  observarLista(atualizar: (ordens: OrdemDeServico[]) => void): Unsubscribe;
  listarProcessos(idDaOrdem: string): Promise<ProcessoDeProducao[]>;
  observarOrdem(idDaOrdem: string, atualizar: (ordem: OrdemDeServico | null) => void): Unsubscribe;
  observarProcesso(
    idDaOrdem: string,
    tipo: TipoProcessoProducao,
    atualizar: (processo: ProcessoDeProducao | null) => void,
  ): Unsubscribe;
  ajustarProducao(entrada: EntradaAjusteProducao): Promise<ResultadoAjusteProducao>;
  substituirArquivoDoProcesso(
    entrada: EntradaSubstituicaoArquivoDoProcesso,
  ): Promise<ResultadoSubstituicaoArquivoDoProcesso>;
  forcarConclusao(
    idDaOrdem: string,
    referenciaAdministrador: DocumentReference,
    justificativa: string,
  ): Promise<ResultadoConclusaoForcada>;
  marcarComoParadaSeInativa(idDaOrdem: string): Promise<boolean>;
}
