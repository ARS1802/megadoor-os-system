import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { Timestamp, doc, setDoc, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let ambiente: RulesTestEnvironment;

function perfil(cargo: string) {
  return { nome: cargo, email: `${cargo.toLowerCase()}@teste.local`, cargo, ativo: true };
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

describe("regras do Firestore", () => {
  it("permite que Designer crie Candidato e impede Maquinista", async () => {
    const designer = ambiente.authenticatedContext("designer").firestore();
    const maquinista = ambiente.authenticatedContext("maquinista").firestore();
    await assertSucceeds(setDoc(doc(designer, "candidatos", "permitido"), { nome: "Ana" }));
    await assertFails(setDoc(doc(maquinista, "candidatos", "negado"), { nome: "Bia" }));
  });

  it("permite produção para Maquinista, Designer e Administrador", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      await setDoc(doc(contexto.firestore(), "ordens-de-servico", "os"), {
        status: "EM_PRODUCAO",
      });
      await setDoc(doc(contexto.firestore(), "ordens-de-servico", "os", "processos", "impressao"), {
        unidadesProduzidas: 0,
        metaDeUnidades: 10,
      });
    });
    const caminho = ["ordens-de-servico", "os", "processos", "impressao"];
    await assertSucceeds(
      updateDoc(doc(ambiente.authenticatedContext("maquinista").firestore(), ...caminho), {
        unidadesProduzidas: 1,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(ambiente.authenticatedContext("admin").firestore(), ...caminho), {
        unidadesProduzidas: 2,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(ambiente.authenticatedContext("designer").firestore(), ...caminho), {
        unidadesProduzidas: 3,
      }),
    );
    await assertFails(
      updateDoc(doc(ambiente.authenticatedContext("maquinista").firestore(), ...caminho), {
        unidadesProduzidas: -1,
      }),
    );
    await assertFails(
      updateDoc(doc(ambiente.authenticatedContext("maquinista").firestore(), ...caminho), {
        metaDeUnidades: 999,
      }),
    );
  });

  it("bloqueia acréscimos na meta, permite remoção e bloqueia qualquer ajuste após concluir", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      await setDoc(doc(banco, "ordens-de-servico", "os-meta"), {
        status: "EM_PRODUCAO",
      });
      await setDoc(doc(banco, "ordens-de-servico", "os-meta", "processos", "impressao"), {
        unidadesProduzidas: 9,
        metaDeUnidades: 10,
      });
    });

    const bancoMaquinista = ambiente.authenticatedContext("maquinista").firestore();
    const processo = doc(bancoMaquinista, "ordens-de-servico", "os-meta", "processos", "impressao");

    await assertSucceeds(updateDoc(processo, { unidadesProduzidas: 10 }));
    await assertFails(updateDoc(processo, { unidadesProduzidas: 11 }));
    await assertSucceeds(updateDoc(processo, { unidadesProduzidas: 8 }));

    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      await updateDoc(doc(contexto.firestore(), "ordens-de-servico", "os-meta"), {
        status: "CONCLUIDA",
      });
    });

    await assertFails(updateDoc(processo, { unidadesProduzidas: 9 }));
    await assertFails(updateDoc(processo, { unidadesProduzidas: 7 }));
  });

  it("restringe o reupload a Designer e Admin sem permitir mudanças nos contadores", async () => {
    const modificadoAntes = Timestamp.fromDate(new Date("2026-08-12T12:00:00Z"));
    const modificadoDepois = Timestamp.fromDate(new Date("2026-08-12T12:05:00Z"));
    const arquivoAnterior = {
      nomeOriginal: "original.pdf",
      extensao: ".pdf",
      tamanhoEmBytes: 100,
      caminhoNoServidor: "ordens-de-servico/os-reupload/impressao/original.pdf",
      modificadoEm: modificadoAntes,
    };

    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      for (const id of ["os-reupload", "os-reupload-admin", "os-reupload-maquinista"]) {
        await setDoc(doc(banco, "ordens-de-servico", id), { status: "EM_PRODUCAO" });
        await setDoc(doc(banco, "ordens-de-servico", id, "processos", "impressao"), {
          tipo: "IMPRESSAO",
          arquivo: {
            ...arquivoAnterior,
            caminhoNoServidor: `ordens-de-servico/${id}/impressao/original.pdf`,
          },
          unidadesProduzidas: 7,
          metaDeUnidades: 10,
          atualizadoEm: modificadoAntes,
        });
      }
    });

    function arquivoNovo(idDaOrdem: string) {
      return {
        nomeOriginal: "corrigido.pdf",
        extensao: ".pdf",
        tamanhoEmBytes: 120,
        caminhoNoServidor: `ordens-de-servico/${idDaOrdem}/impressao/corrigido.pdf`,
        modificadoEm: modificadoDepois,
      };
    }

    const designer = ambiente.authenticatedContext("designer").firestore();
    const admin = ambiente.authenticatedContext("admin").firestore();
    const maquinista = ambiente.authenticatedContext("maquinista").firestore();
    await assertSucceeds(
      updateDoc(doc(designer, "ordens-de-servico", "os-reupload", "processos", "impressao"), {
        arquivo: arquivoNovo("os-reupload"),
        atualizadoEm: modificadoDepois,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(admin, "ordens-de-servico", "os-reupload-admin", "processos", "impressao"), {
        arquivo: arquivoNovo("os-reupload-admin"),
        atualizadoEm: modificadoDepois,
      }),
    );
    await assertFails(
      updateDoc(
        doc(maquinista, "ordens-de-servico", "os-reupload-maquinista", "processos", "impressao"),
        { arquivo: arquivoNovo("os-reupload-maquinista"), atualizadoEm: modificadoDepois },
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
        atualizadoEm: modificadoDepois,
      }),
    );
  });

  it("rejeita reupload concluído, extensão inválida e caminho fora da OS", async () => {
    const antes = Timestamp.fromDate(new Date("2026-08-12T12:00:00Z"));
    const depois = Timestamp.fromDate(new Date("2026-08-12T12:05:00Z"));
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      for (const [id, status] of [
        ["os-concluida", "CONCLUIDA"],
        ["os-extensao", "EM_PRODUCAO"],
        ["os-caminho", "EM_PRODUCAO"],
      ]) {
        await setDoc(doc(banco, "ordens-de-servico", id), { status });
        await setDoc(doc(banco, "ordens-de-servico", id, "processos", "impressao"), {
          tipo: "IMPRESSAO",
          arquivo: {
            nomeOriginal: "original.pdf",
            extensao: ".pdf",
            tamanhoEmBytes: 100,
            caminhoNoServidor: `ordens-de-servico/${id}/impressao/original.pdf`,
            modificadoEm: antes,
          },
          unidadesProduzidas: 0,
          metaDeUnidades: 10,
          atualizadoEm: antes,
        });
      }
    });

    const designer = ambiente.authenticatedContext("designer").firestore();
    const base = {
      nomeOriginal: "corrigido.exe",
      extensao: ".exe",
      tamanhoEmBytes: 120,
      modificadoEm: depois,
    };
    await assertFails(
      updateDoc(doc(designer, "ordens-de-servico", "os-concluida", "processos", "impressao"), {
        arquivo: {
          ...base,
          nomeOriginal: "corrigido.pdf",
          extensao: ".pdf",
          caminhoNoServidor: "ordens-de-servico/os-concluida/impressao/corrigido.pdf",
        },
        atualizadoEm: depois,
      }),
    );
    await assertFails(
      updateDoc(doc(designer, "ordens-de-servico", "os-extensao", "processos", "impressao"), {
        arquivo: {
          ...base,
          caminhoNoServidor: "ordens-de-servico/os-extensao/impressao/corrigido.exe",
        },
        atualizadoEm: depois,
      }),
    );
    await assertFails(
      updateDoc(doc(designer, "ordens-de-servico", "os-caminho", "processos", "impressao"), {
        arquivo: {
          ...base,
          nomeOriginal: "corrigido.pdf",
          extensao: ".pdf",
          caminhoNoServidor: "ordens-de-servico/outra-os/impressao/corrigido.pdf",
        },
        atualizadoEm: depois,
      }),
    );
  });

  it("aceita o primeiro reupload de documento legado sem inventar sua modificação", async () => {
    const depois = Timestamp.fromDate(new Date("2026-08-12T12:05:00Z"));
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      await setDoc(doc(banco, "ordens-de-servico", "os-legada"), { status: "PRONTA" });
      await setDoc(doc(banco, "ordens-de-servico", "os-legada", "processos", "corte"), {
        tipo: "CORTE",
        arquivo: {
          nomeOriginal: "original.plt",
          extensao: ".plt",
          tamanhoEmBytes: 100,
          caminhoNoServidor: "ordens-de-servico/os-legada/corte/original.plt",
        },
        unidadesProduzidas: 0,
        metaDeUnidades: 10,
        atualizadoEm: depois,
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
          modificadoEm: depois,
        },
        atualizadoEm: depois,
      }),
    );
  });

  it("permite registrar operações idempotentes dos três cargos operadores", async () => {
    for (const usuarioId of ["admin", "designer", "maquinista"]) {
      const banco = ambiente.authenticatedContext(usuarioId).firestore();
      await assertSucceeds(
        setDoc(doc(banco, "operacoes-idempotentes", `operacao-${usuarioId}`), {
          referenciaUsuario: doc(banco, "usuarios", usuarioId),
        }),
      );
    }
  });

  it("permite que Maquinista registre produção sem editar campos arbitrários da OS", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      await setDoc(doc(banco, "ordens-de-servico", "os-producao"), {
        status: "PRONTA",
        tiposDeProcessos: ["IMPRESSAO"],
        tiragem: 1,
      });
      await setDoc(doc(banco, "ordens-de-servico", "os-producao", "processos", "impressao"), {
        unidadesProduzidas: 0,
        metaDeUnidades: 10,
      });
    });

    const banco = ambiente.authenticatedContext("maquinista").firestore();
    const ordem = doc(banco, "ordens-de-servico", "os-producao");
    const processo = doc(ordem, "processos", "impressao");
    const lote = writeBatch(banco);
    lote.update(processo, {
      unidadesProduzidas: 1,
      ultimaAtividadeEm: "agora",
      referenciaUltimoUsuario: doc(banco, "usuarios", "maquinista"),
      atualizadoEm: "agora",
    });
    lote.update(ordem, {
      status: "EM_PRODUCAO",
      ultimaAtividadeEm: "agora",
      atualizadaEm: "agora",
    });

    await assertSucceeds(lote.commit());
    await assertFails(updateDoc(ordem, { tiragem: 2 }));
    await assertFails(updateDoc(ordem, { status: "PRONTA", atualizadaEm: "depois" }));
  });

  it("permite ao Designer concluir normalmente somente quando todos os processos atingem a meta", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      await setDoc(doc(banco, "ordens-de-servico", "os-normal"), {
        status: "EM_PRODUCAO",
        tiposDeProcessos: ["IMPRESSAO", "CORTE"],
      });
      await setDoc(doc(banco, "ordens-de-servico", "os-normal", "processos", "impressao"), {
        unidadesProduzidas: 9,
        metaDeUnidades: 10,
      });
      await setDoc(doc(banco, "ordens-de-servico", "os-normal", "processos", "corte"), {
        unidadesProduzidas: 10,
        metaDeUnidades: 10,
      });
    });

    const banco = ambiente.authenticatedContext("designer").firestore();
    const ordem = doc(banco, "ordens-de-servico", "os-normal");
    const referenciaUsuario = doc(banco, "usuarios", "designer");
    const conclusaoNormal = {
      status: "CONCLUIDA",
      ultimaAtividadeEm: "agora",
      dadosDeConclusao: {
        concluidaEm: "agora",
        referenciaUsuarioResponsavel: referenciaUsuario,
        foiForcada: false,
      },
      metragemQuadradaCalculada: 12,
      quantidadeRolosCalculada: 1,
      atualizadaEm: "agora",
    };

    await assertFails(updateDoc(ordem, conclusaoNormal));

    const lote = writeBatch(banco);
    lote.update(doc(ordem, "processos", "impressao"), {
      unidadesProduzidas: 10,
      ultimaAtividadeEm: "agora",
      referenciaUltimoUsuario: referenciaUsuario,
      atualizadoEm: "agora",
    });
    lote.update(ordem, conclusaoNormal);
    await assertSucceeds(lote.commit());
  });

  it("reserva a conclusão forçada ao Administrador e exige justificativa", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      for (const id of ["os-admin", "os-maquinista", "os-designer", "os-sem-motivo"]) {
        await setDoc(doc(banco, "ordens-de-servico", id), {
          status: "EM_PRODUCAO",
          tiposDeProcessos: ["IMPRESSAO"],
        });
        await setDoc(doc(banco, "ordens-de-servico", id, "processos", "impressao"), {
          unidadesProduzidas: 2,
          metaDeUnidades: 10,
        });
      }
    });

    function conclusaoForcadaPara(usuarioId: string, banco: Firestore, justificativa: string) {
      return {
        status: "CONCLUIDA",
        dadosDeConclusao: {
          concluidaEm: "agora",
          referenciaUsuarioResponsavel: doc(banco, "usuarios", usuarioId),
          foiForcada: true,
          justificativa,
        },
        metragemQuadradaCalculada: 12,
        quantidadeRolosCalculada: 1,
        atualizadaEm: "agora",
      };
    }

    const bancoAdmin = ambiente.authenticatedContext("admin").firestore();
    const bancoMaquinista = ambiente.authenticatedContext("maquinista").firestore();
    const bancoDesigner = ambiente.authenticatedContext("designer").firestore();

    await assertSucceeds(
      updateDoc(
        doc(bancoAdmin, "ordens-de-servico", "os-admin"),
        conclusaoForcadaPara("admin", bancoAdmin, "Encerramento autorizado"),
      ),
    );
    await assertFails(
      updateDoc(
        doc(bancoMaquinista, "ordens-de-servico", "os-maquinista"),
        conclusaoForcadaPara("maquinista", bancoMaquinista, "Tentativa indevida"),
      ),
    );
    await assertFails(
      updateDoc(
        doc(bancoDesigner, "ordens-de-servico", "os-designer"),
        conclusaoForcadaPara("designer", bancoDesigner, "Tentativa indevida"),
      ),
    );
    await assertFails(
      updateDoc(
        doc(bancoAdmin, "ordens-de-servico", "os-sem-motivo"),
        conclusaoForcadaPara("admin", bancoAdmin, ""),
      ),
    );
  });

  it("permite que qualquer usuário ativo marque uma OS como Parada sem editar outros campos", async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      for (const id of ["os-designer", "os-admin", "os-maquinista"]) {
        await setDoc(doc(banco, "ordens-de-servico", id), {
          status: "EM_PRODUCAO",
          atualizadaEm: "antes",
          tiragem: 1,
        });
      }
    });
    const referenciaDesigner = doc(
      ambiente.authenticatedContext("designer").firestore(),
      "ordens-de-servico",
      "os-designer",
    );
    const referenciaAdmin = doc(
      ambiente.authenticatedContext("admin").firestore(),
      "ordens-de-servico",
      "os-admin",
    );
    const referenciaMaquinista = doc(
      ambiente.authenticatedContext("maquinista").firestore(),
      "ordens-de-servico",
      "os-maquinista",
    );
    await assertSucceeds(
      updateDoc(referenciaDesigner, { status: "PARADA", atualizadaEm: "agora" }),
    );
    await assertSucceeds(updateDoc(referenciaAdmin, { status: "PARADA", atualizadaEm: "agora" }));
    await assertSucceeds(
      updateDoc(referenciaMaquinista, { status: "PARADA", atualizadaEm: "agora" }),
    );
    await assertFails(updateDoc(referenciaDesigner, { tiragem: 2 }));
  });

  it("permite o cadastro do próprio perfil e bloqueia acesso anônimo", async () => {
    const novoAdmin = ambiente.authenticatedContext("novo-admin").firestore();
    await assertSucceeds(setDoc(doc(novoAdmin, "usuarios", "novo-admin"), perfil("ADMIN")));
    const anonimo = ambiente.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonimo, "usuarios", "anonimo"), perfil("MAQUINISTA")));
  });
});
