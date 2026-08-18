import type { DocumentReference } from "firebase/firestore";
import type {
  RepositorioDeOrdensDeServico,
  ResultadoConclusaoForcada,
} from "@/aplicacao/contratos/Repositorios";
import {
  exigirServidorDisponivel,
  type ServidorDeArquivosDaOrdem,
} from "@/aplicacao/contratos/ServidorDeArquivosDaOrdem";
import { criarLinhaDeConclusaoForcada } from "@/aplicacao/servicos/registrosDaOrdem";

export interface EntradaConclusaoForcada {
  idDaOrdem: string;
  referenciaAdministrador: DocumentReference;
  nomeDoAdministrador: string;
  justificativa: string;
  caminhoRegistro: string;
}

export class ForcarConclusaoDaOrdem {
  constructor(
    private readonly ordens: RepositorioDeOrdensDeServico,
    private readonly arquivos: ServidorDeArquivosDaOrdem,
  ) {}

  async executar(entrada: EntradaConclusaoForcada): Promise<ResultadoConclusaoForcada> {
    await exigirServidorDisponivel(this.arquivos);
    const resultado = await this.ordens.forcarConclusao(
      entrada.idDaOrdem,
      entrada.referenciaAdministrador,
      entrada.justificativa,
    );
    const linha = criarLinhaDeConclusaoForcada({
      nomeDoAdministrador: entrada.nomeDoAdministrador,
      justificativa: entrada.justificativa,
      resultado,
    });
    try {
      await this.arquivos.acrescentarRegistro(entrada.caminhoRegistro, linha);
    } catch {
      // A OS já está concluída no Firestore; a interface precisa informar
      // sucesso parcial em vez de induzir uma nova tentativa de conclusão.
      return {
        ...resultado,
        aviso:
          "A Ordem de Serviço foi concluída, mas o registro de auditoria não foi confirmado. Não repita a conclusão.",
      };
    }
    try {
      await this.ordens.atualizarRegistroMaisRecente(entrada.idDaOrdem, linha);
    } catch {
      return {
        ...resultado,
        aviso:
          "A Ordem de Serviço foi concluída e o registro foi gravado, mas a atividade recente não pôde ser atualizada.",
      };
    }
    return resultado;
  }
}
