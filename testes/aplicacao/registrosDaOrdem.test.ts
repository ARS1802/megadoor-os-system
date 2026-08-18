import type { DocumentReference } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";
import { ForcarConclusaoDaOrdem } from "@/aplicacao/casosDeUso/ForcarConclusaoDaOrdem";
import type { RepositorioDeOrdensDeServico } from "@/aplicacao/contratos/Repositorios";
import type { ServidorDeArquivosDaOrdem } from "@/aplicacao/contratos/ServidorDeArquivosDaOrdem";
import {
  COLUNAS_CSV_DOS_REGISTROS,
  criarLinhaDeConclusaoForcada,
  escolherRegistroMaisRecente,
  gerarCsvDosRegistros,
  interpretarLinhaDeRegistro,
  criarLinhaDeSubstituicaoDeArquivo,
} from "@/aplicacao/servicos/registrosDaOrdem";
import { SentidoDoAjuste, TipoContadorProducao, TipoProcessoProducao } from "@/dominio/enumeracoes";

function interpretarLinhaCsv(linha: string): string[] {
  return [...linha.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map((resultado) =>
    resultado[1].replaceAll('""', '"'),
  );
}

function registrosDoCsv(csv: string): Record<string, string>[] {
  const linhas = csv
    .replace(/^\uFEFF/, "")
    .split("\r\n")
    .map(interpretarLinhaCsv);
  const cabecalho = linhas.shift() ?? [];
  return linhas.map((valores) =>
    Object.fromEntries(cabecalho.map((coluna, indice) => [coluna, valores[indice] ?? ""])),
  );
}

describe("registros da Ordem de Serviço", () => {
  it("preserva o registro mais novo quando respostas concorrentes chegam fora de ordem", () => {
    const antigo = "[2026-08-12T14:30:00.000Z] | USUARIO=Ana | UNIDADES=+1";
    const novo = "[2026-08-12T14:31:00.000Z] | USUARIO=Bia | UNIDADES=+1";

    expect(escolherRegistroMaisRecente("", antigo)).toBe(antigo);
    expect(escolherRegistroMaisRecente(antigo, novo)).toBe(novo);
    expect(escolherRegistroMaisRecente(novo, antigo)).toBe(novo);
    expect(() => escolherRegistroMaisRecente(novo, "sem data")).toThrow("data válida");
  });

  it("interpreta tanto o formato estruturado atual quanto o formato legado", () => {
    const atual = interpretarLinhaDeRegistro(
      "[2026-08-12T14:30:00.000Z] | USUARIO=Ana Lima | PROCESSO=CORTE | UNIDADES=-173",
    );
    expect(atual).toMatchObject({
      dataHora: "2026-08-12T14:30:00.000Z",
      data: "2026-08-12",
      evento: "AJUSTE_PRODUCAO",
      nomeDoUsuario: "Ana Lima",
      processo: TipoProcessoProducao.CORTE,
      sentido: SentidoDoAjuste.REMOVER,
      variacaoEmUnidades: -173,
    });

    const legado = interpretarLinhaDeRegistro(
      "[2026-08-11T08:42:00-03:00] | USUARIO=Arthur | IMPRESSAO | GRADE | +52 UNIDADES",
    );
    expect(legado).toMatchObject({
      nomeDoUsuario: "Arthur",
      processo: TipoProcessoProducao.IMPRESSAO,
      tipoContador: TipoContadorProducao.GRADE,
      sentido: SentidoDoAjuste.ADICIONAR,
      variacaoEmUnidades: 52,
    });
  });

  it("exporta ajustes, conclusão forçada e reupload sem perder seus campos específicos", () => {
    const ajuste =
      '[2026-08-12T14:30:00.000Z] | OPERACAO=ajuste-1 | USUARIO=Ana, "Administradora" | PROCESSO=IMPRESSAO | CONTADOR=GRADE | SENTIDO=ADICIONAR | UNIDADES=+52';
    const conclusao = criarLinhaDeConclusaoForcada({
      dataHora: new Date("2026-08-12T15:00:00.000Z"),
      nomeDoAdministrador: "Bruno",
      justificativa: "Prazo encerrado",
      resultado: {
        processos: [
          {
            tipoProcesso: TipoProcessoProducao.IMPRESSAO,
            unidadesProduzidas: 520,
            unidadesFaltantes: 480,
          },
          {
            tipoProcesso: TipoProcessoProducao.CORTE,
            unidadesProduzidas: 800,
            unidadesFaltantes: 200,
          },
        ],
      },
    });
    const reupload = criarLinhaDeSubstituicaoDeArquivo({
      dataHora: new Date("2026-08-12T15:10:00.000Z"),
      idDaOperacao: "reupload-123",
      nomeDoUsuario: "Carla",
      processo: TipoProcessoProducao.CORTE,
      nomeDoArquivoAnterior: "corte antigo.plt",
      caminhoDoArquivoAnterior: "ordens-de-servico/OS-1/corte/corte-antigo.plt",
      nomeDoArquivoNovo: "corte corrigido.plt",
      caminhoDoArquivoNovo: "ordens-de-servico/OS-1/corte/corte-novo.plt",
    });

    const csv = gerarCsvDosRegistros([ajuste, conclusao, reupload].map(interpretarLinhaDeRegistro));
    const cabecalho = interpretarLinhaCsv(csv.replace(/^\uFEFF/, "").split("\r\n")[0]);
    const [linhaAjuste, linhaConclusao, linhaReupload] = registrosDoCsv(csv);

    expect(cabecalho).toEqual(COLUNAS_CSV_DOS_REGISTROS);
    expect(linhaAjuste).toMatchObject({
      evento: "AJUSTE_PRODUCAO",
      id_da_operacao: "ajuste-1",
      nome_do_usuario: 'Ana, "Administradora"',
      processo: "Impressão",
      tipo_do_contador: "GRADE",
      sentido: "ADICIONAR",
      unidades_adicionadas_ou_removidas: "+52",
    });
    expect(linhaConclusao).toMatchObject({
      evento: "CONCLUSAO_FORCADA",
      nome_do_usuario: "Bruno",
      justificativa: "Prazo encerrado",
      impressao_unidades_produzidas: "520",
      impressao_unidades_faltantes: "480",
      plotagem_unidades_produzidas: "",
      plotagem_unidades_faltantes: "",
      corte_unidades_produzidas: "800",
      corte_unidades_faltantes: "200",
    });
    expect(linhaReupload).toMatchObject({
      evento: "ARQUIVO_SUBSTITUIDO",
      id_da_operacao: "reupload-123",
      nome_do_usuario: "Carla",
      processo: "Corte",
      nome_do_arquivo_anterior: "corte antigo.plt",
      caminho_do_arquivo_anterior: "ordens-de-servico/OS-1/corte/corte-antigo.plt",
      nome_do_arquivo_novo: "corte corrigido.plt",
      caminho_do_arquivo_novo: "ordens-de-servico/OS-1/corte/corte-novo.plt",
      registro_original: reupload,
    });
  });

  it("preserva valores após o primeiro sinal de igual e mantém a linha desconhecida original", () => {
    const original =
      "[2026-08-12T16:00:00.000Z] | EVENTO=EVENTO_LEGADO | USUARIO=Ana | JUSTIFICATIVA=cor=ciano";
    const interpretada = interpretarLinhaDeRegistro(original);
    const [registro] = registrosDoCsv(gerarCsvDosRegistros([interpretada]));

    expect(interpretada.justificativa).toBe("cor=ciano");
    expect(registro).toMatchObject({
      evento: "EVENTO_LEGADO",
      justificativa: "cor=ciano",
      registro_original: original,
    });
  });

  it("acrescenta a conclusão forçada com administrador, justificativa e totais por processo", async () => {
    const resultado = {
      processos: [
        {
          tipoProcesso: TipoProcessoProducao.IMPRESSAO,
          unidadesProduzidas: 520,
          unidadesFaltantes: 480,
        },
        {
          tipoProcesso: TipoProcessoProducao.CORTE,
          unidadesProduzidas: 800,
          unidadesFaltantes: 200,
        },
      ],
    };
    const forcarConclusao = vi.fn().mockResolvedValue(resultado);
    const acrescentarRegistro = vi.fn().mockResolvedValue(undefined);
    const atualizarRegistroMaisRecente = vi.fn().mockResolvedValue(undefined);
    const casoDeUso = new ForcarConclusaoDaOrdem(
      { forcarConclusao, atualizarRegistroMaisRecente } as unknown as RepositorioDeOrdensDeServico,
      {
        verificarConexao: vi.fn().mockResolvedValue(true),
        acrescentarRegistro,
      } as unknown as ServidorDeArquivosDaOrdem,
    );
    const referenciaAdministrador = { id: "admin-1" } as DocumentReference;

    await casoDeUso.executar({
      idDaOrdem: "OS-1",
      referenciaAdministrador,
      nomeDoAdministrador: "Ana Administradora",
      justificativa: "Arquivo aprovado; prazo encerrado",
      caminhoRegistro: "ordens-de-servico/OS-1/registro.txt",
    });

    expect(forcarConclusao).toHaveBeenCalledWith(
      "OS-1",
      referenciaAdministrador,
      "Arquivo aprovado; prazo encerrado",
    );
    expect(acrescentarRegistro).toHaveBeenCalledOnce();
    const [caminho, linha] = acrescentarRegistro.mock.calls[0] as [string, string];
    expect(caminho).toBe("ordens-de-servico/OS-1/registro.txt");
    expect(linha).toContain("EVENTO=CONCLUSAO_FORCADA");
    expect(linha).toContain("USUARIO=Ana Administradora");
    expect(linha).toContain("JUSTIFICATIVA=Arquivo aprovado; prazo encerrado");
    expect(linha).toContain("IMPRESSAO_PRODUZIDAS=520");
    expect(linha).toContain("IMPRESSAO_FALTANTES=480");
    expect(linha).toContain("CORTE_PRODUZIDAS=800");
    expect(linha).toContain("CORTE_FALTANTES=200");
    expect(atualizarRegistroMaisRecente).toHaveBeenCalledWith("OS-1", linha);
  });

  it("estrutura o registro de substituição com operação, usuário e arquivos anterior e novo", () => {
    const linha = criarLinhaDeSubstituicaoDeArquivo({
      dataHora: new Date("2026-08-12T15:10:00.000Z"),
      idDaOperacao: "reupload-123",
      nomeDoUsuario: "Ana | Designer",
      processo: TipoProcessoProducao.IMPRESSAO,
      nomeDoArquivoAnterior: "arte antiga.pdf",
      caminhoDoArquivoAnterior: "ordens-de-servico/OS-1/impressao/arte-antiga.pdf",
      nomeDoArquivoNovo: "arte corrigida.pdf",
      caminhoDoArquivoNovo: "ordens-de-servico/OS-1/impressao/arte--uuid.pdf",
    });

    expect(linha).toContain("EVENTO=ARQUIVO_SUBSTITUIDO");
    expect(linha).toContain("OPERACAO=reupload-123");
    expect(linha).toContain("USUARIO=Ana / Designer");
    expect(linha).toContain("PROCESSO=IMPRESSAO");
    expect(linha).toContain("ARQUIVO_ANTERIOR=arte antiga.pdf");
    expect(linha).toContain("ARQUIVO_NOVO=arte corrigida.pdf");
  });
});
