export const MODOS_DA_APLICACAO = ["DEMO", "EMULADORES", "REAL"] as const;

export type ModoDaAplicacao = (typeof MODOS_DA_APLICACAO)[number];

export interface AmbienteDaAplicacao {
  modoExplicito?: string;
  usarEmuladores?: string;
  configuracaoFirebase: Record<string, string | undefined>;
}

const PROJETO_FIREBASE_REAL = "megadoor-os-system";

function configuracaoCompleta(configuracao: Record<string, string | undefined>): boolean {
  return Object.values(configuracao).every((valor) => Boolean(valor?.trim()));
}

function configuracaoVazia(configuracao: Record<string, string | undefined>): boolean {
  return Object.values(configuracao).every((valor) => !valor?.trim());
}

export function determinarModoDaAplicacao(ambiente: AmbienteDaAplicacao): ModoDaAplicacao {
  const modoInformado = ambiente.modoExplicito?.trim().toUpperCase();
  const modoExplicito = modoInformado
    ? MODOS_DA_APLICACAO.find((modo) => modo === modoInformado)
    : undefined;

  if (modoInformado && !modoExplicito) {
    throw new Error(
      `VITE_MODO_APLICACAO inválido: ${modoInformado}. Use DEMO, EMULADORES ou REAL.`,
    );
  }

  const valorLegadoInformado = ambiente.usarEmuladores?.trim().toLowerCase();
  if (valorLegadoInformado && valorLegadoInformado !== "true" && valorLegadoInformado !== "false") {
    throw new Error(
      `VITE_USAR_EMULADORES inválido: ${ambiente.usarEmuladores}. Use true ou false.`,
    );
  }

  const usarEmuladores = valorLegadoInformado === "true";
  if (modoExplicito === "REAL" && usarEmuladores) {
    throw new Error(
      "Configuração contraditória: VITE_MODO_APLICACAO=REAL não pode ser combinado com VITE_USAR_EMULADORES=true.",
    );
  }
  if (modoExplicito === "EMULADORES" && valorLegadoInformado === "false") {
    throw new Error(
      "Configuração contraditória: VITE_MODO_APLICACAO=EMULADORES não pode ser combinado com VITE_USAR_EMULADORES=false.",
    );
  }

  const completa = configuracaoCompleta(ambiente.configuracaoFirebase);
  const vazia = configuracaoVazia(ambiente.configuracaoFirebase);
  const modo = modoExplicito ?? (vazia ? "DEMO" : usarEmuladores ? "EMULADORES" : "REAL");

  if (modo === "DEMO") return modo;
  if (!completa) {
    throw new Error(
      `A configuração Firebase está incompleta para o modo ${modo}. Preencha todas as variáveis VITE_FIREBASE_*.`,
    );
  }
  if (modo === "REAL" && ambiente.configuracaoFirebase.projectId !== PROJETO_FIREBASE_REAL) {
    throw new Error(`O modo REAL aceita somente o projeto Firebase ${PROJETO_FIREBASE_REAL}.`);
  }
  return modo;
}
