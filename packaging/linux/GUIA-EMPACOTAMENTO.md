# Empacotamento Linux do Megadoor

Distribuição secundária por usuário para Ubuntu, Linux Mint e outras distribuições Debian-based
em arquitetura `x86_64`. O instalador não usa `sudo`, não altera o `PATH` e transporta um runtime
Node privado.

## Montagem da release

Na raiz do frontend:

```bash
npm run build:linux
```

O script compila o Vue, baixa a versão exata do Node declarada em
`packaging/distribution.config.json`, confirma seu SHA-256 e cria artefatos em `release/linux/`.
O pacote também inclui `THIRD-PARTY-NOTICES.txt`, gerado das dependências npm de produção, e a
licença do runtime Node.

## Instalação

Depois de extrair `Megadoor-Installer-<versão>-linux-x64.tar.xz`:

```bash
./installer/Instalar-Megadoor.sh
```

Modo não interativo:

```bash
./installer/Instalar-Megadoor.sh \
  --server-ip <IP_DO_SERVIDOR> \
  --server-port 8443 \
  --non-interactive
```

A aplicação é instalada em `${XDG_DATA_HOME:-$HOME/.local/share}/megadoor`, com configuração e
estado nos diretórios XDG correspondentes. Um `.desktop` com `Terminal=false` é criado no menu de
aplicativos. Um atalho adicional no Desktop só é criado quando solicitado e quando
`xdg-user-dir DESKTOP` retorna um diretório válido.

## Desinstalação

```bash
megadoor-uninstall --keep-data
megadoor-uninstall --remove-data
```

Sem opção, o desinstalador pergunta em terminal e preserva os dados quando não há entrada
interativa. Ele remove somente atalhos associados ao identificador da instalação e recusa uma raiz
diferente do diretório XDG esperado.

## Validação segura

```bash
npm run test:packaging:linux
```

Os testes usam um `$HOME` e diretórios XDG temporários. Eles não escrevem na configuração real do
usuário, não usam `sudo`, não abrem navegador e não acessam a FastAPI.
