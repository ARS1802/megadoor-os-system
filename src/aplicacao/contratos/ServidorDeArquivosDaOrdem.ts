import type { NovoArquivoDeProducao } from "@/dominio/objetosDeValor";
import type { TipoProcessoProducao } from "@/dominio/enumeracoes";

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
  abrirCertificado(): void;
}
