# PDF Canvas

Leitor de PDF para macOS com anotação livre num canvas infinito.
Roda 100% local: sem conta, sem nuvem, sem telemetria.

Feito com Tauri 2, React, TypeScript e PDF.js.

## Status

- [x] Fase 1: abrir PDF, canvas infinito com pan/zoom, renderização virtualizada
- [ ] Fase 2: caneta, marca-texto, borracha, desfazer/refazer, autosave
- [ ] Fase 3: notas de texto, formas, seleção por laço, marca-texto no texto
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

## Atalhos

| Ação | Atalho |
|---|---|
| Abrir PDF | ⌘O ou arrastar o arquivo para a janela |
| Mão (pan) | H, ou segurar Espaço |
| Selecionar texto | V |
| Mover a vista | Dois dedos no trackpad, setas, Page Up/Down |
| Zoom | Pinça, ⌘ + rolagem, ⌘+ / ⌘− |
| Ajustar à largura | ⌘0 ou clique no valor do zoom |
| Primeira / última página | Home / End |

## Arquivos de anotação

A partir da Fase 2, as anotações ficam ao lado do PDF em
`<arquivo>.pdf.annotations.json`. O PDF original nunca é alterado.

## Notas de arquitetura

- `src/canvas/camera.ts`: conversão mundo ↔ tela. Unidade do mundo = ponto PDF.
- `src/pdf/pageRenderer.ts`: só as páginas visíveis (±1) ficam montadas. Os
  bitmaps são refeitos na resolução da tela quando o zoom para; acima de ~10 MP,
  um bitmap do tamanho da janela mantém o texto nítido em zoom alto.
- O PDF.js vem do build `legacy`, porque o WebView do macOS ainda não tem
  algumas APIs JS novas usadas pelo build moderno.
