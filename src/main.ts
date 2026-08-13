import { createApp } from "vue";
import {
  inicializarConfiguracaoDoServidor,
  instalacaoAnteriorFoiSubstituida,
} from "@/infraestrutura/servidor/configuracaoDoServidor";
import "../css/styles.css";
import "@/estilos/vue.css";

async function iniciarAplicacao(): Promise<void> {
  await inicializarConfiguracaoDoServidor();

  if (instalacaoAnteriorFoiSubstituida()) {
    const [{ signOut }, { firebaseEstaConfigurado, obterAutenticacao }] = await Promise.all([
      import("firebase/auth"),
      import("@/infraestrutura/firebase/configuracaoFirebase"),
    ]);
    if (firebaseEstaConfigurado) await signOut(obterAutenticacao());
  }

  // App, roteador e composables são importados somente depois da limpeza. Assim,
  // tema e sessão não capturam valores pertencentes à instalação anterior.
  const [{ default: App }, { roteador }] = await Promise.all([
    import("@/App.vue"),
    import("@/roteador"),
  ]);
  createApp(App).use(roteador).mount("#app");
}

void iniciarAplicacao();
