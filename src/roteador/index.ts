import { createRouter, createWebHashHistory } from "vue-router";
import { CargoUsuario } from "@/dominio/enumeracoes";
import { usarSessao } from "@/composables/usarSessao";
import { destinoInicialDoCargo } from "@/roteador/destinosPorCargo";

const rotas = [
  {
    path: "/",
    name: "login",
    component: () => import("@/telas/autenticacao/TelaLogin.vue"),
    meta: { publica: true },
  },
  {
    path: "/cadastro",
    name: "cadastro",
    component: () => import("@/telas/autenticacao/TelaCadastro.vue"),
    meta: { publica: true },
  },
  {
    path: "/recuperar-senha",
    name: "recuperarSenha",
    component: () => import("@/telas/autenticacao/TelaRecuperarSenha.vue"),
    meta: { publica: true },
  },
  {
    path: "/configuracoes",
    name: "configuracoes",
    component: () => import("@/telas/configuracoes/TelaConfiguracoes.vue"),
  },
  {
    path: "/maquinista",
    name: "painelMaquinista",
    component: () => import("@/telas/ordensDeServico/TelaPainelMaquinista.vue"),
    meta: { cargos: [CargoUsuario.MAQUINISTA, CargoUsuario.ADMIN] },
  },
  {
    path: "/designer",
    name: "painelDesigner",
    component: () => import("@/telas/ordensDeServico/TelaPainelDesigner.vue"),
    meta: { cargos: [CargoUsuario.DESIGNER, CargoUsuario.ADMIN] },
  },
  {
    path: "/historico",
    name: "historico",
    component: () => import("@/telas/ordensDeServico/TelaHistorico.vue"),
  },
  {
    path: "/ordens/nova",
    name: "novaOrdem",
    component: () => import("@/telas/ordensDeServico/TelaNovaOrdem.vue"),
    meta: { cargos: [CargoUsuario.DESIGNER, CargoUsuario.ADMIN] },
  },
  {
    path: "/ordens/:id",
    name: "detalhesOrdem",
    component: () => import("@/telas/ordensDeServico/TelaDetalhesOrdem.vue"),
  },
  {
    path: "/ordens/:id/processos/:processo",
    name: "execucaoProcesso",
    component: () => import("@/telas/ordensDeServico/TelaExecucaoProcesso.vue"),
    meta: {
      cargos: [CargoUsuario.MAQUINISTA, CargoUsuario.DESIGNER, CargoUsuario.ADMIN],
    },
  },
  {
    path: "/ordens/:id/registros",
    name: "registrosOrdem",
    component: () => import("@/telas/ordensDeServico/TelaRegistrosOrdem.vue"),
  },
  {
    path: "/candidatos/novo",
    name: "novoCandidato",
    component: () => import("@/telas/candidatos/TelaNovoCandidato.vue"),
    meta: { cargos: [CargoUsuario.DESIGNER, CargoUsuario.ADMIN] },
  },
  {
    path: "/materiais/novo",
    name: "novoMaterial",
    component: () => import("@/telas/materiais/TelaNovoMaterial.vue"),
    meta: { cargos: [CargoUsuario.DESIGNER, CargoUsuario.ADMIN] },
  },
  {
    path: "/administracao/menu",
    name: "menuAdministrativo",
    component: () => import("@/telas/administracao/TelaMenuAdministrativo.vue"),
    meta: { cargos: [CargoUsuario.ADMIN] },
  },
  {
    path: "/administracao/resumo",
    name: "resumoAdministrativo",
    component: () => import("@/telas/administracao/TelaResumoAdministrativo.vue"),
    meta: { cargos: [CargoUsuario.ADMIN] },
  },
  {
    path: "/administracao/painel",
    name: "painelAdministrador",
    component: () => import("@/telas/administracao/TelaPainelAdministrador.vue"),
    meta: { cargos: [CargoUsuario.ADMIN] },
  },
  { path: "/:caminho(.*)*", redirect: "/" },
];

export const roteador = createRouter({ history: createWebHashHistory(), routes: rotas });

roteador.beforeEach(async (destino) => {
  const sessao = usarSessao();
  await sessao.inicializar();
  if (destino.meta.publica) {
    if (destino.name === "login" && sessao.usuarioAtual.value)
      return destinoInicialDoCargo(sessao.usuarioAtual.value.cargo);
    return true;
  }
  if (!sessao.usuarioAtual.value)
    return { name: "login", query: { redirecionar: destino.fullPath } };
  const cargos = destino.meta.cargos as CargoUsuario[] | undefined;
  if (cargos && !cargos.includes(sessao.usuarioAtual.value.cargo))
    return destinoInicialDoCargo(sessao.usuarioAtual.value.cargo);
  return true;
});

declare module "vue-router" {
  interface RouteMeta {
    publica?: boolean;
    cargos?: CargoUsuario[];
  }
}
