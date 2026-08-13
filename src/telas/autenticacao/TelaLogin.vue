<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usarSessao } from "@/composables/usarSessao";
import { usarNotificacoes } from "@/composables/usarNotificacoes";
import { firebaseEstaConfigurado } from "@/infraestrutura/firebase/configuracaoFirebase";
import { destinoInicialDoCargo } from "@/roteador/destinosPorCargo";
import { computed } from "vue";
import logotipoMegadoor from "../../../assets/images/megadoor-logo.svg";

const formulario = reactive({ email: "", senha: "" });
const enviando = ref(false);
const erro = ref("");
const sessao = usarSessao();
const roteador = useRouter();
const rota = useRoute();
const { notificar } = usarNotificacoes();
const erroDaSessao = computed(() =>
  rota.query.erroSessao === "perfil"
    ? "A autenticação existe, mas o perfil do usuário não pôde ser carregado."
    : "",
);

function destinoInternoSeguro(valor: unknown): string | null {
  return typeof valor === "string" && valor.startsWith("/") && !valor.startsWith("//")
    ? valor
    : null;
}

async function entrar(): Promise<void> {
  enviando.value = true;
  erro.value = "";
  try {
    const usuario = await sessao.autenticar(formulario.email, formulario.senha);
    notificar(`Bem-vindo, ${usuario.nome}.`);
    const redirecionar = destinoInternoSeguro(rota.query.redirecionar);
    await roteador.push(redirecionar || destinoInicialDoCargo(usuario.cargo));
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível entrar.";
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-card" aria-labelledby="page-title">
      <div class="brand-block">
        <img :src="logotipoMegadoor" alt="Megadoor" width="210" />
        <h1 id="page-title">Produção Campanha</h1>
        <p>Megadoor OS</p>
      </div>
      <form class="auth-form" @submit.prevent="entrar">
        <div class="field">
          <label for="email">E-mail</label>
          <input
            id="email"
            v-model.trim="formulario.email"
            type="email"
            autocomplete="username"
            required
          />
        </div>
        <div class="field">
          <label for="password">Senha</label>
          <input
            id="password"
            v-model="formulario.senha"
            type="password"
            autocomplete="current-password"
            required
          />
        </div>
        <p v-if="erro || erroDaSessao" class="field__error" role="alert">
          {{ erro || erroDaSessao }}
        </p>
        <button class="btn btn--primary" type="submit" :disabled="enviando">
          {{ enviando ? "Entrando..." : "Entrar" }}
        </button>
        <div class="auth-links">
          <RouterLink :to="{ name: 'recuperarSenha' }">Esqueci minha senha</RouterLink>
          <RouterLink :to="{ name: 'cadastro' }">Cadastre-se</RouterLink>
        </div>
        <p v-if="!firebaseEstaConfigurado" class="auth-note">
          Modo demonstrativo: use um e-mail contendo <strong>admin</strong> ou
          <strong>designer</strong> para testar esses cargos. Qualquer senha é aceita.
        </p>
      </form>
    </section>
  </main>
</template>
