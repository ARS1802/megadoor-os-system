import { describe, expect, it } from "vitest";
import { Usuario } from "@/dominio/entidades/Usuario";
import { CargoUsuario } from "@/dominio/enumeracoes";

function usuarioComCargo(cargo: CargoUsuario): Usuario {
  return new Usuario({
    id: cargo.toLowerCase(),
    nome: cargo,
    email: `${cargo.toLowerCase()}@teste.local`,
    cargo,
  });
}

describe("permissões do usuário", () => {
  it.each([CargoUsuario.ADMIN, CargoUsuario.DESIGNER, CargoUsuario.MAQUINISTA])(
    "permite que %s opere máquinas",
    (cargo) => {
      expect(usuarioComCargo(cargo).podeOperarMaquina()).toBe(true);
    },
  );

  it("mantém a conclusão forçada exclusiva do Administrador", () => {
    expect(usuarioComCargo(CargoUsuario.ADMIN).podeForcarConclusao()).toBe(true);
    expect(usuarioComCargo(CargoUsuario.DESIGNER).podeForcarConclusao()).toBe(false);
    expect(usuarioComCargo(CargoUsuario.MAQUINISTA).podeForcarConclusao()).toBe(false);
  });

  it("reserva a substituição de arquivos a Designer e Administrador", () => {
    expect(usuarioComCargo(CargoUsuario.ADMIN).podeSubstituirArquivoDeProcesso()).toBe(true);
    expect(usuarioComCargo(CargoUsuario.DESIGNER).podeSubstituirArquivoDeProcesso()).toBe(true);
    expect(usuarioComCargo(CargoUsuario.MAQUINISTA).podeSubstituirArquivoDeProcesso()).toBe(false);
  });
});
