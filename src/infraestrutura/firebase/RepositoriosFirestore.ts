import {
  Timestamp,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  where,
  type DocumentReference,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  EntradaAjusteProducao,
  EntradaSubstituicaoArquivoDoProcesso,
  RepositorioDeCandidatos,
  RepositorioDeMateriais,
  RepositorioDeOrdensDeServico,
  RepositorioDeUsuarios,
  ResultadoAjusteProducao,
  ResultadoSubstituicaoArquivoDoProcesso,
} from "@/aplicacao/contratos/Repositorios";
import { Candidato } from "@/dominio/entidades/Candidato";
import { Material } from "@/dominio/entidades/Material";
import { OrdemDeServico } from "@/dominio/entidades/OrdemDeServico";
import { ProcessoDeProducao } from "@/dominio/entidades/ProcessoDeProducao";
import { Usuario } from "@/dominio/entidades/Usuario";
import {
  StatusOrdemDeServico,
  StatusSincronizacaoRegistro,
  type TipoProcessoProducao,
} from "@/dominio/enumeracoes";
import { calcularVariacaoEmUnidades } from "@/dominio/servicos/producao";
import { criarChaveDoNomeNormalizado } from "@/dominio/servicos/normalizacao";
import { COLECOES } from "@/infraestrutura/firebase/colecoes";
import { obterBancoDeDados } from "@/infraestrutura/firebase/configuracaoFirebase";
import {
  conversorCandidato,
  conversorMaterial,
  conversorOrdemDeServico,
  conversorProcesso,
  conversorUsuario,
} from "@/infraestrutura/firebase/conversores";

export class RepositorioDeUsuariosNoFirestore implements RepositorioDeUsuarios {
  referencia(id: string): DocumentReference {
    return doc(obterBancoDeDados(), COLECOES.USUARIOS, id);
  }

  async salvar(usuario: Usuario): Promise<void> {
    await setDoc(this.referencia(usuario.id).withConverter(conversorUsuario), usuario);
  }

  async obterPorId(id: string): Promise<Usuario | null> {
    const resultado = await getDoc(this.referencia(id).withConverter(conversorUsuario));
    return resultado.exists() ? resultado.data() : null;
  }
}

export class RepositorioDeCandidatosNoFirestore implements RepositorioDeCandidatos {
  gerarReferencia(): DocumentReference {
    return doc(collection(obterBancoDeDados(), COLECOES.CANDIDATOS));
  }

  async criar(candidato: Candidato): Promise<void> {
    await setDoc(
      doc(obterBancoDeDados(), COLECOES.CANDIDATOS, candidato.id).withConverter(conversorCandidato),
      candidato,
    );
  }

  async listarAtivos(): Promise<Candidato[]> {
    return (await getDocs(this.consultaDeAtivos())).docs.map((item) => item.data());
  }

  observarAtivos(
    atualizar: (candidatos: Candidato[]) => void,
    aoFalhar?: (erro: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      this.consultaDeAtivos(),
      (resultado) => atualizar(resultado.docs.map((item) => item.data())),
      (erro) => aoFalhar?.(erro),
    );
  }

  private consultaDeAtivos() {
    return query(
      collection(obterBancoDeDados(), COLECOES.CANDIDATOS).withConverter(conversorCandidato),
      where("ativo", "==", true),
      orderBy("nomeNormalizado"),
    );
  }

  async obterPorReferencia(referencia: DocumentReference): Promise<Candidato | null> {
    const resultado = await getDoc(referencia.withConverter(conversorCandidato));
    return resultado.exists() ? resultado.data() : null;
  }
}

export class RepositorioDeMateriaisNoFirestore implements RepositorioDeMateriais {
  gerarReferencia(): DocumentReference {
    return doc(collection(obterBancoDeDados(), COLECOES.MATERIAIS));
  }

  async criarComNomeUnico(material: Material): Promise<void> {
    const banco = obterBancoDeDados();
    const referenciaMaterial = doc(banco, COLECOES.MATERIAIS, material.id).withConverter(
      conversorMaterial,
    );
    const referenciaReserva = doc(
      banco,
      COLECOES.NOMES_DE_MATERIAIS,
      criarChaveDoNomeNormalizado(material.nomeNormalizado),
    );
    await runTransaction(banco, async (transacao) => {
      if ((await transacao.get(referenciaReserva)).exists())
        throw new Error("Já existe um material com este nome.");
      transacao.set(referenciaMaterial, material);
      transacao.set(referenciaReserva, {
        nomeNormalizado: material.nomeNormalizado,
        referenciaMaterial,
        criadoEm: Timestamp.now(),
      });
    });
  }

  async listarAtivos(): Promise<Material[]> {
    return (await getDocs(this.consultaDisponivel())).docs.map((item) => item.data());
  }

  observarAtivos(
    atualizar: (materiais: Material[]) => void,
    aoFalhar?: (erro: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      this.consultaDisponivel(),
      (resultado) => atualizar(resultado.docs.map((item) => item.data())),
      (erro) => aoFalhar?.(erro),
    );
  }

  private consultaDisponivel() {
    return query(
      collection(obterBancoDeDados(), COLECOES.MATERIAIS).withConverter(conversorMaterial),
      orderBy("nomeNormalizado"),
    );
  }

  async obterPorReferencia(referencia: DocumentReference): Promise<Material | null> {
    const resultado = await getDoc(referencia.withConverter(conversorMaterial));
    return resultado.exists() ? resultado.data() : null;
  }
}

export class RepositorioDeOrdensNoFirestore implements RepositorioDeOrdensDeServico {
  gerarIdentificador(): string {
    return doc(collection(obterBancoDeDados(), COLECOES.ORDENS_DE_SERVICO)).id;
  }

  private referenciaOrdem(id: string) {
    return doc(obterBancoDeDados(), COLECOES.ORDENS_DE_SERVICO, id).withConverter(
      conversorOrdemDeServico,
    );
  }

  private referenciaProcesso(id: string, tipo: TipoProcessoProducao) {
    return doc(
      obterBancoDeDados(),
      COLECOES.ORDENS_DE_SERVICO,
      id,
      COLECOES.PROCESSOS,
      tipo.toLowerCase(),
    ).withConverter(conversorProcesso);
  }

  async criarComRelacionamentos(
    ordem: OrdemDeServico,
    processos: ProcessoDeProducao[],
  ): Promise<void> {
    const banco = obterBancoDeDados();
    await runTransaction(banco, async (transacao) => {
      transacao.set(this.referenciaOrdem(ordem.id), ordem);
      processos.forEach((processo) =>
        transacao.set(this.referenciaProcesso(ordem.id, processo.tipo), processo),
      );
      transacao.update(ordem.referenciaMaterial, {
        referenciasOrdensDeServico: arrayUnion(this.referenciaOrdem(ordem.id)),
      });
    });
  }

  async obterPorId(id: string): Promise<OrdemDeServico | null> {
    const resultado = await getDoc(this.referenciaOrdem(id));
    return resultado.exists() ? resultado.data() : null;
  }

  async listar(): Promise<OrdemDeServico[]> {
    const consulta = query(
      collection(obterBancoDeDados(), COLECOES.ORDENS_DE_SERVICO).withConverter(
        conversorOrdemDeServico,
      ),
      orderBy("criadaEm", "desc"),
    );
    return (await getDocs(consulta)).docs.map((item) => item.data());
  }

  observarLista(atualizar: (ordens: OrdemDeServico[]) => void, aoFalhar?: (erro: Error) => void) {
    const consulta = query(
      collection(obterBancoDeDados(), COLECOES.ORDENS_DE_SERVICO).withConverter(
        conversorOrdemDeServico,
      ),
      orderBy("criadaEm", "desc"),
    );
    return onSnapshot(
      consulta,
      (resultado) => atualizar(resultado.docs.map((item) => item.data())),
      (erro) => aoFalhar?.(erro),
    );
  }

  async listarProcessos(idDaOrdem: string): Promise<ProcessoDeProducao[]> {
    const referencia = collection(
      obterBancoDeDados(),
      COLECOES.ORDENS_DE_SERVICO,
      idDaOrdem,
      COLECOES.PROCESSOS,
    ).withConverter(conversorProcesso);
    return (await getDocs(referencia)).docs.map((item) => item.data());
  }

  observarProcessos(
    idDaOrdem: string,
    atualizar: (processos: ProcessoDeProducao[]) => void,
    aoFalhar?: (erro: Error) => void,
  ): Unsubscribe {
    const referencia = collection(
      obterBancoDeDados(),
      COLECOES.ORDENS_DE_SERVICO,
      idDaOrdem,
      COLECOES.PROCESSOS,
    ).withConverter(conversorProcesso);
    return onSnapshot(
      referencia,
      (resultado) => atualizar(resultado.docs.map((item) => item.data())),
      (erro) => aoFalhar?.(erro),
    );
  }

  observarOrdem(
    id: string,
    atualizar: (ordem: OrdemDeServico | null) => void,
    aoFalhar?: (erro: Error) => void,
  ) {
    return onSnapshot(
      this.referenciaOrdem(id),
      (resultado) => atualizar(resultado.exists() ? resultado.data() : null),
      (erro) => aoFalhar?.(erro),
    );
  }

  observarProcesso(
    id: string,
    tipo: TipoProcessoProducao,
    atualizar: (processo: ProcessoDeProducao | null) => void,
    aoFalhar?: (erro: Error) => void,
  ) {
    return onSnapshot(
      this.referenciaProcesso(id, tipo),
      (resultado) => atualizar(resultado.exists() ? resultado.data() : null),
      (erro) => aoFalhar?.(erro),
    );
  }

  async ajustarProducao(entrada: EntradaAjusteProducao): Promise<ResultadoAjusteProducao> {
    const banco = obterBancoDeDados();
    const referenciaOrdem = this.referenciaOrdem(entrada.idDaOrdem);
    const referenciaProcesso = this.referenciaProcesso(entrada.idDaOrdem, entrada.tipoProcesso);
    const referenciaOperacao = doc(banco, COLECOES.OPERACOES_IDEMPOTENTES, entrada.idDaOperacao);
    return runTransaction(banco, async (transacao) => {
      const [operacao, ordemSnapshot, processoSnapshot] = await Promise.all([
        transacao.get(referenciaOperacao),
        transacao.get(referenciaOrdem),
        transacao.get(referenciaProcesso),
      ]);
      if (operacao.exists())
        return {
          variacaoEmUnidades: 0,
          unidadesProduzidas: processoSnapshot.data()?.unidadesProduzidas ?? 0,
          ordemFoiConcluida: false,
          operacaoJaExistia: true,
        };
      if (!ordemSnapshot.exists() || !processoSnapshot.exists())
        throw new Error("OS ou processo não encontrado.");
      const ordem = ordemSnapshot.data();
      ordem.verificarSeAceitaProducao();
      const processo = processoSnapshot.data();
      const variacao = calcularVariacaoEmUnidades(
        entrada.tipoContador,
        entrada.sentido,
        ordem.especificacaoDeGrade.unidadesPorGrade,
        entrada.quantidadeDoAjuste,
      );
      if (variacao > 0 && processo.unidadesProduzidas >= processo.metaDeUnidades) {
        throw new Error("Este processo já atingiu 100%. Não é possível adicionar mais produção.");
      }
      const unidades = processo.unidadesProduzidas + variacao;
      if (!Number.isSafeInteger(unidades))
        throw new Error("O total produzido ultrapassa o limite numérico permitido.");
      if (unidades < 0) throw new Error("A produção não pode ficar negativa.");
      const referenciasProcessos = ordem.tiposDeProcessos.map((tipo) =>
        this.referenciaProcesso(ordem.id, tipo),
      );
      const snapshotsProcessos = await Promise.all(
        referenciasProcessos.map((referencia) => transacao.get(referencia)),
      );
      const todosConcluidos = snapshotsProcessos.every((snapshot) => {
        if (!snapshot.exists()) return false;
        return snapshot.ref.path === referenciaProcesso.path
          ? unidades >= snapshot.data().metaDeUnidades
          : snapshot.data().unidadesProduzidas >= snapshot.data().metaDeUnidades;
      });
      const materialSnapshot = todosConcluidos
        ? await transacao.get(ordem.referenciaMaterial.withConverter(conversorMaterial))
        : null;
      if (todosConcluidos && !materialSnapshot?.exists())
        throw new Error("Material não encontrado.");
      const agora = Timestamp.now();
      transacao.update(referenciaProcesso, {
        unidadesProduzidas: unidades,
        ultimaAtividadeEm: agora,
        referenciaUltimoUsuario: entrada.referenciaUsuario,
        atualizadoEm: agora,
      });
      if (todosConcluidos) {
        const material = materialSnapshot!.data();
        const metragem = ordem.calcularMetragemQuadrada();
        const rolos = ordem.calcularQuantidadeDeRolos(material);
        transacao.update(referenciaOrdem, {
          status: StatusOrdemDeServico.CONCLUIDA,
          ultimaAtividadeEm: agora,
          dadosDeConclusao: {
            concluidaEm: agora,
            referenciaUsuarioResponsavel: entrada.referenciaUsuario,
            foiForcada: false,
          },
          metragemQuadradaCalculada: metragem,
          quantidadeRolosCalculada: rolos,
          atualizadaEm: agora,
        });
        transacao.update(ordem.referenciaMaterial, {
          rolosUtilizados: material.rolosUtilizados + rolos,
        });
      } else {
        transacao.update(referenciaOrdem, {
          status: StatusOrdemDeServico.EM_PRODUCAO,
          ultimaAtividadeEm: agora,
          atualizadaEm: agora,
        });
      }
      if (variacao > 0)
        transacao.update(entrada.referenciaUsuario, {
          referenciasOrdensParticipadas: arrayUnion(referenciaOrdem),
        });
      transacao.set(referenciaOperacao, {
        referenciaOrdemDeServico: referenciaOrdem,
        referenciaUsuario: entrada.referenciaUsuario,
        tipoProcesso: entrada.tipoProcesso,
        sincronizacaoDoRegistro: StatusSincronizacaoRegistro.PENDENTE,
        criadaEm: agora,
        expiraEm: Timestamp.fromMillis(agora.toMillis() + 1000 * 60 * 60 * 24 * 30),
      });
      return {
        variacaoEmUnidades: variacao,
        unidadesProduzidas: unidades,
        ordemFoiConcluida: todosConcluidos,
        operacaoJaExistia: false,
      };
    });
  }

  async confirmarSincronizacaoDoRegistro(idDaOperacao: string): Promise<void> {
    const referencia = doc(obterBancoDeDados(), COLECOES.OPERACOES_IDEMPOTENTES, idDaOperacao);
    await runTransaction(obterBancoDeDados(), async (transacao) => {
      const snapshot = await transacao.get(referencia);
      if (!snapshot.exists()) throw new Error("Operação idempotente não encontrada.");
      if (snapshot.data().sincronizacaoDoRegistro === StatusSincronizacaoRegistro.CONCLUIDA) return;
      transacao.update(referencia, {
        sincronizacaoDoRegistro: StatusSincronizacaoRegistro.CONCLUIDA,
      });
    });
  }

  async substituirArquivoDoProcesso(
    entrada: EntradaSubstituicaoArquivoDoProcesso,
  ): Promise<ResultadoSubstituicaoArquivoDoProcesso> {
    const banco = obterBancoDeDados();
    const referenciaOrdem = this.referenciaOrdem(entrada.idDaOrdem);
    const referenciaProcesso = this.referenciaProcesso(entrada.idDaOrdem, entrada.tipoProcesso);

    return runTransaction(banco, async (transacao) => {
      const [ordemSnapshot, processoSnapshot] = await Promise.all([
        transacao.get(referenciaOrdem),
        transacao.get(referenciaProcesso),
      ]);
      if (!ordemSnapshot.exists() || !processoSnapshot.exists()) {
        throw new Error("OS ou processo não encontrado.");
      }
      if (ordemSnapshot.data().status === StatusOrdemDeServico.CONCLUIDA) {
        throw new Error("Não é possível substituir arquivos de uma OS concluída.");
      }

      const arquivoAnterior = processoSnapshot.data().arquivo;
      const arquivoEsperado = entrada.arquivoAnteriorEsperado;
      const modificadoAnterior = arquivoAnterior.modificadoEm?.getTime();
      const modificadoEsperado = arquivoEsperado.modificadoEm?.getTime();
      if (
        arquivoAnterior.caminhoNoServidor !== arquivoEsperado.caminhoNoServidor ||
        (modificadoAnterior !== undefined &&
          modificadoEsperado !== undefined &&
          modificadoAnterior !== modificadoEsperado)
      ) {
        throw new Error(
          "O arquivo foi alterado por outro usuário. Atualize a página antes de tentar novamente.",
        );
      }

      const agora = Timestamp.now();
      transacao.update(referenciaProcesso, {
        arquivo: {
          ...entrada.arquivoNovo,
          modificadoEm: Timestamp.fromDate(entrada.arquivoNovo.modificadoEm),
        },
        atualizadoEm: agora,
      });

      return {
        arquivoAnterior,
        arquivoNovo: entrada.arquivoNovo,
        atualizadoEm: agora.toDate(),
      };
    });
  }

  async forcarConclusao(id: string, administrador: DocumentReference, justificativa: string) {
    if (!justificativa.trim()) throw new Error("Informe a justificativa da conclusão forçada.");
    const banco = obterBancoDeDados();
    const referencia = this.referenciaOrdem(id);
    return runTransaction(banco, async (transacao) => {
      const snapshot = await transacao.get(referencia);
      if (!snapshot.exists()) throw new Error("OS não encontrada.");
      const ordem = snapshot.data();
      if (![StatusOrdemDeServico.EM_PRODUCAO, StatusOrdemDeServico.PARADA].includes(ordem.status))
        throw new Error("O estado atual não permite conclusão forçada.");
      const referenciasProcessos = ordem.tiposDeProcessos.map((tipo) =>
        this.referenciaProcesso(ordem.id, tipo),
      );
      const materialSnapshot = await transacao.get(
        ordem.referenciaMaterial.withConverter(conversorMaterial),
      );
      const processosSnapshots = await Promise.all(
        referenciasProcessos.map((referenciaProcesso) => transacao.get(referenciaProcesso)),
      );
      if (!materialSnapshot.exists()) throw new Error("Material não encontrado.");
      if (processosSnapshots.some((processo) => !processo.exists())) {
        throw new Error("Um dos processos da OS não foi encontrado.");
      }
      const material = materialSnapshot.data();
      const metragem = ordem.calcularMetragemQuadrada();
      const rolos = ordem.calcularQuantidadeDeRolos(material);
      const agora = Timestamp.now();
      transacao.update(referencia, {
        status: StatusOrdemDeServico.CONCLUIDA,
        dadosDeConclusao: {
          concluidaEm: agora,
          referenciaUsuarioResponsavel: administrador,
          foiForcada: true,
          justificativa: justificativa.trim(),
        },
        metragemQuadradaCalculada: metragem,
        quantidadeRolosCalculada: rolos,
        atualizadaEm: agora,
      });
      transacao.update(ordem.referenciaMaterial, {
        rolosUtilizados: material.rolosUtilizados + rolos,
      });
      return {
        processos: processosSnapshots.map((processo) => {
          const dados = processo.data()!;
          return {
            tipoProcesso: dados.tipo,
            unidadesProduzidas: dados.unidadesProduzidas,
            unidadesFaltantes: Math.max(0, dados.metaDeUnidades - dados.unidadesProduzidas),
          };
        }),
      };
    });
  }

  async marcarComoParadaSeInativa(id: string): Promise<boolean> {
    const banco = obterBancoDeDados();
    const referencia = this.referenciaOrdem(id);
    return runTransaction(banco, async (transacao) => {
      const snapshot = await transacao.get(referencia);
      if (!snapshot.exists()) return false;
      const ordem = snapshot.data();
      const umaHora = 60 * 60 * 1000;
      if (
        ordem.status !== StatusOrdemDeServico.EM_PRODUCAO ||
        !ordem.ultimaAtividadeEm ||
        Date.now() - ordem.ultimaAtividadeEm.getTime() < umaHora
      )
        return false;
      transacao.update(referencia, {
        status: StatusOrdemDeServico.PARADA,
        atualizadaEm: Timestamp.now(),
      });
      return true;
    });
  }
}
