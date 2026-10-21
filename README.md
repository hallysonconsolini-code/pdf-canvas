# PDF Canvas

Leitor de PDF para macOS com anotação livre num canvas infinito.
Roda 100% local: sem conta, sem nuvem, sem telemetria.

Feito com Tauri 2, React, TypeScript e PDF.js.

## Status

- [x] Fase 1: abrir PDF, canvas infinito com pan/zoom, renderização virtualizada
- [x] Fase 2: caneta, marca-texto, borracha, desfazer/refazer, autosave
- [x] Fase 3: notas de texto, formas, seleção por laço, marca-texto no texto
- [ ] Fase 4: exportar PDF, recentes, miniaturas, build final

## Requisitos

- macOS 12+
- Node.js 20+
- Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Xcode Command Line Tools: `xcode-select --install`

## Rodar

```bash
npm install
npm run tauri dev
```

Gerar o app (`src-tauri/target/release/bundle/macos/PDF Canvas.app`):

```bash
npm run tauri build -- --bundles app
```

Abrir um arquivo direto na inicialização:

```bash
open "src-tauri/target/release/bundle/macos/PDF Canvas.app" --args /caminho/arquivo.pdf
```

Modo de desenvolvimento só da interface, no navegador (sem APIs do Tauri):
coloque um PDF em `public/dev-samples/` e abra
`http://localhost:1420/?pdf=/dev-samples/arquivo.pdf` com `npm run dev` rodando.

## Estilo Excalidraw

Desenho e escrita seguem o Excalidraw:

- Formas com traço desenhado à mão (rough.js) e texto na fonte manuscrita
  Excalifont. A caneta usa os mesmos parâmetros do desenho livre do Excalidraw.
- Texto sem caixa: duplo clique em qualquer lugar (com a Seleção) ou T e
  clique. O texto cresce com o conteúdo; Enter quebra a linha; Esc, ⌘↩ ou
  clique fora termina. Redimensionar o texto muda o tamanho da fonte.
- Painel de propriedades à esquerda: cor do traço, fundo, preenchimento
  (hachura, hachura cruzada, sólido), espessura, estilo do traço, desleixo
  (arquiteto, artista, cartunista), bordas, fonte, tamanho, alinhamento e
  opacidade. Vale para o item selecionado e para os próximos itens.
- Depois de desenhar uma forma ou escrever, o app volta para a Seleção com o
  item selecionado. O cadeado (Q) mantém a ferramenta ativa.

## Atalhos

| Ação | Atalho |
|---|---|
| Abrir PDF | ⌘O ou arrastar o arquivo para a janela |
| Mão (pan) | H, ou segurar Espaço |
| Seleção | V ou 1 |
| Retângulo / Losango / Elipse | R ou 2 / D ou 3 / O ou 4 |
| Seta / Linha | A ou 5 / L ou 6 |
| Desenhar (caneta) | P ou 7 |
| Texto | T ou 8, ou duplo clique com a Seleção |
| Marca-texto | M ou 9 (segure Shift para linha reta) |
| Marca-texto no texto do PDF | ⇧M |
| Borracha | E ou 0, ou a ponta de borracha da caneta da mesa digitalizadora |
| Selecionar e copiar texto do PDF | S |
| Manter ferramenta ativa | Q |
| Selecionar tudo | ⌘A |
| Copiar / Recortar / Colar itens | ⌘C / ⌘X / ⌘V (colar texto cria um item de texto) |
| Duplicar | ⌘D, ou Alt + arrastar |
| Mover seleção | Setas (Shift: 10×) |
| Apagar seleção | Delete |
| Limpar seleção / voltar para a Seleção | Esc |
| Desfazer / Refazer | ⌘Z / ⌘⇧Z |
| Mover a vista | Dois dedos no trackpad, Page Up/Down |
| Zoom | Pinça, ⌘ + rolagem, ⌘+ / ⌘− |
| Ajustar à largura | ⌘0 ou clique no valor do zoom |
| Primeira / última página | Home / End |

Formas: Shift faz quadrado/círculo ou ângulos de 15°; Alt desenha a partir do
centro. Na Seleção: clique seleciona (Shift soma), arrastar no vazio desenha o
laço, as 8 alças redimensionam (Shift mantém a proporção).

## Fontes

Excalifont (SIL Open Font License 1.1), do Excalidraw. Veja
`src/assets/fonts/README.md`.

## Arquivos de anotação

- As anotações ficam ao lado do PDF em `<arquivo>.pdf.annotations.json`.
  O PDF original nunca é alterado.
- Salvamento automático 1 s após cada alteração, e também ao fechar a janela ou
  encerrar o app (⌘Q). O indicador "Salvo" fica no canto inferior direito.
- Se a pasta do PDF não permitir gravação, o arquivo vai para
  `~/Library/Application Support/com.hallysonconsolini.pdf-canvas/annotations/`.
- Abrir um PDF sem anotar não cria arquivo nenhum; a posição de leitura fica
  guardada no próprio app.
- Arquivos salvos antes do estilo Excalidraw (versão 1) são convertidos ao
  abrir: notas viram texto livre com as mesmas quebras de linha.
- Se o arquivo de anotações for de outra versão do PDF (ou estiver danificado),
  o app pergunta antes e guarda uma cópia `*.backup-<data>.json`; nada é apagado.
- A cor e a espessura de cada ferramenta são lembradas.

## Notas de arquitetura

- `src/canvas/camera.ts`: conversão mundo ↔ tela. Unidade do mundo = ponto PDF.
- `src/pdf/pageRenderer.ts`: só as páginas visíveis (±1) ficam montadas. Os
  bitmaps são refeitos na resolução da tela quando o zoom para; acima de ~10 MP,
  um bitmap do tamanho da janela mantém o texto nítido em zoom alto.
- `src/canvas/annotationRenderer.ts`: anotações em canvas do tamanho da tela,
  em 3 camadas: marca-texto (multiplicado sobre a página, o texto continua
  legível), tinta e o traço em andamento (desenhar não redesenha os antigos).
  Um índice espacial em grade limita desenho e borracha ao que está por perto.
- `src/model/document.ts`: anotações e histórico de desfazer/refazer (comandos
  inversíveis, ilimitado na sessão).
- Gravação atômica em Rust (`src-tauri/src/sidecar.rs`): grava num arquivo
  temporário e renomeia, então uma queda nunca deixa o JSON pela metade.
- `src/canvas/geometry.ts`: desenho, colisão e transformação de todos os tipos;
  formas via rough.js com as mesmas opções do Excalidraw e semente fixa por
  item (o rabisco não muda ao redesenhar).
- O PDF.js vem do build `legacy`, porque o WebView do macOS ainda não tem
  algumas APIs JS novas usadas pelo build moderno.
