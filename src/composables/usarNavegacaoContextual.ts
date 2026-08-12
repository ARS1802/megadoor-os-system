import { computed } from "vue";
import { useRoute, useRouter, type RouteLocationRaw } from "vue-router";
import { usarSessao } from "@/composables/usarSessao";
import { destinoInicialDoCargo } from "@/roteador/destinosPorCargo";

function retornoInternoSeguro(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.startsWith("/") || valor.startsWith("//")) return null;
  return valor;
}

export function usarNavegacaoContextual() {
  const rota = useRoute();
  const roteador = useRouter();
  const sessao = usarSessao();
  const destinoInicial = computed<RouteLocationRaw>(() =>
    sessao.usuarioAtual.value
      ? destinoInicialDoCargo(sessao.usuarioAtual.value.cargo)
      : { name: "login" },
  );
  const retornoInformado = computed(() => retornoInternoSeguro(rota.query.retorno));
  const destinoDeRetorno = computed<RouteLocationRaw>(
    () => retornoInformado.value ?? destinoInicial.value,
  );

  function adicionarRetorno(destino: RouteLocationRaw, retorno: string): RouteLocationRaw {
    const resolvido = roteador.resolve(destino);
    return {
      path: resolvido.path,
      query: { ...resolvido.query, retorno },
      hash: resolvido.hash,
    };
  }

  function comRetorno(destino: RouteLocationRaw): RouteLocationRaw {
    return adicionarRetorno(destino, rota.fullPath);
  }

  function preservandoRetorno(destino: RouteLocationRaw): RouteLocationRaw {
    const retorno = retornoInformado.value ?? roteador.resolve(destinoInicial.value).fullPath;
    return adicionarRetorno(destino, retorno);
  }

  return { destinoInicial, destinoDeRetorno, comRetorno, preservandoRetorno };
}
