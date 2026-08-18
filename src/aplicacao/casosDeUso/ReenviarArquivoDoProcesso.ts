import type {
  IdentidadeDoArquivoEsperado,
  RepositorioDeOrdensDeServico,
} from "@/aplicacao/contratos/Repositorios";
import type { ServidorDeArquivosDaOrdem } from "@/aplicacao/contratos/ServidorDeArquivosDaOrdem";
import { criarLinhaDeSubstituicaoDeArquivo } from "@/aplicacao/servicos/registrosDaOrdem";
import { validarArquivoDoProcesso } from "@/aplicacao/servicos/validacaoDeArquivoDoProcesso";
import type { Usuario } from "@/dominio/entidades/Usuario";
import type { TipoProcessoProducao } from "@/dominio/enumeracoes";
import type { NovoArquivoDeProducao } from "@/dominio/objetosDeValor";

export interface EntradaReenviarArquivoDoProcesso {
  idDaOrdem: string;
  tipoProcesso: TipoProcessoProducao;
  arquivoAnteriorEsperado: IdentidadeDoArquivoEsperado;
  novoArquivo: File;
  usuarioResponsavel: Usuario;
  caminhoRegistro: string;
}

export interface ResultadoReenvioArquivoDoProcesso {
  arquivoNovo: NovoArquivoDeProducao;
  aviso?: string;
}

export class ReenviarArquivoDoProcesso {
  constructor(
    private readonly ordens: RepositorioDeOrdensDeServico,
    private readonly arquivos: ServidorDeArquivosDaOrdem,
  ) {}

  async executar(
    entrada: EntradaReenviarArquivoDoProcesso,
  ): Promise<ResultadoReenvioArquivoDoProcesso> {
    if (!entrada.usuarioResponsavel.podeSubstituirArquivoDeProcesso()) {
      throw new Error("Apenas Designer ou Administrador pode substituir arquivos de produção.");
    }
    const erroDoArquivo = validarArquivoDoProcesso(entrada.tipoProcesso, entrada.novoArquivo);
    if (erroDoArquivo) throw new Error(erroDoArquivo);

    const arquivoNovo = await this.arquivos.enviarSubstituicaoDoArquivo(
      entrada.idDaOrdem,
      entrada.tipoProcesso,
      entrada.novoArquivo,
    );

    let resultado;
    try {
      resultado = await this.ordens.substituirArquivoDoProcesso({
        idDaOrdem: entrada.idDaOrdem,
        tipoProcesso: entrada.tipoProcesso,
        arquivoAnteriorEsperado: entrada.arquivoAnteriorEsperado,
        arquivoNovo,
      });
    } catch (erroDoFirestore) {
      try {
        await this.arquivos.removerArquivoDoProcesso(
          entrada.idDaOrdem,
          entrada.tipoProcesso,
          arquivoNovo.caminhoNoServidor,
        );
      } catch {
        // O erro de concorrência/persistência continua sendo o que permite ao
        // usuário decidir com segurança se deve atualizar a tela e tentar de novo.
      }
      throw erroDoFirestore;
    }

    const avisos: string[] = [];
    const idDaOperacao = crypto.randomUUID();
    const linha = criarLinhaDeSubstituicaoDeArquivo({
      idDaOperacao,
      nomeDoUsuario: entrada.usuarioResponsavel.nome,
      processo: entrada.tipoProcesso,
      nomeDoArquivoAnterior: resultado.arquivoAnterior.nomeOriginal,
      caminhoDoArquivoAnterior: resultado.arquivoAnterior.caminhoNoServidor,
      nomeDoArquivoNovo: resultado.arquivoNovo.nomeOriginal,
      caminhoDoArquivoNovo: resultado.arquivoNovo.caminhoNoServidor,
    });
    let registroFoiGravado = false;
    try {
      await this.arquivos.acrescentarRegistro(entrada.caminhoRegistro, linha);
      registroFoiGravado = true;
    } catch {
      // O ponteiro já foi trocado por CAS. Informar sucesso parcial evita que o
      // usuário repita o reupload e gere outra versão desnecessária do arquivo.
      avisos.push(
        `O arquivo foi substituído, mas o registro de auditoria ${idDaOperacao} ficou pendente.`,
      );
      avisos.push("O arquivo anterior foi mantido no servidor para recuperação.");
    }

    if (registroFoiGravado) {
      try {
        await this.ordens.atualizarRegistroMaisRecente(entrada.idDaOrdem, linha);
      } catch {
        avisos.push("O registro foi gravado, mas a atividade recente não pôde ser atualizada.");
      }
    }

    if (
      registroFoiGravado &&
      resultado.arquivoAnterior.caminhoNoServidor !== resultado.arquivoNovo.caminhoNoServidor
    ) {
      try {
        await this.arquivos.removerArquivoDoProcesso(
          entrada.idDaOrdem,
          entrada.tipoProcesso,
          resultado.arquivoAnterior.caminhoNoServidor,
        );
      } catch {
        avisos.push("O arquivo anterior ficou pendente de limpeza no servidor.");
      }
    }

    return {
      arquivoNovo: resultado.arquivoNovo,
      ...(avisos.length ? { aviso: avisos.join(" ") } : {}),
    };
  }
}
