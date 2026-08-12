<script setup lang="ts">
import { ref } from "vue";
import { usarSessao } from "@/composables/usarSessao";
import { usarNotificacoes } from "@/composables/usarNotificacoes";

const email = ref("");
const enviando = ref(false);
const { recuperarSenha } = usarSessao();
const { notificar } = usarNotificacoes();

async function enviar(): Promise<void> {
  enviando.value = true;
  try {
    await recuperarSenha(email.value);
    notificar("Se o e-mail estiver cadastrado, as instruções serão enviadas.");
  } catch (erro) {
    notificar(erro instanceof Error ? erro.message : "Falha ao solicitar a recuperação.", "error");
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-card auth-card--compact">
      <div class="brand-block">
        <h1>Recuperar senha</h1>
        <p>Enviaremos instruções para o e-mail cadastrado.</p>
      </div>
      <form class="auth-form" @submit.prevent="enviar">
        <div class="field">
          <label for="recovery-email">E-mail</label
          ><input id="recovery-email" v-model.trim="email" type="email" required />
        </div>
        <button class="btn btn--primary" type="submit" :disabled="enviando">Enviar link</button>
        <RouterLink :to="{ name: 'login' }">Voltar para o login</RouterLink>
      </form>
    </section>
  </main>
</template>
