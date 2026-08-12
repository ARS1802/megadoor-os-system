import { describe, expect, it, vi } from "vitest";
import type { DocumentReference } from "firebase/firestore";
import { CriarCandidato } from "@/aplicacao/casosDeUso/CriarCandidato";
import { CriarMaterial } from "@/aplicacao/casosDeUso/CriarMaterial";
import type {
  RepositorioDeCandidatos,
  RepositorioDeMateriais,
} from "@/aplicacao/contratos/Repositorios";
import type { ServidorDeArquivosDaOrdem } from "@/aplicacao/contratos/ServidorDeArquivosDaOrdem";
import { DimensoesDoRolo } from "@/dominio/objetosDeValor";

const referenciaUsuario = { path: "usuarios/designer" } as DocumentReference;

describe("casos de uso dos cadastros", () => {
  it("cria e retorna o Candidato persistido", async () => {
    const criar = vi.fn().mockResolvedValue(undefined);
    const caso = new CriarCandidato({
      gerarReferencia: () => ({ id: "candidato-1" }),
      criar,
    } as unknown as RepositorioDeCandidatos);

    const candidato = await caso.executar({
      nome: "Ana",
      referenciaUsuarioCriador: referenciaUsuario,
    });

    expect(candidato.id).toBe("candidato-1");
    expect(criar).toHaveBeenCalledWith(candidato);
  });

  it("cria Material sem enviar etiqueta quando ela não foi informada", async () => {
    const criarComNomeUnico = vi.fn().mockResolvedValue(undefined);
    const enviarImagemDaEtiquetaDoMaterial = vi.fn();
    const caso = new CriarMaterial(
      {
        gerarReferencia: () => ({ id: "material-1" }),
        criarComNomeUnico,
      } as unknown as RepositorioDeMateriais,
      { enviarImagemDaEtiquetaDoMaterial } as unknown as ServidorDeArquivosDaOrdem,
    );

    const material = await caso.executar({
      nome: "Lona",
      marca: "Megadoor",
      dimensoesDoRolo: new DimensoesDoRolo(106, 5000),
      referenciaUsuarioCriador: referenciaUsuario,
    });

    expect(material.caminhoImagemEtiqueta).toBeUndefined();
    expect(enviarImagemDaEtiquetaDoMaterial).not.toHaveBeenCalled();
    expect(criarComNomeUnico).toHaveBeenCalledWith(material);
  });

  it("remove a etiqueta enviada quando a persistência do Material falha", async () => {
    const removerDiretorioDoMaterial = vi.fn().mockResolvedValue(undefined);
    const caso = new CriarMaterial(
      {
        gerarReferencia: () => ({ id: "material-2" }),
        criarComNomeUnico: vi.fn().mockRejectedValue(new Error("nome duplicado")),
      } as unknown as RepositorioDeMateriais,
      {
        enviarImagemDaEtiquetaDoMaterial: vi
          .fn()
          .mockResolvedValue("materiais/material-2/etiqueta.png"),
        removerDiretorioDoMaterial,
      } as unknown as ServidorDeArquivosDaOrdem,
    );

    await expect(
      caso.executar({
        nome: "Lona",
        marca: "Megadoor",
        dimensoesDoRolo: new DimensoesDoRolo(106, 5000),
        etiqueta: new File(["imagem"], "etiqueta.png", { type: "image/png" }),
        referenciaUsuarioCriador: referenciaUsuario,
      }),
    ).rejects.toThrow("nome duplicado");
    expect(removerDiretorioDoMaterial).toHaveBeenCalledWith("material-2");
  });
});
