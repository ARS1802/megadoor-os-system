import type { TipoProcessoProducao } from "@/dominio/enumeracoes";
import type { NovoArquivoDeProducao } from "@/dominio/objetosDeValor";
import type {
  MetadadosDoArquivoNoServidor,
  ServidorDeArquivosDaOrdem,
} from "@/aplicacao/contratos/ServidorDeArquivosDaOrdem";
import { calcularSha256DoArquivo } from "@/infraestrutura/arquivos/calcularSha256DoArquivo";
import { enderecoBaseDoServidor } from "@/infraestrutura/servidor/configuracaoDoServidor";
import { z } from "zod";

const DETALHE_CONCORRENCIA_TEMPORARIA = "Tente novamente!";
const TOTAL_DE_TENTATIVAS = 3;

const esquemaRespostaUpload = z.object({
  status: z.string(),
  saved_as: z.string().min(1),
  filename: z.string().min(1),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
});

type RespostaUpload = z.infer<typeof esquemaRespostaUpload>;

interface ItemDoDiretorio {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modified_at: string;
}

interface RespostaListagem {
  path: string;
  items: ItemDoDiretorio[];
}

export class ErroServidorMegadoor extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroServidorMegadoor";
  }
}

export class ErroArquivoMuitoGrande extends ErroServidorMegadoor {
  constructor(mensagem: string) {
    super(413, mensagem);
    this.name = "ErroArquivoMuitoGrande";
  }
}

export class ErroChecksumDoArquivo extends ErroServidorMegadoor {
  constructor(mensagem: string) {
    super(422, mensagem);
    this.name = "ErroChecksumDoArquivo";
  }
}

export class ErroConcorrenciaTemporaria extends ErroServidorMegadoor {
  constructor(mensagem = DETALHE_CONCORRENCIA_TEMPORARIA) {
    super(409, mensagem);
    this.name = "ErroConcorrenciaTemporaria";
  }
}

export class ErroContratoDoServidor extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroContratoDoServidor";
  }
}

export class ErroIntegridadeDoArquivo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroIntegridadeDoArquivo";
  }
}

function mensagemDoDetalhe(detalhe: unknown): string | null {
  if (typeof detalhe === "string") return detalhe;
  if (!Array.isArray(detalhe)) return null;

  const mensagens = detalhe.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (typeof item === "object" && item !== null && "msg" in item) {
      const mensagem = (item as { msg?: unknown }).msg;
      return typeof mensagem === "string" ? [mensagem] : [];
    }
    return [];
  });
  return mensagens.length ? mensagens.join("; ") : null;
}

export class ServidorDeArquivosFastApi implements ServidorDeArquivosDaOrdem {
  constructor(private readonly obterIdDoUsuario: () => string | null) {}

  private caminhoDaOrdem(id: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Identificador da OS inválido.");
    return `ordens-de-servico/${id}`;
  }

  private caminhoDoProcesso(id: string, tipo: TipoProcessoProducao): string {
    const diretorio = tipo.toLocaleLowerCase("pt-BR");
    return `${this.caminhoDaOrdem(id)}/${diretorio}`;
  }

  private exigirArquivoDentroDoProcesso(
    idDaOrdem: string,
    tipo: TipoProcessoProducao,
    caminho: string,
  ): void {
    const diretorioEsperado = `${this.caminhoDoProcesso(idDaOrdem, tipo)}/`;
    const nome = caminho.slice(diretorioEsperado.length);
    if (
      !caminho.startsWith(diretorioEsperado) ||
      !nome ||
      nome.includes("/") ||
      nome.includes("\\")
    ) {
      throw new Error("O arquivo precisa estar dentro do processo informado.");
    }
  }

  private caminhoDoMaterial(id: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Identificador do material inválido.");
    return `materiais/${id}`;
  }

  private cabecalhos(): HeadersInit {
    const uid = this.obterIdDoUsuario();
    if (!uid) throw new ErroServidorMegadoor(401, "Usuário não autenticado.");
    return { "X-User-Id": uid, Authorization: `Bearer ${uid}` };
  }

  private async verificarResposta(
    resposta: Response,
    requisicaoDeUpload = false,
  ): Promise<Response> {
    if (resposta.ok) return resposta;
    let mensagem = `O servidor respondeu com o status ${resposta.status}.`;
    let detalhe: unknown;
    try {
      const corpo = (await resposta.json()) as { detail?: unknown };
      detalhe = corpo.detail;
      mensagem = mensagemDoDetalhe(detalhe) ?? mensagem;
    } catch {
      // Mantém a mensagem HTTP quando a resposta não for JSON.
    }

    if (resposta.status === 409 && detalhe === DETALHE_CONCORRENCIA_TEMPORARIA) {
      throw new ErroConcorrenciaTemporaria(mensagem);
    }
    if (resposta.status === 413) throw new ErroArquivoMuitoGrande(mensagem);
    if (resposta.status === 422 && requisicaoDeUpload) {
      throw new ErroChecksumDoArquivo(mensagem);
    }
    throw new ErroServidorMegadoor(resposta.status, mensagem);
  }

  private aguardar(atrasoEmMilissegundos: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, atrasoEmMilissegundos));
  }

  private async executarComRetry(
    criarRequisicao: () => Promise<Response>,
    requisicaoDeUpload = false,
  ): Promise<Response> {
    for (let tentativa = 1; tentativa <= TOTAL_DE_TENTATIVAS; tentativa += 1) {
      // Falhas de rede escapam diretamente daqui: somente a resposta 409
      // explicitamente temporária autoriza uma nova tentativa.
      const resposta = await criarRequisicao();
      try {
        return await this.verificarResposta(resposta, requisicaoDeUpload);
      } catch (erro) {
        if (!(erro instanceof ErroConcorrenciaTemporaria)) {
          throw erro;
        }
        if (tentativa === TOTAL_DE_TENTATIVAS) {
          throw new ErroConcorrenciaTemporaria(
            "O servidor está ocupado com outra operação neste caminho. Tente novamente mais tarde.",
          );
        }
        await this.aguardar(tentativa * 500);
      }
    }
    throw new Error("Estado de retry inalcançável.");
  }

  private enviarRequisicaoComFormulario(
    caminho: string,
    criarFormulario: () => FormData,
    requisicaoDeUpload = false,
  ): Promise<Response> {
    return this.executarComRetry(
      () =>
        fetch(`${enderecoBaseDoServidor()}${caminho}`, {
          method: "POST",
          headers: this.cabecalhos(),
          body: criarFormulario(),
        }),
      requisicaoDeUpload,
    );
  }

  private async enviarFormulario<T>(caminho: string, criarFormulario: () => FormData): Promise<T> {
    const resposta = await this.enviarRequisicaoComFormulario(caminho, criarFormulario);
    return (await resposta.json()) as T;
  }

  private async enviarUpload(caminho: string, arquivo: File): Promise<RespostaUpload> {
    const checksum = (await calcularSha256DoArquivo(arquivo)).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(checksum)) {
      throw new ErroIntegridadeDoArquivo("Não foi possível calcular um SHA-256 válido do arquivo.");
    }

    const respostaHttp = await this.enviarRequisicaoComFormulario(
      "/api/upload",
      () => {
        const formulario = new FormData();
        formulario.set("path", caminho);
        formulario.set("file", arquivo);
        formulario.set("checksum_sha256", checksum);
        return formulario;
      },
      true,
    );

    let corpo: unknown;
    try {
      corpo = await respostaHttp.json();
    } catch {
      throw new ErroContratoDoServidor(
        "O servidor retornou uma resposta de upload sem JSON válido.",
      );
    }
    const resultado = esquemaRespostaUpload.safeParse(corpo);
    if (!resultado.success) {
      throw new ErroContratoDoServidor("O servidor retornou uma resposta de upload incompatível.");
    }

    const resposta = resultado.data;
    const caminhoEsperado = `${caminho}/${arquivo.name}`;
    if (
      resposta.saved_as !== caminhoEsperado ||
      resposta.filename !== arquivo.name ||
      resposta.size !== arquivo.size
    ) {
      throw new ErroContratoDoServidor(
        "O caminho, o nome ou o tamanho retornado pelo upload é incompatível com o arquivo enviado.",
      );
    }
    if (resposta.sha256.toLowerCase() !== checksum) {
      throw new ErroIntegridadeDoArquivo(
        "O SHA-256 retornado pelo servidor difere do arquivo enviado.",
      );
    }
    return resposta;
  }

  async verificarConexao(): Promise<boolean> {
    try {
      const resposta = await fetch(`${enderecoBaseDoServidor()}/health`);
      if (!resposta.ok) return false;
      const dados = (await resposta.json()) as { status?: string };
      return dados.status === "ok";
    } catch {
      return false;
    }
  }

  async criarDiretorioDaOrdem(idDaOrdem: string): Promise<void> {
    await this.enviarFormulario("/api/folders", () => {
      const formulario = new FormData();
      formulario.set("path", this.caminhoDaOrdem(idDaOrdem));
      return formulario;
    });
  }

  private async enviarTexto(idDaOrdem: string, nome: string, conteudo: string): Promise<string> {
    const arquivo = new File([conteudo], nome, { type: "text/plain;charset=utf-8" });
    const resposta = await this.enviarUpload(this.caminhoDaOrdem(idDaOrdem), arquivo);
    return resposta.saved_as;
  }

  criarArquivoDeRegistro(idDaOrdem: string): Promise<string> {
    return this.enviarTexto(idDaOrdem, "registro.txt", "");
  }

  criarArquivoDeObservacao(idDaOrdem: string, texto: string): Promise<string> {
    return this.enviarTexto(idDaOrdem, "observacao.txt", texto);
  }

  async enviarArquivoDoProcesso(
    idDaOrdem: string,
    tipo: TipoProcessoProducao,
    arquivo: File,
  ): Promise<NovoArquivoDeProducao> {
    return this.enviarArquivoFisicoDoProcesso(idDaOrdem, tipo, arquivo, arquivo.name);
  }

  async enviarSubstituicaoDoArquivo(
    idDaOrdem: string,
    tipo: TipoProcessoProducao,
    arquivo: File,
  ): Promise<NovoArquivoDeProducao> {
    const indice = arquivo.name.lastIndexOf(".");
    const possuiExtensao = indice >= 0 && indice < arquivo.name.length - 1;
    const baseOriginal = indice > 0 ? arquivo.name.slice(0, indice) : "arquivo";
    const base = baseOriginal.replace(/[\\/\u0000-\u001f]/g, "-").trim() || "arquivo";
    const extensao = possuiExtensao ? arquivo.name.slice(indice) : "";
    const nomeFisico = `${base}--${crypto.randomUUID()}${extensao}`;
    return this.enviarArquivoFisicoDoProcesso(idDaOrdem, tipo, arquivo, nomeFisico);
  }

  private async enviarArquivoFisicoDoProcesso(
    idDaOrdem: string,
    tipo: TipoProcessoProducao,
    arquivo: File,
    nomeFisico: string,
  ): Promise<NovoArquivoDeProducao> {
    const arquivoFisico =
      nomeFisico === arquivo.name
        ? arquivo
        : new File([arquivo], nomeFisico, {
            type: arquivo.type,
            lastModified: arquivo.lastModified,
          });
    const resposta = await this.enviarUpload(
      this.caminhoDoProcesso(idDaOrdem, tipo),
      arquivoFisico,
    );
    this.exigirArquivoDentroDoProcesso(idDaOrdem, tipo, resposta.saved_as);
    let metadados: MetadadosDoArquivoNoServidor;
    try {
      metadados = await this.obterMetadadosDoArquivo(resposta.saved_as);
    } catch (erroDosMetadados) {
      // `saved_as` veio do upload recém-concluído e já foi validado contra o
      // diretório exato do processo. A exclusão direta evita deixar um arquivo
      // staged órfão quando justamente a listagem de metadados está indisponível.
      try {
        await this.removerArquivoRecemEnviado(resposta.saved_as);
      } catch {
        // Preserva a falha original da leitura do metadado, que explica por que
        // o arquivo não pôde ser aceito pela aplicação.
      }
      throw erroDosMetadados;
    }
    const indice = arquivo.name.lastIndexOf(".");
    return {
      nomeOriginal: arquivo.name,
      extensao: indice >= 0 ? arquivo.name.slice(indice).toLowerCase() : "",
      tamanhoEmBytes: metadados.tamanhoEmBytes,
      caminhoNoServidor: resposta.saved_as,
      modificadoEm: metadados.modificadoEm,
    };
  }

  private async removerArquivoRecemEnviado(caminhoNoServidor: string): Promise<void> {
    await this.enviarFormulario("/api/delete", () => {
      const formulario = new FormData();
      formulario.set("path", caminhoNoServidor);
      return formulario;
    });
  }

  async obterMetadadosDoArquivo(caminhoNoServidor: string): Promise<MetadadosDoArquivoNoServidor> {
    const caminho = caminhoNoServidor.trim();
    const separador = caminho.lastIndexOf("/");
    if (
      separador <= 0 ||
      separador === caminho.length - 1 ||
      caminho.startsWith("/") ||
      caminho.includes("\\") ||
      caminho.split("/").some((segmento) => !segmento || segmento === "." || segmento === "..")
    ) {
      throw new Error("Caminho de arquivo inválido.");
    }
    const diretorio = caminho.slice(0, separador);
    const resposta = await this.enviarFormulario<RespostaListagem>("/api/list", () => {
      const formulario = new FormData();
      formulario.set("path", diretorio);
      return formulario;
    });
    const item = resposta.items.find((candidato) => candidato.path === caminho);
    if (!item || item.type !== "file") {
      throw new ErroServidorMegadoor(404, "Arquivo não encontrado na listagem do servidor.");
    }
    if (!Number.isSafeInteger(item.size) || item.size < 0) {
      throw new Error("O servidor informou um tamanho de arquivo inválido.");
    }
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(item.modified_at)) {
      throw new Error("O servidor informou uma data sem fuso horário.");
    }
    const modificadoEm = new Date(item.modified_at);
    if (Number.isNaN(modificadoEm.getTime())) {
      throw new Error("O servidor informou uma data de modificação inválida.");
    }
    return {
      nome: item.name,
      caminhoNoServidor: item.path,
      tamanhoEmBytes: item.size,
      modificadoEm,
    };
  }

  async removerArquivoDoProcesso(
    idDaOrdem: string,
    tipo: TipoProcessoProducao,
    caminhoNoServidor: string,
  ): Promise<void> {
    this.exigirArquivoDentroDoProcesso(idDaOrdem, tipo, caminhoNoServidor);
    // Além do prefixo, a listagem confirma que o alvo ainda existe e é um arquivo,
    // impedindo que este método encaminhe um diretório ao endpoint destrutivo.
    await this.obterMetadadosDoArquivo(caminhoNoServidor);
    await this.enviarFormulario("/api/delete", () => {
      const formulario = new FormData();
      formulario.set("path", caminhoNoServidor);
      return formulario;
    });
  }

  async enviarImagemDaEtiquetaDoMaterial(idDoMaterial: string, arquivo: File): Promise<string> {
    const resposta = await this.enviarUpload(this.caminhoDoMaterial(idDoMaterial), arquivo);
    return resposta.saved_as;
  }

  async removerDiretorioDoMaterial(idDoMaterial: string): Promise<void> {
    await this.enviarFormulario("/api/delete", () => {
      const formulario = new FormData();
      formulario.set("path", this.caminhoDoMaterial(idDoMaterial));
      return formulario;
    });
  }

  async baixarArquivo(
    caminho: string,
    atualizarProgresso?: (porcentagem: number) => void,
  ): Promise<Blob> {
    const resposta = await this.enviarRequisicaoComFormulario("/api/download", () => {
      const formulario = new FormData();
      formulario.set("path", caminho);
      return formulario;
    });
    const tamanho = Number(resposta.headers.get("Content-Length") ?? 0);
    if (!tamanho) return resposta.blob();
    const leitor = resposta.body?.getReader();
    if (!leitor) return resposta.blob();
    const partes: BlobPart[] = [];
    let recebidos = 0;
    atualizarProgresso?.(0);
    while (true) {
      const { value, done } = await leitor.read();
      if (done) break;
      partes.push(value);
      recebidos += value.byteLength;
      atualizarProgresso?.(Math.min(100, Math.round((recebidos / tamanho) * 100)));
    }
    atualizarProgresso?.(100);
    return new Blob(partes, {
      type: resposta.headers.get("Content-Type") ?? "application/octet-stream",
    });
  }

  async lerTexto(caminho: string): Promise<string> {
    return (await this.baixarArquivo(caminho)).text();
  }

  async acrescentarRegistro(caminho: string, linha: string): Promise<void> {
    await this.enviarFormulario("/api/append", () => {
      const formulario = new FormData();
      formulario.set("path", caminho);
      formulario.set("content", linha);
      return formulario;
    });
  }

  async removerDiretorioDaOrdem(idDaOrdem: string): Promise<void> {
    await this.enviarFormulario("/api/delete", () => {
      const formulario = new FormData();
      formulario.set("path", this.caminhoDaOrdem(idDaOrdem));
      return formulario;
    });
  }

  abrirCertificado(): void {
    window.open(`${enderecoBaseDoServidor()}/docs`, "_blank", "noopener,noreferrer");
  }
}
