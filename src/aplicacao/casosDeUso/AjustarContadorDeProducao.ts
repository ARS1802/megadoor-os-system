import type {
  RepositorioDeOrdensDeServico,
  EntradaAjusteProducao,
  ResultadoAjusteProducao,
} from "@/aplicacao/contratos/Repositorios";
import type { ServidorDeArquivosDaOrdem } from "@/aplicacao/contratos/ServidorDeArquivosDaOrdem";
import { criarLinhaDeAjuste } from "@/aplicacao/servicos/registrosDaOrdem";

export class AjustarContadorDeProducao {
  constructor(
    private readonly ordens: RepositorioDeOrdensDeServico,
    private readonly arquivos: ServidorDeArquivosDaOrdem,
  ) {}

  async executar(
    entrada: EntradaAjusteProducao,
    caminhoRegistro: string,
    nomeDoUsuario: string,
  ): Promise<ResultadoAjusteProducao> {
    const resultado = await this.ordens.ajustarProducao(entrada);
    if (resultado.operacaoJaExistia) {
      return {
        ...resultado,
        aviso: "Esta operação já havia sido aplicada. Nenhuma unidade foi adicionada novamente.",
      };
    }
    if (!resultado.operacaoJaExistia) {
      const linha = criarLinhaDeAjuste({
        idDaOperacao: entrada.idDaOperacao,
        nomeDoUsuario,
        processo: entrada.tipoProcesso,
        tipoContador: entrada.tipoContador,
        sentido: entrada.sentido,
        variacaoEmUnidades: resultado.variacaoEmUnidades,
      });
      try {
        await this.arquivos.acrescentarRegistro(caminhoRegistro, linha);
        await this.ordens.confirmarSincronizacaoDoRegistro(entrada.idDaOperacao);
      } catch {
        // A transação de produção já foi confirmada. Retornar sucesso
        // parcial evita que o operador repita o ajuste e duplique unidades.
        return {
          ...resultado,
          aviso:
            "A produção foi salva, mas a confirmação do registro de auditoria ficou pendente. Não repita o ajuste.",
        };
      }
    }
    return resultado;
  }
}
