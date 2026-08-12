import type { DocumentReference } from "firebase/firestore";
import { CargoUsuario } from "@/dominio/enumeracoes";

export interface PropriedadesUsuario {
  id: string;
  nome: string;
  email: string;
  cargo: CargoUsuario;
  ativo?: boolean;
  referenciasOrdensParticipadas?: DocumentReference[];
}

export class Usuario {
  readonly id: string;
  readonly nome: string;
  readonly email: string;
  readonly cargo: CargoUsuario;
  readonly ativo: boolean;
  readonly referenciasOrdensParticipadas: DocumentReference[];

  constructor(propriedades: PropriedadesUsuario) {
    Object.assign(this, {
      ...propriedades,
      nome: propriedades.nome.trim(),
      email: propriedades.email.trim().toLowerCase(),
      ativo: propriedades.ativo ?? true,
      referenciasOrdensParticipadas: propriedades.referenciasOrdensParticipadas ?? [],
    });
  }

  podeOperarMaquina(): boolean {
    return [CargoUsuario.ADMIN, CargoUsuario.DESIGNER, CargoUsuario.MAQUINISTA].includes(
      this.cargo,
    );
  }

  podeCriarOrdem(): boolean {
    return this.cargo === CargoUsuario.DESIGNER || this.cargo === CargoUsuario.ADMIN;
  }

  podeCriarMaterial(): boolean {
    return this.podeCriarOrdem();
  }

  podeCriarCandidato(): boolean {
    return this.podeCriarOrdem();
  }

  podeSubstituirArquivoDeProcesso(): boolean {
    return this.cargo === CargoUsuario.DESIGNER || this.cargo === CargoUsuario.ADMIN;
  }

  podeForcarConclusao(): boolean {
    return this.cargo === CargoUsuario.ADMIN;
  }
}
