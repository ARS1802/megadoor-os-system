import type { RouteLocationRaw } from "vue-router";
import { CargoUsuario } from "@/dominio/enumeracoes";

export function destinoInicialDoCargo(cargo: CargoUsuario): RouteLocationRaw {
  if (cargo === CargoUsuario.ADMIN) return { name: "resumoAdministrativo" };
  if (cargo === CargoUsuario.DESIGNER) return { name: "painelDesigner" };
  return { name: "painelMaquinista" };
}
