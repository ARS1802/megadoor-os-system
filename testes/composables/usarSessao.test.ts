import { CargoUsuario } from "@/dominio/enumeracoes";
import { Usuario } from "@/dominio/entidades/Usuario";
import { afterEach, describe, expect, it, vi } from "vitest";

type UsuarioAutenticado = { uid: string } | null;
type AoMudarAutenticacao = (usuario: UsuarioAutenticado) => Promise<void> | void;
type AoFalharAutenticacao = (falha: unknown) => void;

interface AmbienteDaSessao {
  aoMudar: () => AoMudarAutenticacao;
  aoFalhar: () => AoFalharAutenticacao;
  criarUsuario: ReturnType<typeof vi.fn>;
  deletarUsuario: ReturnType<typeof vi.fn>;
  definirIdDoUsuarioParaServidor: ReturnType<typeof vi.fn>;
  obterPerfil: ReturnType<typeof vi.fn>;
  onAuthStateChanged: ReturnType<typeof vi.fn>;
  autenticarUsuario: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  sessao: Awaited<ReturnType<typeof importarSessaoReal>>["sessao"];
  observarFimDaSessao: Awaited<ReturnType<typeof importarSessaoReal>>["observarFimDaSessao"];
  salvarPerfil: ReturnType<typeof vi.fn>;
}

function perfil(id: string, ativo = true): Usuario {
  return new Usuario({
    id,
    nome: `Usuário ${id}`,
    email: `${id}@megadoor.local`,
    cargo: CargoUsuario.DESIGNER,
    ativo,
  });
}

function promessaControlada<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((concluir) => {
    resolver = concluir;
  });
  return { promessa, resolver };
}

async function importarSessaoReal() {
  vi.resetModules();

  let mudarAutenticacao: AoMudarAutenticacao | undefined;
  let falharAutenticacao: AoFalharAutenticacao | undefined;
  const autenticacao = { nome: "autenticacao-falsa" };
  const onAuthStateChanged = vi.fn(
    (_autenticacao, aoMudar: AoMudarAutenticacao, aoFalhar: AoFalharAutenticacao) => {
      mudarAutenticacao = aoMudar;
      falharAutenticacao = aoFalhar;
      return vi.fn();
    },
  );
  const signOut = vi.fn().mockResolvedValue(undefined);
  const criarUsuario = vi.fn();
  const deletarUsuario = vi.fn().mockResolvedValue(undefined);
  const autenticarUsuario = vi.fn();
  const obterPerfil = vi.fn();
  const salvarPerfil = vi.fn().mockResolvedValue(undefined);
  const definirIdDoUsuarioParaServidor = vi.fn();

  vi.doMock("firebase/auth", () => ({
    createUserWithEmailAndPassword: criarUsuario,
    deleteUser: deletarUsuario,
    onAuthStateChanged,
    sendPasswordResetEmail: vi.fn(),
    signInWithEmailAndPassword: autenticarUsuario,
    signOut,
  }));
  vi.doMock("@/infraestrutura/firebase/configuracaoFirebase", () => ({
    firebaseEstaConfigurado: true,
    obterAutenticacao: () => autenticacao,
  }));
  vi.doMock("@/infraestrutura/servicosDaAplicacao", () => ({
    definirIdDoUsuarioParaServidor,
    repositorioDeUsuarios: {
      obterPorId: obterPerfil,
      salvar: salvarPerfil,
    },
    autenticarUsuario,
  }));

  const modulo = await import("@/composables/usarSessao");
  return {
    aoMudar: () => {
      if (!mudarAutenticacao) throw new Error("Observador de autenticação não instalado.");
      return mudarAutenticacao;
    },
    aoFalhar: () => {
      if (!falharAutenticacao) throw new Error("Observador de autenticação não instalado.");
      return falharAutenticacao;
    },
    criarUsuario,
    deletarUsuario,
    definirIdDoUsuarioParaServidor,
    obterPerfil,
    onAuthStateChanged,
    autenticarUsuario,
    observarFimDaSessao: modulo.observarFimDaSessao,
    salvarPerfil,
    sessao: modulo.usarSessao(),
    signOut,
  } satisfies AmbienteDaSessao;
}

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("sessão Firebase", () => {
  it("mantém um único observador e acompanha mudanças posteriores do usuário", async () => {
    const ambiente = await importarSessaoReal();
    ambiente.obterPerfil.mockImplementation(async (id: string) => perfil(id));

    const inicializacao = ambiente.sessao.inicializar();
    await ambiente.aoMudar()({ uid: "usuario-a" });
    await inicializacao;

    expect(ambiente.sessao.usuarioAtual.value?.id).toBe("usuario-a");
    expect(ambiente.onAuthStateChanged).toHaveBeenCalledOnce();

    await ambiente.aoMudar()({ uid: "usuario-b" });
    await ambiente.sessao.inicializar();

    expect(ambiente.sessao.usuarioAtual.value?.id).toBe("usuario-b");
    expect(ambiente.onAuthStateChanged).toHaveBeenCalledOnce();
    expect(ambiente.definirIdDoUsuarioParaServidor).toHaveBeenLastCalledWith("usuario-b");
  });

  it("rejeita a inicialização quando o perfil não existe, sem liberar UID ao servidor", async () => {
    const ambiente = await importarSessaoReal();
    ambiente.obterPerfil.mockResolvedValue(null);

    const inicializacao = ambiente.sessao.inicializar();
    const verificacao = expect(inicializacao).rejects.toThrow("perfil deste usuário");
    await ambiente.aoMudar()({ uid: "sem-perfil" });
    await verificacao;

    expect(ambiente.sessao.usuarioAtual.value).toBeNull();
    expect(ambiente.sessao.erroDeInicializacao.value?.message).toContain("perfil deste usuário");
    expect(ambiente.definirIdDoUsuarioParaServidor).toHaveBeenLastCalledWith(null);
  });

  it("ignora uma leitura de perfil atrasada depois do logout", async () => {
    const ambiente = await importarSessaoReal();
    const leituraAtrasada = promessaControlada<Usuario | null>();
    ambiente.obterPerfil.mockReturnValueOnce(leituraAtrasada.promessa);

    const inicializacao = ambiente.sessao.inicializar();
    const eventoAntigo = ambiente.aoMudar()({ uid: "usuario-atrasado" });
    await ambiente.aoMudar()(null);
    await inicializacao;

    leituraAtrasada.resolver(perfil("usuario-atrasado"));
    await eventoAntigo;

    expect(ambiente.sessao.usuarioAtual.value).toBeNull();
    expect(ambiente.definirIdDoUsuarioParaServidor).not.toHaveBeenCalledWith("usuario-atrasado");
  });

  it("coordena a criação da conta com o observador antes de consultar o novo perfil", async () => {
    const ambiente = await importarSessaoReal();
    const persistencia = promessaControlada<void>();
    ambiente.obterPerfil.mockResolvedValueOnce(null);
    ambiente.criarUsuario.mockResolvedValue({ user: { uid: "novo-usuario" } });
    ambiente.salvarPerfil.mockReturnValue(persistencia.promessa);

    const inicializacao = ambiente.sessao.inicializar();
    const verificacao = expect(inicializacao).rejects.toThrow("perfil deste usuário");
    await ambiente.aoMudar()({ uid: "usuario-antigo-sem-perfil" });
    await verificacao;

    const cadastro = ambiente.sessao.cadastrar(
      "Novo Usuário",
      "novo@megadoor.local",
      "senha-segura",
      CargoUsuario.DESIGNER,
    );
    await vi.waitFor(() => expect(ambiente.salvarPerfil).toHaveBeenCalledOnce());
    const eventoDaAutenticacao = ambiente.aoMudar()({ uid: "novo-usuario" });

    persistencia.resolver();
    const [usuario] = await Promise.all([cadastro, eventoDaAutenticacao]);

    expect(usuario.id).toBe("novo-usuario");
    expect(ambiente.sessao.usuarioAtual.value?.id).toBe("novo-usuario");
    expect(ambiente.obterPerfil).toHaveBeenCalledOnce();
    expect(ambiente.deletarUsuario).not.toHaveBeenCalled();
    expect(ambiente.definirIdDoUsuarioParaServidor).toHaveBeenLastCalledWith("novo-usuario");
    expect(ambiente.sessao.erroDeInicializacao.value).toBeNull();
    await expect(ambiente.sessao.inicializar()).resolves.toBeUndefined();
  });

  it("limpa o erro de restauração depois de um login válido", async () => {
    const ambiente = await importarSessaoReal();
    ambiente.obterPerfil
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(perfil("usuario-recuperado"));

    const inicializacao = ambiente.sessao.inicializar();
    const verificacao = expect(inicializacao).rejects.toThrow("perfil deste usuário");
    await ambiente.aoMudar()({ uid: "usuario-sem-perfil" });
    await verificacao;
    ambiente.autenticarUsuario.mockResolvedValue({ user: { uid: "usuario-recuperado" } });

    await ambiente.sessao.autenticar("recuperado@megadoor.local", "senha-segura");

    expect(ambiente.sessao.erroDeInicializacao.value).toBeNull();
    await expect(ambiente.sessao.inicializar()).resolves.toBeUndefined();
  });

  it("preserva a falha original quando a compensação do cadastro também falha", async () => {
    const ambiente = await importarSessaoReal();
    const falhaDePersistencia = new Error("perfil não persistido");
    ambiente.criarUsuario.mockResolvedValue({ user: { uid: "usuario-incompleto" } });
    ambiente.salvarPerfil.mockRejectedValue(falhaDePersistencia);
    ambiente.deletarUsuario.mockRejectedValue(new Error("conta não removida"));

    await expect(
      ambiente.sessao.cadastrar(
        "Usuário Incompleto",
        "incompleto@megadoor.local",
        "senha-segura",
        CargoUsuario.DESIGNER,
      ),
    ).rejects.toBe(falhaDePersistencia);

    expect(ambiente.deletarUsuario).toHaveBeenCalledOnce();
    expect(ambiente.sessao.usuarioAtual.value).toBeNull();
    expect(ambiente.definirIdDoUsuarioParaServidor).toHaveBeenLastCalledWith(null);
  });

  it("limpa consumidores da sessão uma única vez ao desconectar", async () => {
    const ambiente = await importarSessaoReal();
    ambiente.obterPerfil.mockResolvedValue(perfil("usuario-a"));
    const limparConsumidor = vi.fn();
    const pararDeObservar = ambiente.observarFimDaSessao(limparConsumidor);

    const inicializacao = ambiente.sessao.inicializar();
    await ambiente.aoMudar()({ uid: "usuario-a" });
    await inicializacao;
    await ambiente.sessao.sair();
    await ambiente.aoMudar()(null);

    expect(ambiente.signOut).toHaveBeenCalledOnce();
    expect(limparConsumidor).toHaveBeenCalledOnce();
    expect(ambiente.sessao.usuarioAtual.value).toBeNull();
    expect(ambiente.definirIdDoUsuarioParaServidor).toHaveBeenLastCalledWith(null);

    pararDeObservar();
  });

  it("propaga uma falha do observador durante a restauração", async () => {
    const ambiente = await importarSessaoReal();
    const inicializacao = ambiente.sessao.inicializar();
    const verificacao = expect(inicializacao).rejects.toThrow("sessão indisponível");

    ambiente.aoFalhar()(new Error("sessão indisponível"));

    await verificacao;
    expect(ambiente.sessao.usuarioAtual.value).toBeNull();
  });
});
