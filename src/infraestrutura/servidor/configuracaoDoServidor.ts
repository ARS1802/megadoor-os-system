import { reactive } from "vue";
import type { ConfiguracaoServidor } from "@/dominio/objetosDeValor";

const CHAVE = "megadoor-configuracao-servidor";
const padrao: ConfiguracaoServidor = { endereco: "192.168.0.10", porta: 8443 };

function carregar(): ConfiguracaoServidor {
  try {
    const dados = localStorage.getItem(CHAVE);
    return dados ? { ...padrao, ...JSON.parse(dados) } : padrao;
  } catch {
    return padrao;
  }
}

export const configuracaoDoServidor = reactive<ConfiguracaoServidor>(carregar());

export function salvarConfiguracaoDoServidor(configuracao: ConfiguracaoServidor): void {
  configuracaoDoServidor.endereco = configuracao.endereco.trim();
  configuracaoDoServidor.porta = configuracao.porta;
  localStorage.setItem(CHAVE, JSON.stringify(configuracaoDoServidor));
}

export function enderecoBaseDoServidor(): string {
  return `https://${configuracaoDoServidor.endereco}:${configuracaoDoServidor.porta}`;
}
