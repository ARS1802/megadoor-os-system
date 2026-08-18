<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "@/componentes/AppHeader.vue";
import { usarTema } from "@/composables/usarTema";
import { usarSessao } from "@/composables/usarSessao";
import { usarNotificacoes } from "@/composables/usarNotificacoes";
import {
  configuracaoDoServidor,
  salvarConfiguracaoDoServidor,
} from "@/infraestrutura/servidor/configuracaoDoServidor";
import { servidorDeArquivos } from "@/infraestrutura/servicosDaAplicacao";
import { MENSAGEM_SERVIDOR_NAO_CONFIGURADO } from "@/infraestrutura/servidor/ServidorDeArquivosFastApi";
import { usarNavegacaoContextual } from "@/composables/usarNavegacaoContextual";

const formulario = reactive({
  endereco: configuracaoDoServidor.endereco,
  porta: configuracaoDoServidor.porta,
});
const testando = ref(false);
const { tema, alternar } = usarTema();
const sessao = usarSessao();
const roteador = useRouter();
const { notificar } = usarNotificacoes();
const { destinoDeRetorno } = usarNavegacaoContextual();

async function testar(): Promise<void> {
  salvarConfiguracaoDoServidor(formulario);
  testando.value = true;
  const conectado = await servidorDeArquivos.verificarConexao();
  notificar(
    conectado ? "Servidor conectado." : MENSAGEM_SERVIDOR_NAO_CONFIGURADO,
    conectado ? "success" : "error",
  );
  testando.value = false;
}

async function desconectar(): Promise<void> {
  await sessao.sair();
  await roteador.push({ name: "login" });
}

async function abrirCertificado(): Promise<void> {
  try {
    await servidorDeArquivos.abrirCertificado();
  } catch (falha) {
    notificar(falha instanceof Error ? falha.message : MENSAGEM_SERVIDOR_NAO_CONFIGURADO, "error");
  }
}
</script>

<template>
  <main class="page-shell page-shell--narrow">
    <AppHeader titulo="Conexão e preferências" :voltar-para="destinoDeRetorno" />
    <section class="card">
      <h1>Servidor de arquivos</h1>
      <div class="form-grid">
        <div class="field">
          <label for="server-ip">Endereço IP</label
          ><input id="server-ip" v-model.trim="formulario.endereco" required />
        </div>
        <div class="field">
          <label for="server-port">Porta HTTPS</label
          ><input
            id="server-port"
            v-model.number="formulario.porta"
            type="number"
            min="1"
            max="65535"
          />
        </div>
      </div>
      <div class="button-row">
        <button class="btn btn--secondary" :disabled="testando" @click="testar">
          {{ testando ? "Testando..." : "Testar conexão" }}</button
        ><button class="btn btn--secondary" @click="abrirCertificado">Abrir Certificado</button>
      </div>
    </section>
    <section class="card">
      <h2>Aparência</h2>
      <button
        class="btn btn--secondary"
        type="button"
        :aria-pressed="tema === 'dark'"
        @click="alternar"
      >
        Alternar tema escuro
      </button>
    </section>
    <section class="card">
      <h2>Sessão</h2>
      <button class="btn btn--danger" @click="desconectar">Desconectar</button>
    </section>
  </main>
</template>
