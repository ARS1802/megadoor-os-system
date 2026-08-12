export interface SolicitacaoDeCalculoSha256 {
  arquivo: Blob;
}

export type RespostaDoCalculoSha256 =
  | {
      sucesso: true;
      sha256: string;
    }
  | {
      sucesso: false;
      mensagem: string;
    };
