import { createApp } from "vue";
import App from "@/App.vue";
import { roteador } from "@/roteador";
import "../css/styles.css";
import "@/estilos/vue.css";

createApp(App).use(roteador).mount("#app");
