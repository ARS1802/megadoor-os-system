# Empacotamento Windows

Esta pasta contém o instalador por usuário do Megadoor, compilado com Inno Setup 7.1.0 x64.

## Contrato do payload

Antes de compilar, o processo de release deve montar `payload/` com:

- `app/index.html` e todos os assets produzidos pelo Vite;
- `bin/Megadoor.exe`;
- `runtime/node.exe` e os arquivos da distribuição privada do Node;
- `server/static-server.mjs`;
- `assets/megadoor-icon.ico` e `assets/megadoor-icon.svg`;
- `THIRD-PARTY-NOTICES.txt`, gerado das dependências de produção;
- `payload-manifest.json`;
- `files.sha256`.

O `payload-manifest.json` deve declarar, no mínimo:

```json
{
  "schemaVersion": 1,
  "application": {
    "id": "br.com.megadoor.os",
    "name": "Megadoor",
    "version": "1.0.0"
  },
  "source": {
    "repository": "<valor de repository.url em distribution.config.json>",
    "tag": "v1.0.0",
    "commit": "<SHA completo da release>"
  },
  "platform": "windows-x64",
  "runtime": {
    "name": "node",
    "version": "24.19.0"
  },
  "firebase": {
    "projectId": "megadoor-os-system"
  },
  "configurationSchemaVersion": 1,
  "files": [
    {
      "path": "app/index.html",
      "size": 543,
      "sha256": "<SHA-256 do arquivo>"
    }
  ]
}
```

As constantes não devem ser editadas no `.iss`. A fonte única é `../distribution.config.json`:

```bash
MEGADOOR_RELEASE_COMMIT="$(git rev-parse HEAD)" \
  node packaging/windows/generate-inno-constants.mjs
```

O gerador recusa um worktree sujo em uma release oficial. Para uma validação local sem publicar artefatos, use `MEGADOOR_ALLOW_DIRTY_RELEASE=1`.

## Build completo

```bash
MEGADOOR_ISCC='/caminho/para/Inno Setup 7/ISCC.exe' \
MEGADOOR_INNO_INSTALLER_PATH='/caminho/para/innosetup-7.1.0-x64.exe' \
MEGADOOR_INNO_LICENSE_CONFIRMED=SIM \
  packaging/windows/build-release.sh
```

O script compila o Vue em modo `REAL`, monta um payload novo, compila o launcher, baixa e valida o Node privado, gera os manifests e compila o `Setup.exe`. Ele reutiliza o SVG e o ICO versionados, portanto Inkscape e ImageMagick não são dependências do build. O gerador visual separado existe somente para uma mudança intencional no desenho. O script nunca publica a release automaticamente.

Uma release oficial exige worktree limpo, tag apontando para o commit e confirmação explícita de licenciamento. Uma construção local pode ser feita com `MEGADOOR_ALLOW_DIRTY_RELEASE=1`.

Para executar apenas a validação estática:

```bash
node packaging/windows/validate-installer.mjs
```

A compilação oficial usa exatamente Inno Setup 7.1.0 x64. O SHA-256 do instalador do compilador está fixado em `distribution.config.json`.

Quando `MEGADOOR_INNO_INSTALLER_PATH` é informado, o build verifica esse hash antes de usar o `ISCC.exe`. O pipeline oficial deve sempre informar essa variável; a execução local pode usar uma instalação já existente e previamente verificada.

```powershell
& 'C:\Program Files (x86)\Inno Setup 7\ISCC.exe' `
  'packaging\windows\Megadoor.iss'
```

O Inno Setup solicita que usuários comerciais adquiram uma licença comercial. Confirme esse licenciamento antes da distribuição do produto.

Instalações silenciosas precisam informar o servidor explicitamente ou manter uma configuração anterior:

```powershell
.\Megadoor-Setup-1.0.0-windows-x64.exe `
  /VERYSILENT /SERVERIP=192.168.1.20 /SERVERPORT=8443
```

Os valores passam pela mesma validação IPv4/porta da interface. Nenhum IP de teste fica gravado no instalador.

Por segurança, a desinstalação silenciosa preserva os dados locais. Para um teste automatizado que também precise remover configuração, logs e a identidade da instalação:

```powershell
.\unins000.exe /VERYSILENT /REMOVEDATA=1
```

`/REMOVEDATA` aceita somente `0` ou `1`.

## Comportamento

- instala sem UAC em `%LOCALAPPDATA%\Programs\Megadoor`;
- exige Windows 10 22H2 (`10.0.19045`) ou Windows 11 x64; o launcher usa .NET Framework 4.8, presente nesses ambientes suportados;
- cria atalhos no menu Iniciar e, opcionalmente, no Desktop conhecido pelo Windows;
- grava a configuração fora do payload versionado, em `%LOCALAPPDATA%\Megadoor\config`;
- valida o build, o payload e o runtime durante a criação da release;
- valida a conectividade Firebase antes da cópia e os hashes de cada arquivo instalado depois da extração;
- testa a FastAPI sem impedir a instalação quando ela está offline;
- usa Restart Manager para detectar `Megadoor.exe` e o `node.exe` privado bloqueados;
- solicita primeiro o encerramento cooperativo do launcher por `Megadoor.exe --shutdown`, sem finalizar processos Node globais;
- preserva configuração e logs em reinstalações;
- reutiliza um `InstallationId` persistente quando os dados locais são preservados;
- mantém preferências da tela Configurações quando o endereço do instalador não mudou e aplica o novo endereço quando ele for alterado no assistente;
- pergunta se os dados locais devem ser preservados durante a desinstalação;
- usa o desinstalador nativo do Inno, que realiza seu próprio self-delete.

O navegador armazena sessão, tema e preferências por origem HTTP, fora do diretório controlado pelo Inno. Quando `/REMOVEDATA=1` remove a identidade da instalação, a instalação seguinte recebe outro `InstallationId`; no primeiro bootstrap, o Vue limpa os dados da origem anterior e encerra a sessão Firebase antes de carregar as telas. Se os dados forem preservados, o mesmo identificador é reutilizado e essas preferências permanecem.

## Limite da primeira versão

O Inno Setup repara e atualiza os arquivos no mesmo diretório e preserva a configuração externa, mas não fornece uma transação de diretório com troca atômica de versão. Se uma atualização for interrompida depois do começo da cópia, o mesmo `Setup.exe` deve ser executado novamente para reparar a instalação. Um esquema futuro de versões lado a lado exigirá alterar em conjunto o launcher e o layout do payload.

## Assinatura do Windows

O artefato criado localmente não possui assinatura Authenticode. Por isso, SmartScreen ou Microsoft Defender podem exibir alertas mesmo quando o SHA-256 está correto. Antes de uma release pública, o pipeline deve assinar `Megadoor.exe` e o `Setup.exe` com um certificado confiável, aplicar timestamp e verificar as assinaturas produzidas. Nenhum certificado ou segredo de assinatura deve ser armazenado neste repositório.

O payload inclui `THIRD-PARTY-NOTICES.txt`, com inventário e textos das licenças das dependências npm distribuídas, além da licença própria do runtime Node.
