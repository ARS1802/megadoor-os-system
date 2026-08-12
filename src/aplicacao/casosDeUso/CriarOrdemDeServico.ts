import type { DocumentReference } from "firebase/firestore";
import type { RepositorioDeOrdensDeServico } from "@/aplicacao/contratos/Repositorios";
import type { ServidorDeArquivosDaOrdem } from "@/aplicacao/contratos/ServidorDeArquivosDaOrdem";
import { OrdemDeServico } from "@/dominio/entidades/OrdemDeServico";
import { ProcessoDeProducao } from "@/dominio/entidades/ProcessoDeProducao";
import type { Usuario } from "@/dominio/entidades/Usuario";
import type {
  ArquivoSelecionadoDoProcesso,
  DimensoesDaUnidade,
  EspecificacaoDeGrade,
} from "@/dominio/objetosDeValor";

export interface EntradaCriarOrdemDeServico {
  referenciaCandidato: DocumentReference;
  referenciaMaterial: DocumentReference;
  tiragem: number;
  quantidadeTotal: number;
  dimensoesDaUnidade: DimensoesDaUnidade;
  especificacaoDeGrade: EspecificacaoDeGrade;
  observacao: string;
  processos: ArquivoSelecionadoDoProcesso[];
  usuarioCriador: Usuario;
  referenciaUsuarioCriador: DocumentReference;
}

export class CriarOrdemDeServico {
  constructor(
    private readonly ordens: RepositorioDeOrdensDeServico,
    private readonly arquivos: ServidorDeArquivosDaOrdem,
  ) {}

  async executar(entrada: EntradaCriarOrdemDeServico): Promise<OrdemDeServico> {
    if (!entrada.usuarioCriador.podeCriarOrdem())
      throw new Error("Seu cargo não pode criar Ordens de Serviço.");
    if (!entrada.processos.length) throw new Error("Selecione ao menos um processo.");
    const id = this.ordens.gerarIdentificador();
    await this.arquivos.criarDiretorioDaOrdem(id);
    try {
      // Cada etapa termina antes da seguinte. Assim, uma falha não inicia a
      // compensação enquanto outro upload da mesma OS ainda está em andamento.
      const caminhoRegistro = await this.arquivos.criarArquivoDeRegistro(id);
      const caminhoObservacao = await this.arquivos.criarArquivoDeObservacao(
        id,
        entrada.observacao,
      );
      const arquivosEnviados = [];
      for (const { tipo, arquivo } of entrada.processos) {
        arquivosEnviados.push({
          tipo,
          arquivo: await this.arquivos.enviarArquivoDoProcesso(id, tipo, arquivo),
        });
      }
      const ordem = new OrdemDeServico({
        id,
        referenciaCandidato: entrada.referenciaCandidato,
        referenciaMaterial: entrada.referenciaMaterial,
        referenciaUsuarioCriador: entrada.referenciaUsuarioCriador,
        tiragem: entrada.tiragem,
        quantidadeTotal: entrada.quantidadeTotal,
        dimensoesDaUnidade: entrada.dimensoesDaUnidade,
        especificacaoDeGrade: entrada.especificacaoDeGrade,
        tiposDeProcessos: arquivosEnviados.map(({ tipo }) => tipo),
        caminhoRegistro,
        caminhoObservacao,
      });
      const processos = arquivosEnviados.map(
        ({ tipo, arquivo }) =>
          new ProcessoDeProducao({ tipo, arquivo, metaDeUnidades: entrada.quantidadeTotal }),
      );
      await this.ordens.criarComRelacionamentos(ordem, processos);
      return ordem;
    } catch (erro) {
      try {
        await this.arquivos.removerDiretorioDaOrdem(id);
      } catch {
        // A falha original continua sendo a mais relevante para o usuário.
      }
      throw erro;
    }
  }
}
