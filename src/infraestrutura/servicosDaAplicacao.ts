import { CriarOrdemDeServico } from "@/aplicacao/casosDeUso/CriarOrdemDeServico";
import { AjustarContadorDeProducao } from "@/aplicacao/casosDeUso/AjustarContadorDeProducao";
import { ForcarConclusaoDaOrdem } from "@/aplicacao/casosDeUso/ForcarConclusaoDaOrdem";
import { ReenviarArquivoDoProcesso } from "@/aplicacao/casosDeUso/ReenviarArquivoDoProcesso";
import {
  RepositorioDeCandidatosNoFirestore,
  RepositorioDeMateriaisNoFirestore,
  RepositorioDeOrdensNoFirestore,
  RepositorioDeUsuariosNoFirestore,
} from "@/infraestrutura/firebase/RepositoriosFirestore";
import { ServidorDeArquivosFastApi } from "@/infraestrutura/servidor/ServidorDeArquivosFastApi";

let idDoUsuarioAtual: string | null = null;

export function definirIdDoUsuarioParaServidor(id: string | null): void {
  idDoUsuarioAtual = id;
}

export const repositorioDeUsuarios = new RepositorioDeUsuariosNoFirestore();
export const repositorioDeCandidatos = new RepositorioDeCandidatosNoFirestore();
export const repositorioDeMateriais = new RepositorioDeMateriaisNoFirestore();
export const repositorioDeOrdens = new RepositorioDeOrdensNoFirestore();
export const servidorDeArquivos = new ServidorDeArquivosFastApi(() => idDoUsuarioAtual);

export const casosDeUso = {
  criarOrdem: new CriarOrdemDeServico(repositorioDeOrdens, servidorDeArquivos),
  ajustarContador: new AjustarContadorDeProducao(repositorioDeOrdens, servidorDeArquivos),
  forcarConclusao: new ForcarConclusaoDaOrdem(repositorioDeOrdens, servidorDeArquivos),
  reenviarArquivo: new ReenviarArquivoDoProcesso(repositorioDeOrdens, servidorDeArquivos),
};
