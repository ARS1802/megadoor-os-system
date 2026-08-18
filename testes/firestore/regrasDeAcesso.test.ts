import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let ambiente: RulesTestEnvironment;

const instante = (minutos = 0) =>
  Timestamp.fromDate(new Date(Date.UTC(2026, 7, 12, 12, minutos, 0)));

function perfil(cargo: string) {
  return {
    nome: cargo,
    email: `${cargo.toLowerCase()}@teste.local`,
    cargo,
    ativo: true,
    referenciasOrdensParticipadas: [],
    criadoEm: instante(),
    atualizadoEm: instante(),
  };
}

function candidatoValido(banco: Firestore, alteracoes: Record<string, unknown> = {}) {
  return {
    nome: "Ana Candidata",
    nomeNormalizado: "ana candidata",
    partido: "Partido Teste",
    documentoFiscal: { tipo: "CNPJ", numero: "12.345.678/0001-90" },
    observacoes: "Cadastro válido",
    ativo: true,
    referenciaUsuarioCriador: doc(banco, "usuarios", "designer"),
    criadoEm: instante(),
    atualizadoEm: instante(),
    ...alteracoes,
  };
}

function materialValido(banco: Firestore, alteracoes: Record<string, unknown> = {}) {
  return {
    nome: "Adesivo Branco",
    nomeNormalizado: "adesivo branco",
    marca: "Megadoor",
    dimensoesDoRolo: {
      larguraEmCentimetros: 106,
      comprimentoEmCentimetros: 5_000_000,
    },
    gramatura: 120,
    caminhoImagemEtiqueta: "materiais/material-1/etiqueta.png",
    rolosUtilizados: 0,
    referenciasOrdensDeServico: [],
    referenciaUsuarioCriador: doc(banco, "usuarios", "designer"),
    criadoEm: instante(),
    atualizadoEm: instante(),
    ...alteracoes,
  };
}

function ordemValida(banco: Firestore, id: string, alteracoes: Record<string, unknown> = {}) {
  return {
    referenciaCandidato: doc(banco, "candidatos", "candidato-1"),
    referenciaMaterial: doc(banco, "materiais", "material-1"),
    referenciaUsuarioCriador: doc(banco, "usuarios", "designer"),
    tiragem: 1,
    quantidadeTotal: 10,
    dimensoesDaUnidade: {
      larguraEmCentimetros: 10,
      alturaEmCentimetros: 20,
    },
    especificacaoDeGrade: {
      larguraEmCentimetros: 100,
      alturaEmCentimetros: 200,
      unidadesPorGrade: 5,
    },
    tiposDeProcessos: ["IMPRESSAO"],
    status: "PRONTA",
    ultimaAtividadeEm: null,
    caminhoRegistro: `ordens-de-servico/${id}/registro.txt`,
    registroMaisRecente: "",
    caminhoObservacao: `ordens-de-servico/${id}/observacao.txt`,
    criadaEm: instante(),
    atualizadaEm: instante(),
    ...alteracoes,
  };
}

function arquivoValido(idDaOrdem: string, processoId: string) {
  const extensao = processoId === "impressao" ? ".pdf" : ".plt";
  const nome = `arte${extensao}`;
  return {
    nomeOriginal: nome,
    extensao,
    tamanhoEmBytes: 100,
    caminhoNoServidor: `ordens-de-servico/${idDaOrdem}/${processoId}/${nome}`,
    modificadoEm: instante(),
  };
}

function processoValido(
  idDaOrdem: string,
  processoId: "impressao" | "plotagem" | "corte" = "impressao",
  alteracoes: Record<string, unknown> = {},
) {
  const tipos = { impressao: "IMPRESSAO", plotagem: "PLOTAGEM", corte: "CORTE" } as const;
  return {
    tipo: tipos[processoId],
    arquivo: arquivoValido(idDaOrdem, processoId),
    unidadesProduzidas: 0,
    metaDeUnidades: 10,
    ultimaAtividadeEm: null,
    referenciaUltimoUsuario: null,
    criadoEm: instante(),
    atualizadoEm: instante(),
    ...alteracoes,
  };
}

function operacaoValida(banco: Firestore, usuarioId: string) {
  return {
    referenciaOrdemDeServico: doc(banco, "ordens-de-servico", "os-operacao"),
    referenciaUsuario: doc(banco, "usuarios", usuarioId),
    tipoProcesso: "IMPRESSAO",
    sincronizacaoDoRegistro: "PENDENTE",
    criadaEm: instante(),
    expiraEm: Timestamp.fromDate(new Date(Date.UTC(2026, 8, 11, 12, 0, 0))),
  };
}

function ajusteDeProducao(
  banco: Firestore,
  usuarioId: string,
  unidadesProduzidas: number,
  minutos = 5,
) {
  return {
    unidadesProduzidas,
    ultimaAtividadeEm: instante(minutos),
    referenciaUltimoUsuario: doc(banco, "usuarios", usuarioId),
    atualizadoEm: instante(minutos),
  };
}

async function prepararUsuarios(): Promise<void> {
  await ambiente.withSecurityRulesDisabled(async (contexto) => {
    const banco = contexto.firestore();
    await Promise.all([
      setDoc(doc(banco, "usuarios", "admin"), perfil("ADMIN")),
      setDoc(doc(banco, "usuarios", "designer"), perfil("DESIGNER")),
      setDoc(doc(banco, "usuarios", "maquinista"), perfil("MAQUINISTA")),
    ]);
  });
}

beforeAll(async () => {
  ambiente = await initializeTestEnvironment({
    projectId: "demo-megadoor",
    firestore: {
      rules: readFileSync(fileURLToPath(new URL("../../firestore.rules", import.meta.url)), "utf8"),
    },
  });
});

beforeEach(async () => {
  await ambiente.clearFirestore();
  await prepararUsuarios();
});

afterAll(async () => ambiente.cleanup());

describe("regras estruturais do Firestore", () => {
  it("permite Candidato válido ao Designer e rejeita cargo ou estrutura inválidos", async () => {
    const designer = ambiente.authenticatedContext("designer").firestore();
    const maquinista = ambiente.authenticatedContext("maquinista").firestore();

    await assertSucceeds(
      setDoc(doc(designer, "candidatos", "permitido"), candidatoValido(designer)),
    );
    await assertFails(setDoc(doc(maquinista, "candidatos", "negado"), candidatoValido(maquinista)));
    await assertFails(setDoc(doc(designer, "candidatos", "incompleto"), { nome: "Ana" }));
    await assertFails(
      setDoc(doc(designer, "candidatos", "campo-extra"), {
        ...candidatoValido(designer),
        campoLegado: true,
      }),
    );
  });

  it("valida Material e a reserva de seu nome normalizado", async () => {
    const designer = ambiente.authenticatedContext("designer").firestore();
    const referenciaMaterial = doc(designer, "materiais", "material-1");

    await assertSucceeds(setDoc(referenciaMaterial, materialValido(designer)));
    await assertFails(
      setDoc(doc(designer, "materiais", "sem-marca"), materialValido(designer, { marca: "" })),
    );
    await assertFails(
      setDoc(
        doc(designer, "materiais", "com-rolos-na-criacao"),
        materialValido(designer, { rolosUtilizados: 1 }),
      ),
    );
    await assertFails(
      setDoc(doc(designer, "materiais", "campo-indevido"), {
        ...materialValido(designer),
        ativo: true,
      }),
    );
    await assertSucceeds(
      setDoc(doc(designer, "nomes-de-materiais", "adesivo-branco"), {
        nomeNormalizado: "adesivo branco",
        referenciaMaterial,
        criadoEm: instante(),
      }),
    );
    await assertFails(
      setDoc(doc(designer, "nomes-de-materiais", "reserva-invalida"), {
        referenciaMaterial,
      }),
    );
  });

  it("permite somente ao Administrador recalcular rolos sem alterar o catálogo", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      await setDoc(doc(banco, "materiais", "material-recalculo"), materialValido(banco));
    });
    const admin = ambiente.authenticatedContext("admin").firestore();
    const designer = ambiente.authenticatedContext("designer").firestore();
    await assertSucceeds(
      updateDoc(doc(admin, "materiais", "material-recalculo"), {
        rolosUtilizados: 2,
        atualizadoEm: instante(5),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(designer, "materiais", "material-recalculo"), {
        marca: "Marca atualizada",
        atualizadoEm: instante(6),
      }),
    );
    await assertFails(
      updateDoc(doc(designer, "materiais", "material-recalculo"), {
        rolosUtilizados: 3,
        atualizadoEm: instante(7),
      }),
    );
    await assertFails(
      updateDoc(doc(admin, "materiais", "material-recalculo"), {
        rolosUtilizados: 3,
        marca: "Alteração simultânea",
        atualizadoEm: instante(8),
      }),
    );
  });

  it("aceita OS e processo completos e rejeita mapas incompatíveis", async () => {
    const designer = ambiente.authenticatedContext("designer").firestore();
    const ordem = doc(designer, "ordens-de-servico", "os-criacao");

    await assertSucceeds(setDoc(ordem, ordemValida(designer, "os-criacao")));
    await assertSucceeds(
      setDoc(doc(ordem, "processos", "impressao"), processoValido("os-criacao")),
    );
    await assertFails(
      setDoc(
        doc(designer, "ordens-de-servico", "os-invalida"),
        ordemValida(designer, "os-invalida", { tiragem: 0 }),
      ),
    );
    await assertFails(
      setDoc(doc(ordem, "processos", "corte"), {
        ...processoValido("os-criacao", "corte"),
        tipo: "IMPRESSAO",
      }),
    );
    await assertFails(
      setDoc(doc(ordem, "processos", "corte"), processoValido("os-criacao", "corte")),
    );
    await assertFails(
      setDoc(doc(designer, "ordens-de-servico", ".*"), ordemValida(designer, "outra-os")),
    );
  });

  it("exige que a OS seja criada no estado inicial e sem campos derivados", async () => {
    const designer = ambiente.authenticatedContext("designer").firestore();

    for (const [id, alteracoes] of [
      ["os-em-producao", { status: "EM_PRODUCAO" }],
      ["os-com-atividade", { ultimaAtividadeEm: instante(5) }],
      [
        "os-com-registro",
        {
          registroMaisRecente: "[2026-08-12T12:05:00.000Z] | USUARIO=designer | UNIDADES=+1",
        },
      ],
      ["os-com-metragem", { metragemQuadradaCalculada: 4 }],
      ["os-com-rolos", { quantidadeRolosCalculada: 1 }],
      [
        "os-concluida-na-criacao",
        {
          status: "CONCLUIDA",
          dadosDeConclusao: {
            concluidaEm: instante(5),
            referenciaUsuarioResponsavel: doc(designer, "usuarios", "designer"),
            foiForcada: false,
          },
        },
      ],
    ] as const) {
      await assertFails(
        setDoc(doc(designer, "ordens-de-servico", id), ordemValida(designer, id, alteracoes)),
      );
    }
  });

  it("exige contador zerado, meta da OS e atividade nula ao criar um processo", async () => {
    const designer = ambiente.authenticatedContext("designer").firestore();
    const ordem = doc(designer, "ordens-de-servico", "os-processo-inicial");
    await assertSucceeds(setDoc(ordem, ordemValida(designer, "os-processo-inicial")));

    await assertFails(
      setDoc(
        doc(ordem, "processos", "impressao"),
        processoValido("os-processo-inicial", "impressao", { unidadesProduzidas: 1 }),
      ),
    );
    await assertFails(
      setDoc(
        doc(ordem, "processos", "impressao"),
        processoValido("os-processo-inicial", "impressao", { metaDeUnidades: 9 }),
      ),
    );
    await assertFails(
      setDoc(
        doc(ordem, "processos", "impressao"),
        processoValido("os-processo-inicial", "impressao", {
          ultimaAtividadeEm: instante(5),
        }),
      ),
    );
    await assertFails(
      setDoc(
        doc(ordem, "processos", "impressao"),
        processoValido("os-processo-inicial", "impressao", {
          referenciaUltimoUsuario: doc(designer, "usuarios", "designer"),
        }),
      ),
    );
  });

  it("permite criar a OS e seus processos no mesmo lote atômico", async () => {
    const designer = ambiente.authenticatedContext("designer").firestore();
    const ordem = doc(designer, "ordens-de-servico", "os-lote");
    const lote = writeBatch(designer);
    lote.set(ordem, ordemValida(designer, "os-lote"));
    lote.set(doc(ordem, "processos", "impressao"), processoValido("os-lote"));
    await assertSucceeds(lote.commit());
  });

  it("permite o cadastro válido do próprio perfil e bloqueia estrutura ou acesso anônimo", async () => {
    const novoAdmin = ambiente.authenticatedContext("novo-admin").firestore();
    await assertSucceeds(setDoc(doc(novoAdmin, "usuarios", "novo-admin"), perfil("ADMIN")));
    await assertSucceeds(getDoc(doc(novoAdmin, "usuarios", "novo-admin")));
    const designer = ambiente.authenticatedContext("designer").firestore();
    await assertSucceeds(getDoc(doc(designer, "usuarios", "designer")));
    await assertFails(
      setDoc(doc(novoAdmin, "usuarios", "perfil-incompleto"), {
        nome: "Novo",
        email: "novo@teste.local",
        cargo: "ADMIN",
        ativo: true,
      }),
    );
    const anonimo = ambiente.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonimo, "usuarios", "anonimo"), perfil("MAQUINISTA")));
  });

  it("valida o documento completo de cada operação idempotente", async () => {
    for (const usuarioId of ["admin", "designer", "maquinista"]) {
      const banco = ambiente.authenticatedContext(usuarioId).firestore();
      await assertSucceeds(
        setDoc(
          doc(banco, "operacoes-idempotentes", `operacao-${usuarioId}`),
          operacaoValida(banco, usuarioId),
        ),
      );
    }

    const maquinista = ambiente.authenticatedContext("maquinista").firestore();
    await assertSucceeds(
      getDoc(doc(maquinista, "operacoes-idempotentes", "operacao-ainda-inexistente")),
    );
    await assertFails(getDoc(doc(maquinista, "operacoes-idempotentes", "operacao-designer")));
    await assertFails(
      setDoc(doc(maquinista, "operacoes-idempotentes", "incompleta"), {
        referenciaUsuario: doc(maquinista, "usuarios", "maquinista"),
      }),
    );
    await assertFails(
      setDoc(doc(maquinista, "operacoes-idempotentes", "expiracao-invalida"), {
        ...operacaoValida(maquinista, "maquinista"),
        expiraEm: "amanhã",
      }),
    );
    await assertFails(
      setDoc(doc(maquinista, "operacoes-idempotentes", "usuario-alheio"), {
        ...operacaoValida(maquinista, "designer"),
      }),
    );
  });

  it("permite somente ao dono confirmar o append de uma operação idempotente", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      await setDoc(
        doc(banco, "operacoes-idempotentes", "operacao-confirmacao"),
        operacaoValida(banco, "maquinista"),
      );
    });

    const maquinista = ambiente.authenticatedContext("maquinista").firestore();
    const designer = ambiente.authenticatedContext("designer").firestore();
    const caminho = ["operacoes-idempotentes", "operacao-confirmacao"] as const;
    await assertSucceeds(
      updateDoc(doc(maquinista, ...caminho), { sincronizacaoDoRegistro: "CONCLUIDA" }),
    );
    await assertFails(
      updateDoc(doc(designer, ...caminho), { sincronizacaoDoRegistro: "PENDENTE" }),
    );
    await assertFails(
      updateDoc(doc(maquinista, ...caminho), { sincronizacaoDoRegistro: "PENDENTE" }),
    );
    await assertFails(updateDoc(doc(maquinista, ...caminho), { tipoProcesso: "CORTE" }));
    await assertFails(updateDoc(doc(maquinista, ...caminho), { campoDesconhecido: true }));
  });
});

describe("regras operacionais do Firestore", () => {
  it("permite produção para Maquinista, Designer e Administrador", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      for (const usuarioId of ["maquinista", "admin", "designer"]) {
        const id = `os-${usuarioId}`;
        await setDoc(
          doc(banco, "ordens-de-servico", id),
          ordemValida(banco, id, { status: "EM_PRODUCAO" }),
        );
        await setDoc(
          doc(banco, "ordens-de-servico", id, "processos", "impressao"),
          processoValido(id),
        );
      }
    });

    for (const [usuarioId, unidades] of [
      ["maquinista", 1],
      ["admin", 2],
      ["designer", 3],
    ] as const) {
      const banco = ambiente.authenticatedContext(usuarioId).firestore();
      const ordem = doc(banco, "ordens-de-servico", `os-${usuarioId}`);
      const lote = writeBatch(banco);
      lote.update(
        doc(ordem, "processos", "impressao"),
        ajusteDeProducao(banco, usuarioId, unidades),
      );
      lote.update(ordem, {
        status: "EM_PRODUCAO",
        ultimaAtividadeEm: instante(5),
        atualizadaEm: instante(5),
      });
      await assertSucceeds(lote.commit());
    }

    const maquinista = ambiente.authenticatedContext("maquinista").firestore();
    const caminho = ["ordens-de-servico", "os-maquinista", "processos", "impressao"];
    await assertFails(
      updateDoc(doc(maquinista, ...caminho), ajusteDeProducao(maquinista, "maquinista", 2)),
    );
    await assertFails(
      updateDoc(doc(maquinista, ...caminho), ajusteDeProducao(maquinista, "maquinista", 2, 10)),
    );
    await assertFails(
      updateDoc(doc(maquinista, ...caminho), ajusteDeProducao(maquinista, "maquinista", -1)),
    );
    await assertFails(
      updateDoc(doc(ambiente.authenticatedContext("maquinista").firestore(), ...caminho), {
        metaDeUnidades: 999,
      }),
    );
  });

  it("exige conclusão atômica ao atingir a última meta e bloqueia ajuste após concluir", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      await setDoc(
        doc(banco, "ordens-de-servico", "os-meta"),
        ordemValida(banco, "os-meta", { status: "EM_PRODUCAO" }),
      );
      await setDoc(
        doc(banco, "ordens-de-servico", "os-meta", "processos", "impressao"),
        processoValido("os-meta", "impressao", { unidadesProduzidas: 9 }),
      );
    });

    const banco = ambiente.authenticatedContext("maquinista").firestore();
    const ordem = doc(banco, "ordens-de-servico", "os-meta");
    const processo = doc(banco, "ordens-de-servico", "os-meta", "processos", "impressao");
    await assertFails(updateDoc(processo, ajusteDeProducao(banco, "maquinista", 10)));
    await assertFails(updateDoc(processo, ajusteDeProducao(banco, "maquinista", 11)));
    const loteRemocao = writeBatch(banco);
    loteRemocao.update(processo, ajusteDeProducao(banco, "maquinista", 8));
    loteRemocao.update(ordem, {
      status: "EM_PRODUCAO",
      ultimaAtividadeEm: instante(5),
      atualizadaEm: instante(5),
    });
    await assertSucceeds(loteRemocao.commit());

    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      await updateDoc(doc(contexto.firestore(), "ordens-de-servico", "os-meta"), {
        status: "CONCLUIDA",
      });
    });
    await assertFails(updateDoc(processo, ajusteDeProducao(banco, "maquinista", 9)));
    await assertFails(updateDoc(processo, ajusteDeProducao(banco, "maquinista", 7)));
  });

  it("permite atingir a meta de uma etapa quando ainda há outro processo pendente", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      await setDoc(
        doc(banco, "ordens-de-servico", "os-duas-etapas"),
        ordemValida(banco, "os-duas-etapas", {
          status: "EM_PRODUCAO",
          tiposDeProcessos: ["IMPRESSAO", "CORTE"],
        }),
      );
      await setDoc(
        doc(banco, "ordens-de-servico", "os-duas-etapas", "processos", "impressao"),
        processoValido("os-duas-etapas", "impressao", { unidadesProduzidas: 9 }),
      );
      await setDoc(
        doc(banco, "ordens-de-servico", "os-duas-etapas", "processos", "corte"),
        processoValido("os-duas-etapas", "corte", { unidadesProduzidas: 2 }),
      );
    });

    const banco = ambiente.authenticatedContext("designer").firestore();
    const ordem = doc(banco, "ordens-de-servico", "os-duas-etapas");
    const lote = writeBatch(banco);
    lote.update(doc(ordem, "processos", "impressao"), ajusteDeProducao(banco, "designer", 10));
    lote.update(ordem, {
      status: "EM_PRODUCAO",
      ultimaAtividadeEm: instante(5),
      atualizadaEm: instante(5),
    });
    await assertSucceeds(lote.commit());
  });

  it("restringe o reupload a Designer e Admin sem permitir mudanças nos contadores", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      for (const id of ["os-reupload", "os-reupload-admin", "os-reupload-maquinista"]) {
        await setDoc(
          doc(banco, "ordens-de-servico", id),
          ordemValida(banco, id, { status: "EM_PRODUCAO" }),
        );
        await setDoc(
          doc(banco, "ordens-de-servico", id, "processos", "impressao"),
          processoValido(id, "impressao", { unidadesProduzidas: 7 }),
        );
      }
    });

    function arquivoNovo(idDaOrdem: string) {
      return {
        nomeOriginal: "corrigido.pdf",
        extensao: ".pdf",
        tamanhoEmBytes: 120,
        caminhoNoServidor: `ordens-de-servico/${idDaOrdem}/impressao/corrigido.pdf`,
        modificadoEm: instante(5),
      };
    }

    const designer = ambiente.authenticatedContext("designer").firestore();
    const admin = ambiente.authenticatedContext("admin").firestore();
    const maquinista = ambiente.authenticatedContext("maquinista").firestore();
    await assertSucceeds(
      updateDoc(doc(designer, "ordens-de-servico", "os-reupload", "processos", "impressao"), {
        arquivo: arquivoNovo("os-reupload"),
        atualizadoEm: instante(5),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(admin, "ordens-de-servico", "os-reupload-admin", "processos", "impressao"), {
        arquivo: arquivoNovo("os-reupload-admin"),
        atualizadoEm: instante(5),
      }),
    );
    await assertFails(
      updateDoc(
        doc(maquinista, "ordens-de-servico", "os-reupload-maquinista", "processos", "impressao"),
        { arquivo: arquivoNovo("os-reupload-maquinista"), atualizadoEm: instante(5) },
      ),
    );
    await assertFails(
      updateDoc(doc(admin, "ordens-de-servico", "os-reupload", "processos", "impressao"), {
        arquivo: {
          ...arquivoNovo("os-reupload"),
          nomeOriginal: "outra-correcao.pdf",
          caminhoNoServidor: "ordens-de-servico/os-reupload/impressao/outra-correcao.pdf",
        },
        unidadesProduzidas: 8,
        atualizadoEm: instante(5),
      }),
    );
  });

  it("rejeita reupload concluído, extensão inválida e caminho fora da OS", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      for (const [id, status] of [
        ["os-concluida", "CONCLUIDA"],
        ["os-extensao", "EM_PRODUCAO"],
        ["os-caminho", "EM_PRODUCAO"],
      ]) {
        await setDoc(doc(banco, "ordens-de-servico", id), ordemValida(banco, id, { status }));
        await setDoc(
          doc(banco, "ordens-de-servico", id, "processos", "impressao"),
          processoValido(id),
        );
      }
    });

    const designer = ambiente.authenticatedContext("designer").firestore();
    await assertFails(
      updateDoc(doc(designer, "ordens-de-servico", "os-concluida", "processos", "impressao"), {
        arquivo: {
          nomeOriginal: "corrigido.pdf",
          extensao: ".pdf",
          tamanhoEmBytes: 120,
          caminhoNoServidor: "ordens-de-servico/os-concluida/impressao/corrigido.pdf",
          modificadoEm: instante(5),
        },
        atualizadoEm: instante(5),
      }),
    );
    await assertFails(
      updateDoc(doc(designer, "ordens-de-servico", "os-extensao", "processos", "impressao"), {
        arquivo: {
          nomeOriginal: "corrigido.exe",
          extensao: ".exe",
          tamanhoEmBytes: 120,
          caminhoNoServidor: "ordens-de-servico/os-extensao/impressao/corrigido.exe",
          modificadoEm: instante(5),
        },
        atualizadoEm: instante(5),
      }),
    );
    await assertFails(
      updateDoc(doc(designer, "ordens-de-servico", "os-caminho", "processos", "impressao"), {
        arquivo: {
          nomeOriginal: "corrigido.pdf",
          extensao: ".pdf",
          tamanhoEmBytes: 120,
          caminhoNoServidor: "ordens-de-servico/outra-os/impressao/corrigido.pdf",
          modificadoEm: instante(5),
        },
        atualizadoEm: instante(5),
      }),
    );
  });

  it("aceita o primeiro reupload de arquivo legado sem modificadoEm", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      await setDoc(
        doc(banco, "ordens-de-servico", "os-legada"),
        ordemValida(banco, "os-legada", { tiposDeProcessos: ["CORTE"] }),
      );
      const processo = processoValido("os-legada", "corte");
      const { modificadoEm: _ignorado, ...arquivoLegado } = processo.arquivo;
      await setDoc(doc(banco, "ordens-de-servico", "os-legada", "processos", "corte"), {
        ...processo,
        arquivo: arquivoLegado,
      });
    });

    const designer = ambiente.authenticatedContext("designer").firestore();
    await assertSucceeds(
      updateDoc(doc(designer, "ordens-de-servico", "os-legada", "processos", "corte"), {
        arquivo: {
          nomeOriginal: "corrigido.plt",
          extensao: ".plt",
          tamanhoEmBytes: 120,
          caminhoNoServidor: "ordens-de-servico/os-legada/corte/corrigido.plt",
          modificadoEm: instante(5),
        },
        atualizadoEm: instante(5),
      }),
    );
  });

  it("registra produção sem permitir campos arbitrários da OS", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      await setDoc(
        doc(banco, "ordens-de-servico", "os-producao"),
        ordemValida(banco, "os-producao"),
      );
      await setDoc(
        doc(banco, "ordens-de-servico", "os-producao", "processos", "impressao"),
        processoValido("os-producao"),
      );
    });

    const banco = ambiente.authenticatedContext("maquinista").firestore();
    const ordem = doc(banco, "ordens-de-servico", "os-producao");
    const processo = doc(ordem, "processos", "impressao");
    const lote = writeBatch(banco);
    lote.update(processo, {
      unidadesProduzidas: 1,
      ultimaAtividadeEm: instante(5),
      referenciaUltimoUsuario: doc(banco, "usuarios", "maquinista"),
      atualizadoEm: instante(5),
    });
    lote.update(ordem, {
      status: "EM_PRODUCAO",
      ultimaAtividadeEm: instante(5),
      atualizadaEm: instante(5),
    });

    await assertSucceeds(lote.commit());
    await assertFails(updateDoc(ordem, { tiragem: 2 }));
    await assertFails(updateDoc(ordem, { status: "PRONTA", atualizadaEm: instante(10) }));
    await assertFails(updateDoc(processo, { atualizadoEm: "agora" }));
  });

  it("conclui normalmente somente quando todos os processos atingem a meta", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      await setDoc(
        doc(banco, "ordens-de-servico", "os-normal"),
        ordemValida(banco, "os-normal", {
          status: "EM_PRODUCAO",
          tiposDeProcessos: ["IMPRESSAO", "CORTE"],
        }),
      );
      await setDoc(
        doc(banco, "ordens-de-servico", "os-normal", "processos", "impressao"),
        processoValido("os-normal", "impressao", { unidadesProduzidas: 9 }),
      );
      await setDoc(
        doc(banco, "ordens-de-servico", "os-normal", "processos", "corte"),
        processoValido("os-normal", "corte", { unidadesProduzidas: 10 }),
      );
    });

    const banco = ambiente.authenticatedContext("designer").firestore();
    const ordem = doc(banco, "ordens-de-servico", "os-normal");
    const referenciaUsuario = doc(banco, "usuarios", "designer");
    const conclusaoNormal = {
      status: "CONCLUIDA",
      ultimaAtividadeEm: instante(5),
      dadosDeConclusao: {
        concluidaEm: instante(5),
        referenciaUsuarioResponsavel: referenciaUsuario,
        foiForcada: false,
      },
      atualizadaEm: instante(5),
    };

    await assertFails(updateDoc(ordem, conclusaoNormal));
    const lote = writeBatch(banco);
    lote.update(doc(ordem, "processos", "impressao"), {
      // A última grade pode ultrapassar a meta. A regra bloqueia novas
      // adições depois disso, mas preserva a semântica do domínio que
      // considera o processo concluído quando unidades >= meta.
      unidadesProduzidas: 11,
      ultimaAtividadeEm: instante(5),
      referenciaUltimoUsuario: referenciaUsuario,
      atualizadoEm: instante(5),
    });
    lote.update(ordem, conclusaoNormal);
    await assertSucceeds(lote.commit());
  });

  it("reserva a conclusão forçada ao Administrador e exige justificativa", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      for (const id of ["os-admin", "os-maquinista", "os-designer", "os-sem-motivo"]) {
        await setDoc(
          doc(banco, "ordens-de-servico", id),
          ordemValida(banco, id, { status: "EM_PRODUCAO" }),
        );
        await setDoc(
          doc(banco, "ordens-de-servico", id, "processos", "impressao"),
          processoValido(id, "impressao", { unidadesProduzidas: 2 }),
        );
      }
    });

    function conclusaoForcadaPara(usuarioId: string, banco: Firestore, justificativa: string) {
      return {
        status: "CONCLUIDA",
        dadosDeConclusao: {
          concluidaEm: instante(5),
          referenciaUsuarioResponsavel: doc(banco, "usuarios", usuarioId),
          foiForcada: true,
          justificativa,
        },
        atualizadaEm: instante(5),
      };
    }

    const admin = ambiente.authenticatedContext("admin").firestore();
    const maquinista = ambiente.authenticatedContext("maquinista").firestore();
    const designer = ambiente.authenticatedContext("designer").firestore();
    await assertSucceeds(
      updateDoc(
        doc(admin, "ordens-de-servico", "os-admin"),
        conclusaoForcadaPara("admin", admin, "Encerramento autorizado"),
      ),
    );
    await assertFails(
      updateDoc(
        doc(maquinista, "ordens-de-servico", "os-maquinista"),
        conclusaoForcadaPara("maquinista", maquinista, "Tentativa indevida"),
      ),
    );
    await assertFails(
      updateDoc(
        doc(designer, "ordens-de-servico", "os-designer"),
        conclusaoForcadaPara("designer", designer, "Tentativa indevida"),
      ),
    );
    await assertFails(
      updateDoc(
        doc(admin, "ordens-de-servico", "os-sem-motivo"),
        conclusaoForcadaPara("admin", admin, ""),
      ),
    );
  });

  it("permite aos três cargos marcar a OS como Parada sem editar outros campos", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      for (const id of ["os-designer", "os-admin", "os-maquinista"]) {
        await setDoc(
          doc(banco, "ordens-de-servico", id),
          ordemValida(banco, id, {
            status: "EM_PRODUCAO",
            ultimaAtividadeEm: instante(),
          }),
        );
      }
      await setDoc(
        doc(banco, "ordens-de-servico", "os-recente"),
        ordemValida(banco, "os-recente", {
          status: "EM_PRODUCAO",
          ultimaAtividadeEm: Timestamp.now(),
        }),
      );
    });

    for (const usuarioId of ["designer", "admin", "maquinista"]) {
      const banco = ambiente.authenticatedContext(usuarioId).firestore();
      await assertSucceeds(
        updateDoc(doc(banco, "ordens-de-servico", `os-${usuarioId}`), {
          status: "PARADA",
          atualizadaEm: instante(5),
        }),
      );
    }
    const designer = ambiente.authenticatedContext("designer").firestore();
    await assertFails(
      updateDoc(doc(designer, "ordens-de-servico", "os-recente"), {
        status: "PARADA",
        atualizadaEm: Timestamp.now(),
      }),
    );
    await assertFails(updateDoc(doc(designer, "ordens-de-servico", "os-designer"), { tiragem: 2 }));
  });

  it("permite aos operadores atualizar somente o registro recente, inclusive em OS concluída", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      for (const id of ["os-registro-admin", "os-registro-designer", "os-registro-maquinista"]) {
        await setDoc(
          doc(banco, "ordens-de-servico", id),
          ordemValida(banco, id, { status: "CONCLUIDA" }),
        );
      }
      const legada = ordemValida(banco, "os-registro-legado");
      delete (legada as { registroMaisRecente?: string }).registroMaisRecente;
      await setDoc(doc(banco, "ordens-de-servico", "os-registro-legado"), legada);
    });

    for (const usuarioId of ["admin", "designer", "maquinista"]) {
      const banco = ambiente.authenticatedContext(usuarioId).firestore();
      await assertSucceeds(
        updateDoc(doc(banco, "ordens-de-servico", `os-registro-${usuarioId}`), {
          registroMaisRecente: `[2026-08-12T12:05:00.000Z] | USUARIO=${usuarioId}`,
        }),
      );
    }

    const designer = ambiente.authenticatedContext("designer").firestore();
    await assertSucceeds(
      updateDoc(doc(designer, "ordens-de-servico", "os-registro-legado"), {
        registroMaisRecente: "[2026-08-12T12:05:00.000Z] | USUARIO=designer",
      }),
    );
    await assertFails(
      updateDoc(doc(designer, "ordens-de-servico", "os-registro-designer"), {
        registroMaisRecente: "",
      }),
    );
    await assertFails(
      updateDoc(doc(designer, "ordens-de-servico", "os-registro-designer"), {
        registroMaisRecente: "[2026-08-12T12:06:00.000Z] | USUARIO=designer",
        tiragem: 2,
      }),
    );
  });
});
