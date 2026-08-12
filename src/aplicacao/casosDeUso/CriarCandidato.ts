import type { RepositorioDeCandidatos } from "@/aplicacao/contratos/Repositorios";
import { Candidato } from "@/dominio/entidades/Candidato";

export interface EntradaCriarCandidato {
  nome: string;
  partido?: string;
  documentoFiscal?: Candidato["documentoFiscal"];
  observacoes?: string;
  referenciaUsuarioCriador: Candidato["referenciaUsuarioCriador"];
}

export class CriarCandidato {
  constructor(private readonly repositorio: RepositorioDeCandidatos) {}

  async executar(entrada: EntradaCriarCandidato): Promise<Candidato> {
    const referencia = this.repositorio.gerarReferencia();
    const candidato = new Candidato({ id: referencia.id, ...entrada });
    await this.repositorio.criar(candidato);
    return candidato;
  }
}
