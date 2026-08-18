import type { RepositorioDeMateriais } from "@/aplicacao/contratos/Repositorios";

export interface ResultadoRecalculoDosMateriais {
  materiaisVerificados: number;
  materiaisAtualizados: number;
  avisos: string[];
}

export class RecalcularRolosUtilizadosDosMateriais {
  constructor(private readonly materiais: RepositorioDeMateriais) {}

  async executar(): Promise<ResultadoRecalculoDosMateriais> {
    const materiais = await this.materiais.listarAtivos();
    let materiaisAtualizados = 0;
    const avisos: string[] = [];

    for (const material of materiais) {
      try {
        const resultado = await this.materiais.recalcularRolosUtilizados(material.id);
        if (resultado.alterado) materiaisAtualizados += 1;
        avisos.push(...resultado.avisos);
      } catch (falha) {
        const detalhe = falha instanceof Error ? falha.message : "falha desconhecida";
        avisos.push(`Material ${material.nome}: ${detalhe}`);
      }
    }

    return {
      materiaisVerificados: materiais.length,
      materiaisAtualizados,
      avisos,
    };
  }
}
