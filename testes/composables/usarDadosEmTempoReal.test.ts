import type { DocumentReference } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Candidato } from "@/dominio/entidades/Candidato";
import { Material } from "@/dominio/entidades/Material";
import { OrdemDeServico } from "@/dominio/entidades/OrdemDeServico";
import { ProcessoDeProducao } from "@/dominio/entidades/ProcessoDeProducao";
import { StatusOrdemDeServico, TipoProcessoProducao } from "@/dominio/enumeracoes";
import {
  DimensoesDaUnidade,
  DimensoesDoRolo,
  EspecificacaoDeGrade,
} from "@/dominio/objetosDeValor";

function referencia(colecao: string, id: string): DocumentReference {
  return { id, path: `${colecao}/${id}` } as DocumentReference;
}

function candidato(nome = "Candidato Inicial"): Candidato {
  return new Candidato({
    id: "candidato-1",
    nome,
    referenciaUsuarioCriador: referencia("usuarios", "designer-1"),
  });
}

function material(nome = "Material Inicial"): Material {
  return new Material({
    id: "material-1",
    nome,
    marca: "Marca",
    dimensoesDoRolo: new DimensoesDoRolo(106, 5_000_000),
    referenciaUsuarioCriador: referencia("usuarios", "designer-1"),
  });
}

function processo(tipo: TipoProcessoProducao, unidadesProduzidas = 0): ProcessoDeProducao {
  const extensao = tipo === TipoProcessoProducao.IMPRESSAO ? ".pdf" : ".plt";
  return new ProcessoDeProducao({
    tipo,
    arquivo: {
      nomeOriginal: `${tipo.toLocaleLowerCase("pt-BR")}${extensao}`,
      extensao,
      tamanhoEmBytes: 100,
      caminhoNoServidor: `ordens-de-servico/os-1/${tipo.toLocaleLowerCase("pt-BR")}/arquivo${extensao}`,
    },
    unidadesProduzidas,
    metaDeUnidades: 100,
  });
}

function ordem(): OrdemDeServico {
  return new OrdemDeServico({
    id: "os-1",
    referenciaCandidato: referencia("candidatos", "candidato-1"),
    referenciaMaterial: referencia("materiais", "material-1"),
    referenciaUsuarioCriador: referencia("usuarios", "designer-1"),
    tiragem: 1,
    quantidadeTotal: 100,
    dimensoesDaUnidade: new DimensoesDaUnidade(10, 20),
    especificacaoDeGrade: new EspecificacaoDeGrade(100, 200, 10),
    tiposDeProcessos: [TipoProcessoProducao.IMPRESSAO, TipoProcessoProducao.CORTE],
    status: StatusOrdemDeServico.PRONTA,
    caminhoRegistro: "ordens-de-servico/os-1/registro.txt",
    caminhoObservacao: "ordens-de-servico/os-1/observacao.txt",
  });
}

interface AmbienteControlado {
  observarCandidatos(candidatos: Candidato[]): void;
  observarMateriais(materiais: Material[]): void;
  observarOrdens(ordens: OrdemDeServico[]): void;
  observarProcessos(processos: ProcessoDeProducao[]): void;
  falharOrdens(erro: Error): void;
  encerrarSessao(): void;
  cancelamentos: ReturnType<typeof vi.fn>[];
  leiturasRelacionadas: ReturnType<typeof vi.fn>[];
}

async function prepararAmbiente(): Promise<AmbienteControlado> {
  const candidatoInicial = candidato();
  const materialInicial = material();
  const ordemInicial = ordem();
  const processosIniciais = [
    processo(TipoProcessoProducao.CORTE),
    processo(TipoProcessoProducao.IMPRESSAO),
  ];
  const cancelamentos = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];

  let atualizarCandidatos = (_itens: Candidato[]) => undefined;
  let atualizarMateriais = (_itens: Material[]) => undefined;
  let atualizarOrdens = (_itens: OrdemDeServico[]) => undefined;
  let atualizarProcessos = (_itens: ProcessoDeProducao[]) => undefined;
  let aoFalharOrdens = (_erro: Error) => undefined;
  let aoEncerrarSessao = () => undefined;

  const repositorioDeCandidatos = {
    listarAtivos: vi.fn().mockResolvedValue([candidatoInicial]),
    obterPorReferencia: vi.fn().mockResolvedValue(candidatoInicial),
    observarAtivos: vi.fn((atualizar: typeof atualizarCandidatos) => {
      atualizarCandidatos = atualizar;
      return cancelamentos[0];
    }),
  };
  const repositorioDeMateriais = {
    listarAtivos: vi.fn().mockResolvedValue([materialInicial]),
    obterPorReferencia: vi.fn().mockResolvedValue(materialInicial),
    observarAtivos: vi.fn((atualizar: typeof atualizarMateriais) => {
      atualizarMateriais = atualizar;
      return cancelamentos[1];
    }),
  };
  const repositorioDeOrdens = {
    listar: vi.fn().mockResolvedValue([ordemInicial]),
    listarProcessos: vi.fn().mockResolvedValue(processosIniciais),
    marcarComoParadaSeInativa: vi.fn().mockResolvedValue(false),
    observarLista: vi.fn((atualizar: typeof atualizarOrdens, aoFalhar?: (erro: Error) => void) => {
      atualizarOrdens = atualizar;
      aoFalharOrdens = aoFalhar ?? aoFalharOrdens;
      return cancelamentos[2];
    }),
    observarProcessos: vi.fn(
      (_id: string, atualizar: typeof atualizarProcessos, _aoFalhar?: (erro: Error) => void) => {
        atualizarProcessos = atualizar;
        return cancelamentos[3];
      },
    ),
  };

  vi.doMock("@/infraestrutura/firebase/configuracaoFirebase", () => ({
    firebaseEstaConfigurado: true,
    obterBancoDeDados: vi.fn(),
  }));
  vi.doMock("@/infraestrutura/servicosDaAplicacao", () => ({
    repositorioDeCandidatos,
    repositorioDeMateriais,
    repositorioDeOrdens,
  }));
  vi.doMock("@/composables/usarSessao", () => ({
    observarFimDaSessao: vi.fn((observar: () => void) => {
      aoEncerrarSessao = observar;
      return vi.fn();
    }),
  }));

  return {
    observarCandidatos: (itens) => atualizarCandidatos(itens),
    observarMateriais: (itens) => atualizarMateriais(itens),
    observarOrdens: (itens) => atualizarOrdens(itens),
    observarProcessos: (itens) => atualizarProcessos(itens),
    falharOrdens: (erro) => aoFalharOrdens(erro),
    encerrarSessao: () => aoEncerrarSessao(),
    cancelamentos,
    leiturasRelacionadas: [
      repositorioDeCandidatos.obterPorReferencia,
      repositorioDeMateriais.obterPorReferencia,
      repositorioDeOrdens.listarProcessos,
    ],
  };
}

describe("usarDados em modo Firestore", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sincroniza cadastros e processos e preserva a ordem dos processos da OS", async () => {
    const ambiente = await prepararAmbiente();
    const { usarDados } = await import("@/composables/usarDados");
    const dados = usarDados();

    await dados.carregar();

    expect(dados.ordens.value[0]?.processos.map((item) => item.tipo)).toEqual([
      TipoProcessoProducao.IMPRESSAO,
      TipoProcessoProducao.CORTE,
    ]);

    ambiente.observarCandidatos([candidato("Candidato Atualizado")]);
    ambiente.observarMateriais([material("Material Atualizado")]);
    ambiente.observarProcessos([
      processo(TipoProcessoProducao.CORTE, 20),
      processo(TipoProcessoProducao.IMPRESSAO, 30),
    ]);

    expect(dados.candidatos.value[0]?.nome).toBe("Candidato Atualizado");
    expect(dados.materiais.value[0]?.nome).toBe("Material Atualizado");
    expect(dados.ordens.value[0]).toMatchObject({
      nomeDoCandidato: "Candidato Atualizado",
      nomeDoMaterial: "Material Atualizado",
    });
    expect(dados.ordens.value[0]?.processos.map((item) => item.unidadesProduzidas)).toEqual([
      30, 20,
    ]);

    const ordemAtualizada = ordem();
    Object.assign(ordemAtualizada, { status: StatusOrdemDeServico.EM_PRODUCAO });
    ambiente.observarOrdens([ordemAtualizada]);
    await vi.waitFor(() =>
      expect(dados.ordens.value[0]?.status).toBe(StatusOrdemDeServico.EM_PRODUCAO),
    );
    // Uma alteração da OS não deve reler candidato, material e todos os processos.
    // Os listeners próprios já mantêm essas três relações sincronizadas.
    ambiente.leiturasRelacionadas.forEach((leitura) => expect(leitura).toHaveBeenCalledOnce());

    const ordemConcluida = ordem();
    Object.assign(ordemConcluida, { status: StatusOrdemDeServico.CONCLUIDA });
    ambiente.observarOrdens([ordemConcluida]);
    await vi.waitFor(() =>
      expect(dados.ordens.value[0]?.status).toBe(StatusOrdemDeServico.CONCLUIDA),
    );
    // O listener continua ativo porque o snapshot final dos processos pode
    // chegar depois do snapshot que marcou a OS como concluída.
    expect(ambiente.cancelamentos[3]).not.toHaveBeenCalled();
    ambiente.observarProcessos([
      processo(TipoProcessoProducao.CORTE, 100),
      processo(TipoProcessoProducao.IMPRESSAO, 100),
    ]);
    expect(dados.ordens.value[0]?.processos.map((item) => item.unidadesProduzidas)).toEqual([
      100, 100,
    ]);

    ambiente.observarOrdens([]);
    await vi.waitFor(() => expect(ambiente.cancelamentos[3]).toHaveBeenCalledOnce());
  });

  it("cancela todos os listeners e remove dados reais ao encerrar a sessão", async () => {
    const ambiente = await prepararAmbiente();
    const { usarDados } = await import("@/composables/usarDados");
    const dados = usarDados();
    await dados.carregar();

    ambiente.encerrarSessao();

    expect(ambiente.cancelamentos).toHaveLength(4);
    ambiente.cancelamentos.forEach((cancelar) => expect(cancelar).toHaveBeenCalledOnce());
    expect(dados.ordens.value).toEqual([]);
    expect(dados.candidatos.value).toEqual([]);
    expect(dados.materiais.value).toEqual([]);
    expect(dados.estado.value).toBe("INICIAL");

    // Eventos já enfileirados pelo SDK antes do unsubscribe não podem
    // repovoar a sessão encerrada nem trocar seu estado para ERRO.
    ambiente.observarCandidatos([candidato("Evento atrasado")]);
    ambiente.observarMateriais([material("Evento atrasado")]);
    ambiente.observarProcessos([processo(TipoProcessoProducao.IMPRESSAO, 99)]);
    ambiente.falharOrdens(new Error("erro atrasado"));
    expect(dados.candidatos.value).toEqual([]);
    expect(dados.materiais.value).toEqual([]);
    expect(dados.estado.value).toBe("INICIAL");
  });

  it("interrompe os demais listeners e expõe erro quando a observação falha", async () => {
    const ambiente = await prepararAmbiente();
    const { usarDados } = await import("@/composables/usarDados");
    const dados = usarDados();
    await dados.carregar();

    ambiente.falharOrdens(new Error("permissão revogada"));

    ambiente.cancelamentos.forEach((cancelar) => expect(cancelar).toHaveBeenCalledOnce());
    expect(dados.estado.value).toBe("ERRO");
    expect(dados.erro.value?.message).toBe("permissão revogada");
    expect(dados.ordens.value).toEqual([]);
  });
});
