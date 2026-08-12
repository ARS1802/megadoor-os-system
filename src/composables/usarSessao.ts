import { readonly, ref } from "vue";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { CargoUsuario } from "@/dominio/enumeracoes";
import { Usuario } from "@/dominio/entidades/Usuario";
import {
  firebaseEstaConfigurado,
  obterAutenticacao,
} from "@/infraestrutura/firebase/configuracaoFirebase";
import {
  definirIdDoUsuarioParaServidor,
  repositorioDeUsuarios,
} from "@/infraestrutura/servicosDaAplicacao";

const CHAVE_SESSAO_DEMO = "megadoor-sessao-demo";
const usuarioAtual = ref<Usuario | null>(null);
const inicializada = ref(false);
const erroDeInicializacao = ref<Error | null>(null);
let promessaDeInicializacao: Promise<void> | null = null;
let promessaDeCadastroReal: Promise<Usuario> | null = null;
let observadorDaAutenticacaoInstalado = false;
let versaoDoEventoDeAutenticacao = 0;
const observadoresDeMudancaDaSessao = new Set<() => void>();

function comoErro(falha: unknown, mensagem: string): Error {
  return falha instanceof Error ? falha : new Error(mensagem);
}

function limparSessaoAtual(): void {
  const haviaUsuario = Boolean(usuarioAtual.value);
  usuarioAtual.value = null;
  definirIdDoUsuarioParaServidor(null);
  if (haviaUsuario) observadoresDeMudancaDaSessao.forEach((observar) => observar());
}

export function observarFimDaSessao(observar: () => void): () => void {
  observadoresDeMudancaDaSessao.add(observar);
  return () => observadoresDeMudancaDaSessao.delete(observar);
}

function cargoDemonstrativo(email: string): CargoUsuario {
  const texto = email.toLowerCase();
  if (texto.includes("admin")) return CargoUsuario.ADMIN;
  if (texto.includes("designer")) return CargoUsuario.DESIGNER;
  return CargoUsuario.MAQUINISTA;
}

async function inicializar(): Promise<void> {
  if (inicializada.value) {
    if (erroDeInicializacao.value) throw erroDeInicializacao.value;
    return;
  }
  if (promessaDeInicializacao) return promessaDeInicializacao;
  // Sessões demonstrativas antigas eram persistidas entre execuções. A chave
  // legada é descartada para que um novo acesso sempre comece pelo Login.
  localStorage.removeItem(CHAVE_SESSAO_DEMO);
  if (!firebaseEstaConfigurado) {
    const salva = sessionStorage.getItem(CHAVE_SESSAO_DEMO);
    if (salva) {
      try {
        usuarioAtual.value = new Usuario(JSON.parse(salva));
      } catch {
        sessionStorage.removeItem(CHAVE_SESSAO_DEMO);
        usuarioAtual.value = null;
      }
    }
    definirIdDoUsuarioParaServidor(usuarioAtual.value?.id ?? null);
    inicializada.value = true;
    return;
  }
  promessaDeInicializacao = new Promise<void>((resolver, rejeitar) => {
    let primeiroEvento = true;
    const concluirPrimeiroEvento = (falha?: Error) => {
      if (!primeiroEvento) return;
      primeiroEvento = false;
      inicializada.value = true;
      erroDeInicializacao.value = falha ?? null;
      if (falha) rejeitar(falha);
      else resolver();
    };

    if (observadorDaAutenticacaoInstalado) {
      concluirPrimeiroEvento();
      return;
    }
    observadorDaAutenticacaoInstalado = true;
    onAuthStateChanged(
      obterAutenticacao(),
      async (autenticado) => {
        const versaoDoEvento = ++versaoDoEventoDeAutenticacao;
        try {
          if (!autenticado) {
            limparSessaoAtual();
            concluirPrimeiroEvento();
            return;
          }
          const cadastroEmAndamento = promessaDeCadastroReal;
          if (cadastroEmAndamento) {
            const usuarioCadastrado = await cadastroEmAndamento;
            if (versaoDoEvento !== versaoDoEventoDeAutenticacao) return;
            if (usuarioCadastrado.id === autenticado.uid) {
              usuarioAtual.value = usuarioCadastrado;
              definirIdDoUsuarioParaServidor(usuarioCadastrado.id);
              erroDeInicializacao.value = null;
              concluirPrimeiroEvento();
              return;
            }
          }
          const perfil = await repositorioDeUsuarios.obterPorId(autenticado.uid);
          if (versaoDoEvento !== versaoDoEventoDeAutenticacao) return;
          if (!perfil) throw new Error("O perfil deste usuário não foi encontrado.");
          if (!perfil.ativo) throw new Error("Este usuário está inativo.");
          usuarioAtual.value = perfil;
          definirIdDoUsuarioParaServidor(perfil.id);
          erroDeInicializacao.value = null;
          concluirPrimeiroEvento();
        } catch (falha) {
          if (versaoDoEvento !== versaoDoEventoDeAutenticacao) return;
          limparSessaoAtual();
          const erro = comoErro(falha, "Não foi possível carregar o perfil do usuário.");
          concluirPrimeiroEvento(erro);
        }
      },
      (falha) => {
        limparSessaoAtual();
        concluirPrimeiroEvento(comoErro(falha, "Não foi possível restaurar a sessão."));
      },
    );
  });
  try {
    await promessaDeInicializacao;
  } finally {
    promessaDeInicializacao = null;
  }
}

async function autenticar(email: string, senha: string): Promise<Usuario> {
  if (firebaseEstaConfigurado) {
    const credencial = await signInWithEmailAndPassword(obterAutenticacao(), email, senha);
    try {
      const usuario = await repositorioDeUsuarios.obterPorId(credencial.user.uid);
      if (!usuario) throw new Error("O perfil deste usuário não foi encontrado.");
      if (!usuario.ativo) throw new Error("Este usuário está inativo.");
      usuarioAtual.value = usuario;
      erroDeInicializacao.value = null;
    } catch (falha) {
      await signOut(obterAutenticacao());
      limparSessaoAtual();
      throw falha;
    }
  } else {
    usuarioAtual.value = new Usuario({
      id: `demo-${cargoDemonstrativo(email).toLowerCase()}`,
      nome: email.split("@")[0] || "Usuário demonstrativo",
      email,
      cargo: cargoDemonstrativo(email),
    });
    sessionStorage.setItem(CHAVE_SESSAO_DEMO, JSON.stringify(usuarioAtual.value));
  }
  definirIdDoUsuarioParaServidor(usuarioAtual.value.id);
  return usuarioAtual.value;
}

async function cadastrar(
  nome: string,
  email: string,
  senha: string,
  cargo: CargoUsuario,
): Promise<Usuario> {
  if (firebaseEstaConfigurado) {
    if (promessaDeCadastroReal) throw new Error("Já existe um cadastro em andamento.");
    const executarCadastro = async () => {
      const credencial = await createUserWithEmailAndPassword(obterAutenticacao(), email, senha);
      const usuario = new Usuario({ id: credencial.user.uid, nome, email, cargo });
      try {
        await repositorioDeUsuarios.salvar(usuario);
        usuarioAtual.value = usuario;
        erroDeInicializacao.value = null;
        definirIdDoUsuarioParaServidor(usuario.id);
        return usuario;
      } catch (falha) {
        try {
          await deleteUser(credencial.user);
        } catch {
          // A falha que explica por que o cadastro não pôde ser concluído é a
          // persistência do perfil. A compensação não deve escondê-la.
        } finally {
          limparSessaoAtual();
        }
        throw falha;
      }
    };
    const cadastroAtual = executarCadastro();
    promessaDeCadastroReal = cadastroAtual;
    try {
      return await cadastroAtual;
    } finally {
      if (promessaDeCadastroReal === cadastroAtual) promessaDeCadastroReal = null;
    }
  }

  usuarioAtual.value = new Usuario({ id: `demo-${crypto.randomUUID()}`, nome, email, cargo });
  sessionStorage.setItem(CHAVE_SESSAO_DEMO, JSON.stringify(usuarioAtual.value));
  definirIdDoUsuarioParaServidor(usuarioAtual.value.id);
  return usuarioAtual.value;
}

async function recuperarSenha(email: string): Promise<void> {
  if (firebaseEstaConfigurado) await sendPasswordResetEmail(obterAutenticacao(), email);
}

async function sair(): Promise<void> {
  if (firebaseEstaConfigurado) await signOut(obterAutenticacao());
  sessionStorage.removeItem(CHAVE_SESSAO_DEMO);
  localStorage.removeItem(CHAVE_SESSAO_DEMO);
  limparSessaoAtual();
}

export function usarSessao() {
  return {
    usuarioAtual: readonly(usuarioAtual),
    inicializada: readonly(inicializada),
    erroDeInicializacao: readonly(erroDeInicializacao),
    inicializar,
    autenticar,
    cadastrar,
    recuperarSenha,
    sair,
  };
}
