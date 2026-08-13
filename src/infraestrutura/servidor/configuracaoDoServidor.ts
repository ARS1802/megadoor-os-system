import { reactive } from "vue";
import { z } from "zod";
import type { ConfiguracaoServidor } from "@/dominio/objetosDeValor";

const CHAVE = "megadoor-configuracao-servidor";
const VERSAO_DA_CONFIGURACAO_DE_RUNTIME = 1;
const PADRAO_DO_IDENTIFICADOR_DE_INSTALACAO = /^[A-Za-z0-9._-]{8,128}$/;

const padrao: ConfiguracaoServidor = { endereco: "192.168.0.10", porta: 8443 };

const esquemaDeIPv4 = z
  .string()
  .trim()
  .refine((valor) => {
    const partes = valor.split(".");
    return (
      partes.length === 4 &&
      partes.every((parte) => {
        if (!/^\d{1,3}$/.test(parte)) return false;
        if (parte.length > 1 && parte.startsWith("0")) return false;
        const numero = Number(parte);
        return numero >= 0 && numero <= 255;
      })
    );
  }, "O endereço do servidor deve ser um IPv4 válido.");

const esquemaDeConfiguracaoDoServidor = z.object({
  endereco: z.string().trim().min(1),
  porta: z.number().int().min(1).max(65_535),
});

const esquemaDoIdentificadorDeInstalacao = z.string().regex(PADRAO_DO_IDENTIFICADOR_DE_INSTALACAO);

const esquemaDeConfiguracaoPersistida = z
  .object({
    installationId: esquemaDoIdentificadorDeInstalacao,
    server: esquemaDeConfiguracaoDoServidor.strict(),
    runtimeServer: esquemaDeConfiguracaoDoServidor.strict().optional(),
  })
  .strict();

const esquemaDeConfiguracaoDeRuntime = z
  .object({
    schemaVersion: z.literal(VERSAO_DA_CONFIGURACAO_DE_RUNTIME),
    installationId: esquemaDoIdentificadorDeInstalacao,
    server: z
      .object({
        address: esquemaDeIPv4,
        port: z.number().int().min(1).max(65_535),
      })
      .strict(),
  })
  .strict();

export type OrigemDaConfiguracaoDoServidor = "armazenamento-local" | "runtime" | "padrao";

let identificadorDaInstalacaoAtual: string | null = null;
let configuracaoDoRuntimeAtual: ConfiguracaoServidor | null = null;
let instalacaoAnteriorSubstituida = false;

type ConfiguracaoPersistida = {
  configuracao: ConfiguracaoServidor;
  installationId: string | null;
  configuracaoDoRuntime: ConfiguracaoServidor | null;
};

function carregarDoArmazenamentoLocal(): ConfiguracaoPersistida | null {
  try {
    const dados = localStorage.getItem(CHAVE);
    if (!dados) return null;

    const valor = JSON.parse(dados);
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;

    const configuracaoInstalada = esquemaDeConfiguracaoPersistida.safeParse(valor);
    if (configuracaoInstalada.success) {
      return {
        configuracao: configuracaoInstalada.data.server,
        installationId: configuracaoInstalada.data.installationId,
        configuracaoDoRuntime: configuracaoInstalada.data.runtimeServer ?? null,
      };
    }

    // Compatibilidade com a configuração usada antes de o aplicativo possuir instalador.
    const configuracaoLegada = esquemaDeConfiguracaoDoServidor.safeParse({
      ...padrao,
      ...valor,
    });
    return configuracaoLegada.success
      ? {
          configuracao: configuracaoLegada.data,
          installationId: null,
          configuracaoDoRuntime: null,
        }
      : null;
  } catch {
    return null;
  }
}

function aplicar(configuracao: ConfiguracaoServidor): void {
  configuracaoDoServidor.endereco = configuracao.endereco;
  configuracaoDoServidor.porta = configuracao.porta;
}

function persistir(configuracao: ConfiguracaoServidor): void {
  try {
    const valor = identificadorDaInstalacaoAtual
      ? {
          installationId: identificadorDaInstalacaoAtual,
          server: configuracao,
          ...(configuracaoDoRuntimeAtual ? { runtimeServer: configuracaoDoRuntimeAtual } : {}),
        }
      : configuracao;
    localStorage.setItem(CHAVE, JSON.stringify(valor));
  } catch {
    // O bloqueio do armazenamento pelo navegador não impede o uso da configuração na sessão atual.
  }
}

export const configuracaoDoServidor = reactive<ConfiguracaoServidor>(
  carregarDoArmazenamentoLocal()?.configuracao ?? { ...padrao },
);

/**
 * Carrega a configuração inicial gravada pelo instalador em `/runtime-config.json`.
 *
 * O arquivo é buscado primeiro porque seu `installationId` define o namespace da
 * preferência local. Atualizações preservam o mesmo identificador; uma reinstalação
 * recebe outro e, portanto, não herda por engano a configuração anterior.
 */
export async function inicializarConfiguracaoDoServidor(
  buscar: typeof fetch = fetch,
): Promise<OrigemDaConfiguracaoDoServidor> {
  identificadorDaInstalacaoAtual = null;
  configuracaoDoRuntimeAtual = null;
  instalacaoAnteriorSubstituida = false;

  // Builds comuns (desenvolvimento, preview e E2E) não possuem o arquivo externo
  // do instalador. O adaptador continua injetável para testes unitários.
  const deveBuscarConfiguracaoDoInstalador =
    buscar !== fetch || import.meta.env.VITE_USAR_CONFIGURACAO_RUNTIME === "true";
  if (!deveBuscarConfiguracaoDoInstalador) {
    const configuracaoSalva = carregarDoArmazenamentoLocal();
    if (configuracaoSalva) {
      aplicar(configuracaoSalva.configuracao);
      return "armazenamento-local";
    }
    aplicar(padrao);
    return "padrao";
  }

  try {
    const resposta = await buscar(`${import.meta.env.BASE_URL}runtime-config.json`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });

    if (resposta.ok) {
      const resultado = esquemaDeConfiguracaoDeRuntime.safeParse(await resposta.json());
      if (resultado.success) {
        const configuracaoDoRuntime = {
          endereco: resultado.data.server.address,
          porta: resultado.data.server.port,
        } satisfies ConfiguracaoServidor;
        const configuracaoSalva = carregarDoArmazenamentoLocal();
        identificadorDaInstalacaoAtual = resultado.data.installationId;
        configuracaoDoRuntimeAtual = configuracaoDoRuntime;

        if (
          configuracaoSalva?.installationId &&
          configuracaoSalva.installationId !== identificadorDaInstalacaoAtual
        ) {
          // A origem loopback é estável entre instalações. Limpar o armazenamento
          // impede que uma instalação realmente nova herde tema, sessão DEMO ou
          // preferências da instalação removida.
          localStorage.clear();
          sessionStorage.clear();
          instalacaoAnteriorSubstituida = true;
        }

        const runtimeNaoMudou =
          configuracaoSalva?.configuracaoDoRuntime?.endereco === configuracaoDoRuntime.endereco &&
          configuracaoSalva.configuracaoDoRuntime.porta === configuracaoDoRuntime.porta;
        if (
          configuracaoSalva?.installationId === identificadorDaInstalacaoAtual &&
          runtimeNaoMudou
        ) {
          aplicar(configuracaoSalva.configuracao);
          return "armazenamento-local";
        }

        aplicar(configuracaoDoRuntime);
        persistir(configuracaoDoRuntime);
        return "runtime";
      }
    } else if (resposta.status !== 404) {
      // No pacote instalado, 503 representa configuração ausente/incompatível.
      // Não herde uma preferência antiga pertencente a outra instalação nesse estado.
      aplicar(padrao);
      return "padrao";
    }
  } catch {
    // Ausência, resposta inválida ou indisponibilidade do arquivo preservam o fallback existente.
  }

  const configuracaoSalva = carregarDoArmazenamentoLocal();
  if (configuracaoSalva) {
    aplicar(configuracaoSalva.configuracao);
    return "armazenamento-local";
  }

  aplicar(padrao);
  return "padrao";
}

/** Indica ao bootstrap que uma instalação removida não pode restaurar sua sessão Firebase. */
export function instalacaoAnteriorFoiSubstituida(): boolean {
  return instalacaoAnteriorSubstituida;
}

export function salvarConfiguracaoDoServidor(configuracao: ConfiguracaoServidor): void {
  const configuracaoNormalizada = esquemaDeConfiguracaoDoServidor.parse({
    endereco: configuracao.endereco.trim(),
    porta: configuracao.porta,
  });
  aplicar(configuracaoNormalizada);
  persistir(configuracaoNormalizada);
}

export function enderecoBaseDoServidor(): string {
  return `https://${configuracaoDoServidor.endereco}:${configuracaoDoServidor.porta}`;
}
