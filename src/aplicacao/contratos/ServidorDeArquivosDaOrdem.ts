import type { NovoArquivoDeProducao } from "@/dominio/objetosDeValor";
import type { TipoProcessoProducao } from "@/dominio/enumeracoes";

export const MENSAGEM_SERVIDOR_NAO_CONFIGURADO = "Configure o servidor correto!";

export class ErroServidorNaoConfigurado extends Error {
  constructor() {
    super(MENSAGEM_SERVIDOR_NAO_CONFIGURADO);
    this.name = "ErroServidorNaoConfigurado";
  }
}

export async function exigirServidorDisponivel(
  servidor: Pick<ServidorDeArquivosDaOrdem, "verificarConexao">,
): Promise<void> {
  if (!(await servidor.verificarConexao())) throw new ErroServidorNaoConfigurado();
}

export interface MetadadosDoArquivoNoServidor {
  nome: string;
  caminhoNoServidor: string;
  tamanhoEmBytes: number;
  modificadoEm: Date;
}

export interface ServidorDeArquivosDaOrdem {
  verificarConexao(): Promise<boolean>;
  criarDiretorioDaOrdem(idDaOrdem: string): Promise<void>;
  criarArquivoDeRegistro(idDaOrdem: string): Promise<string>;
  criarArquivoDeObservacao(idDaOrdem: string, texto: string): Promise<string>;
  enviarArquivoDoProcesso(
    idDaOrdem: string,
    tipo: TipoProcessoProducao,
    arquivo: File,
  ): Promise<NovoArquivoDeProducao>;
  enviarSubstituicaoDoArquivo(
    idDaOrdem: string,
    tipo: TipoProcessoProducao,
    arquivo: File,
  ): Promise<NovoArquivoDeProducao>;
  obterMetadadosDoArquivo(caminhoNoServidor: string): Promise<MetadadosDoArquivoNoServidor>;
  removerArquivoDoProcesso(
    idDaOrdem: string,
    tipo: TipoProcessoProducao,
    caminhoNoServidor: string,
  ): Promise<void>;
  enviarImagemDaEtiquetaDoMaterial(idDoMaterial: string, arquivo: File): Promise<string>;
  removerDiretorioDoMaterial(idDoMaterial: string): Promise<void>;
  baixarArquivo(caminho: string, atualizarProgresso?: (porcentagem: number) => void): Promise<Blob>;
  lerTexto(caminho: string): Promise<string>;
  acrescentarRegistro(caminho: string, linha: string): Promise<void>;
  removerDiretorioDaOrdem(idDaOrdem: string): Promise<void>;
  abrirCertificado(): Promise<void>;
}
