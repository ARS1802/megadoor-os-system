import { z } from "zod";
import { CargoUsuario, TipoDocumentoFiscal } from "@/dominio/enumeracoes";

export const SENHA_ADMINISTRATIVA = "m6e9g6a9";

export const esquemaCadastro = z
  .strictObject({
    nome: z.string().trim().min(2, "Informe o nome."),
    email: z.email("Informe um e-mail válido."),
    senha: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
    confirmacaoDaSenha: z.string(),
    cargo: z.enum(CargoUsuario),
    senhaAdministrativa: z.string().optional(),
  })
  .check((contexto) => {
    const dados = contexto.value;
    if (dados.senha !== dados.confirmacaoDaSenha) {
      contexto.issues.push({
        code: "custom",
        input: dados.confirmacaoDaSenha,
        path: ["confirmacaoDaSenha"],
        message: "As senhas não coincidem.",
      });
    }
    if (dados.cargo === CargoUsuario.ADMIN && dados.senhaAdministrativa !== SENHA_ADMINISTRATIVA) {
      contexto.issues.push({
        code: "custom",
        input: dados.senhaAdministrativa,
        path: ["senhaAdministrativa"],
        message: "Senha administrativa incorreta.",
      });
    }
  });

export const esquemaFormularioNovaOrdem = z.strictObject({
  candidatoId: z.string().min(1, "Selecione um candidato."),
  materialId: z.string().min(1, "Selecione um material."),
  tiragem: z.coerce.number().int().positive("Informe uma tiragem positiva."),
  quantidadeTotal: z.coerce
    .number()
    .int("A quantidade total deve ser um número inteiro.")
    .positive("Informe uma quantidade total positiva."),
  larguraUnidade: z.coerce.number().positive("Informe uma largura de unidade positiva."),
  alturaUnidade: z.coerce.number().positive("Informe uma altura de unidade positiva."),
  larguraGrade: z.coerce.number().positive("Informe uma largura de grade positiva."),
  alturaGrade: z.coerce.number().positive("Informe uma altura de grade positiva."),
  unidadesPorGrade: z.coerce
    .number()
    .int("As unidades por grade devem ser um número inteiro.")
    .positive("Informe uma quantidade positiva de unidades por grade."),
  observacao: z.string(),
});

export const esquemaFormularioNovoCandidato = z
  .strictObject({
    nome: z.string().trim().min(2, "Informe um nome com ao menos 2 caracteres."),
    partido: z.string().trim(),
    tipoDocumentoFiscal: z.enum(TipoDocumentoFiscal),
    numeroDocumentoFiscal: z.string().trim(),
    observacoes: z.string().trim(),
  })
  .check((contexto) => {
    const numeroInformado = contexto.value.numeroDocumentoFiscal;
    if (!numeroInformado) return;

    const quantidadeDeDigitos = numeroInformado.replace(/\D/g, "").length;
    const quantidadeEsperada =
      contexto.value.tipoDocumentoFiscal === TipoDocumentoFiscal.CPF ? 11 : 14;
    if (quantidadeDeDigitos !== quantidadeEsperada) {
      contexto.issues.push({
        code: "custom",
        input: numeroInformado,
        path: ["numeroDocumentoFiscal"],
        message: `${contexto.value.tipoDocumentoFiscal} deve conter ${quantidadeEsperada} dígitos.`,
      });
    }
  });
