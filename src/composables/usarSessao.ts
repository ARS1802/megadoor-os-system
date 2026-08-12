import { readonly, ref } from "vue";
import {
  createUserWithEmailAndPassword,
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

function cargoDemonstrativo(email: string): CargoUsuario {
  const texto = email.toLowerCase();
  if (texto.includes("admin")) return CargoUsuario.ADMIN;
  if (texto.includes("designer")) return CargoUsuario.DESIGNER;
  return CargoUsuario.MAQUINISTA;
}

async function inicializar(): Promise<void> {
  if (inicializada.value) return;
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
  await new Promise<void>((resolver) => {
    const cancelar = onAuthStateChanged(obterAutenticacao(), async (autenticado) => {
      usuarioAtual.value = autenticado
        ? await repositorioDeUsuarios.obterPorId(autenticado.uid)
        : null;
      // A API de arquivos só recebe a identidade depois que o perfil foi
      // confirmado em `usuarios/{UID}`. Estar autenticado, sem perfil válido,
      // não libera chamadas ao servidor de arquivos.
      definirIdDoUsuarioParaServidor(usuarioAtual.value?.id ?? null);
      inicializada.value = true;
      cancelar();
      resolver();
    });
  });
}

async function autenticar(email: string, senha: string): Promise<Usuario> {
  if (firebaseEstaConfigurado) {
    const credencial = await signInWithEmailAndPassword(obterAutenticacao(), email, senha);
    const usuario = await repositorioDeUsuarios.obterPorId(credencial.user.uid);
    if (!usuario) throw new Error("O perfil deste usuário não foi encontrado.");
    usuarioAtual.value = usuario;
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
    const credencial = await createUserWithEmailAndPassword(obterAutenticacao(), email, senha);
    const usuario = new Usuario({ id: credencial.user.uid, nome, email, cargo });
    await repositorioDeUsuarios.salvar(usuario);
    usuarioAtual.value = usuario;
  } else {
    usuarioAtual.value = new Usuario({ id: `demo-${crypto.randomUUID()}`, nome, email, cargo });
    sessionStorage.setItem(CHAVE_SESSAO_DEMO, JSON.stringify(usuarioAtual.value));
  }
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
  usuarioAtual.value = null;
  definirIdDoUsuarioParaServidor(null);
}

export function usarSessao() {
  return {
    usuarioAtual: readonly(usuarioAtual),
    inicializada: readonly(inicializada),
    inicializar,
    autenticar,
    cadastrar,
    recuperarSenha,
    sair,
  };
}
