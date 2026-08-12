export function normalizarTextoParaBusca(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function criarChaveDoNomeNormalizado(valor: string): string {
  const normalizado = normalizarTextoParaBusca(valor);
  return encodeURIComponent(normalizado).replaceAll("%", "_").slice(0, 500);
}
