import type { DocumentReference } from "firebase/firestore";
import type {
  RepositorioDeOrdensDeServico,
  ResultadoConclusaoForcada,
} from "@/aplicacao/contratos/Repositorios";
import type { ServidorDeArquivosDaOrdem } from "@/aplicacao/contratos/ServidorDeArquivosDaOrdem";
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
    const resultado = await this.ordens.forcarConclusao(
      entrada.idDaOrdem,
      entrada.referenciaAdministrador,
      entrada.justificativa,
    );
    try {
      await this.arquivos.acrescentarRegistro(
        entrada.caminhoRegistro,
        criarLinhaDeConclusaoForcada({
          nomeDoAdministrador: entrada.nomeDoAdministrador,
          justificativa: entrada.justificativa,
          resultado,
        }),
      );
    } catch {
      // A OS já está concluída no Firestore; a interface precisa informar
      // sucesso parcial em vez de induzir uma nova tentativa de conclusão.
      return {
        ...resultado,
        aviso:
          "A Ordem de Serviço foi concluída, mas o registro de auditoria não foi confirmado. Não repita a conclusão.",
      };
    }
    return resultado;
  }
}
