<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import AppPopup from "@/componentes/AppPopup.vue";
import { CargoUsuario } from "@/dominio/enumeracoes";
import { esquemaCadastro } from "@/esquemas/formularios";
import { usarSessao } from "@/composables/usarSessao";
import { usarNotificacoes } from "@/composables/usarNotificacoes";
import { destinoInicialDoCargo } from "@/roteador/destinosPorCargo";

const formulario = reactive({
  nome: "",
  email: "",
  senha: "",
  confirmacaoDaSenha: "",
  cargo: CargoUsuario.MAQUINISTA,
  senhaAdministrativa: "",
});
const popupAberto = ref(false);
const erro = ref("");
const enviando = ref(false);
const sessao = usarSessao();
const roteador = useRouter();
const { notificar } = usarNotificacoes();

function aoMudarCargo(): void {
  if (formulario.cargo === CargoUsuario.ADMIN) popupAberto.value = true;
  else formulario.senhaAdministrativa = "";
}

async function cadastrar(): Promise<void> {
  erro.value = "";
  const resultado = esquemaCadastro.safeParse(formulario);
  if (!resultado.success) {
    erro.value = resultado.error.issues[0]?.message ?? "Revise os dados.";
    return;
  }
  enviando.value = true;
  try {
    await sessao.cadastrar(formulario.nome, formulario.email, formulario.senha, formulario.cargo);
    notificar("Conta criada com sucesso.");
    await roteador.push(destinoInicialDoCargo(formulario.cargo));
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível criar a conta.";
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <main class="page-shell page-shell--narrow">
    <header class="app-header">
      <RouterLink class="header-link header-link--compact" :to="{ name: 'login' }"
        >← Login</RouterLink
      >
      <p class="app-header__center">Criar conta</p>
      <span></span>
    </header>
    <form class="card registration-form" @submit.prevent="cadastrar">
      <div class="form-grid">
        <div class="field">
          <label for="name">Nome</label
          ><input id="name" v-model.trim="formulario.nome" autocomplete="name" required />
        </div>
        <div class="field">
          <label for="register-email">E-mail</label
          ><input
            id="register-email"
            v-model.trim="formulario.email"
            type="email"
            autocomplete="email"
            required
          />
        </div>
        <div class="field">
          <label for="register-password">Senha</label
          ><input
            id="register-password"
            v-model="formulario.senha"
            type="password"
            autocomplete="new-password"
            required
          />
        </div>
        <div class="field">
          <label for="confirm-password">Confirmar senha</label
          ><input
            id="confirm-password"
            v-model="formulario.confirmacaoDaSenha"
            type="password"
            autocomplete="new-password"
            required
          />
        </div>
        <fieldset class="cargo-selector field--full">
          <legend>Escolha o cargo</legend>
          <div class="cargo-options">
            <label class="cargo-card">
              <input
                v-model="formulario.cargo"
                class="visually-hidden"
                type="radio"
                :value="CargoUsuario.MAQUINISTA"
                @change="aoMudarCargo"
              />
              <strong>Maquinista</strong>
              <span>Opera Impressão, Plotagem e Corte e registra a produção realizada.</span>
            </label>
            <label class="cargo-card">
              <input
                v-model="formulario.cargo"
                class="visually-hidden"
                type="radio"
                :value="CargoUsuario.DESIGNER"
                @change="aoMudarCargo"
              />
              <strong>Designer</strong>
              <span
                >Cria candidatos, materiais e Ordens de Serviço e também opera os processos de
                produção.</span
              >
            </label>
            <label class="cargo-card">
              <input
                v-model="formulario.cargo"
                class="visually-hidden"
                type="radio"
                :value="CargoUsuario.ADMIN"
                @change="aoMudarCargo"
              />
              <strong>Administrador</strong>
              <span>Executa todas as funções, monitora a produção e pode forçar conclusões.</span>
            </label>
          </div>
        </fieldset>
        <div v-if="formulario.cargo === CargoUsuario.ADMIN" class="field field--full">
          <span class="field__label">Acesso administrativo</span
          ><button class="btn btn--secondary" type="button" @click="popupAberto = true">
            {{
              formulario.senhaAdministrativa ? "Senha informada" : "Informar senha administrativa"
            }}
          </button>
        </div>
      </div>
      <p v-if="erro" class="field__error" role="alert">{{ erro }}</p>
      <div class="button-row button-row--end">
        <RouterLink class="btn btn--secondary" :to="{ name: 'login' }">Cancelar</RouterLink
        ><button class="btn btn--primary" type="submit" :disabled="enviando">Criar conta</button>
      </div>
    </form>
    <AppPopup :aberto="popupAberto" titulo="Senha administrativa" @fechar="popupAberto = false">
      <div class="field">
        <label for="admin-password">Senha administrativa</label
        ><input
          id="admin-password"
          v-model="formulario.senhaAdministrativa"
          type="password"
          autocomplete="off"
        />
      </div>
      <template #acoes
        ><button class="btn btn--secondary" @click="popupAberto = false">Cancelar</button
        ><button class="btn btn--primary" @click="popupAberto = false">Confirmar</button></template
      >
    </AppPopup>
  </main>
</template>
