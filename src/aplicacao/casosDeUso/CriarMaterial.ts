import type { RepositorioDeMateriais } from "@/aplicacao/contratos/Repositorios";
import type { ServidorDeArquivosDaOrdem } from "@/aplicacao/contratos/ServidorDeArquivosDaOrdem";
import { Material } from "@/dominio/entidades/Material";
import type { DimensoesDoRolo } from "@/dominio/objetosDeValor";

export interface EntradaCriarMaterial {
  nome: string;
  marca: string;
  dimensoesDoRolo: DimensoesDoRolo;
  gramatura?: number;
  etiqueta?: File;
  referenciaUsuarioCriador: Material["referenciaUsuarioCriador"];
}

export class CriarMaterial {
  constructor(
    private readonly repositorio: RepositorioDeMateriais,
    private readonly servidor: ServidorDeArquivosDaOrdem,
  ) {}

  async executar(entrada: EntradaCriarMaterial): Promise<Material> {
    const referencia = this.repositorio.gerarReferencia();
    let caminhoImagemEtiqueta: string | undefined;
    try {
      if (entrada.etiqueta) {
        caminhoImagemEtiqueta = await this.servidor.enviarImagemDaEtiquetaDoMaterial(
          referencia.id,
          entrada.etiqueta,
        );
      }
      const material = new Material({
        id: referencia.id,
        nome: entrada.nome,
        marca: entrada.marca,
        dimensoesDoRolo: entrada.dimensoesDoRolo,
        gramatura: entrada.gramatura,
        caminhoImagemEtiqueta,
        referenciaUsuarioCriador: entrada.referenciaUsuarioCriador,
      });
      await this.repositorio.criarComNomeUnico(material);
      return material;
    } catch (falha) {
      if (caminhoImagemEtiqueta) {
        try {
          await this.servidor.removerDiretorioDoMaterial(referencia.id);
        } catch {
          // A falha original é a que explica por que o Material não foi criado.
        }
      }
      throw falha;
    }
  }
}
