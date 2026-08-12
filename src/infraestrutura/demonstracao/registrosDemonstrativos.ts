const registrosPorOrdem = new Map<string, string[]>([
  [
    "OS-2026-001",
    [
      "[2026-08-11T08:42:00-03:00] | OPERACAO=demo-1 | USUARIO=Arthur | PROCESSO=IMPRESSAO | CONTADOR=GRADE | SENTIDO=ADICIONAR | UNIDADES=+52",
      "[2026-08-11T08:35:00-03:00] | OPERACAO=demo-2 | USUARIO=Tarcyo | PROCESSO=CORTE | CONTADOR=UNIDADE | SENTIDO=REMOVER | UNIDADES=-3",
      "[2026-08-11T08:31:00-03:00] | USUARIO=Edson | PROCESSO=CORTE | EVENTO=ARQUIVO_ANEXADO",
    ],
  ],
]);

export function lerRegistroDemonstrativo(idDaOrdem: string): string {
  return (registrosPorOrdem.get(idDaOrdem) ?? []).join("\n");
}

export function acrescentarRegistroDemonstrativo(idDaOrdem: string, linha: string): void {
  const linhas = registrosPorOrdem.get(idDaOrdem) ?? [];
  linhas.push(linha);
  registrosPorOrdem.set(idDaOrdem, linhas);
}
