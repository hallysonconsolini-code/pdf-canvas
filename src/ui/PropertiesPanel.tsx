import type { CSSProperties, ReactNode } from "react";
import { fontStack } from "../canvas/geometry";
import { BACKGROUND_COLORS, COLOR_IDS, HIGHLIGHT_COLORS, PEN_COLORS, WIDTH_IDS } from "../canvas/strokes";
import type {
  Annotation,
  ColorId,
  Edges,
  FillStyle,
  FontFamily,
  FontSizeId,
  ItemStyle,
  Sloppiness,
  StrokeStyle,
  TextAlign,
  ToolId,
  WidthId,
} from "../model/types";
import { CopyIcon, Glyph, TrashIcon } from "./icons";
import type { HighlighterStyle } from "./useItemStyle";

interface Props {
  tool: ToolId;
  selected: Annotation[];
  style: ItemStyle;
  highlighter: HighlighterStyle;
  onStyle(patch: Partial<ItemStyle>): void;
  onHighlighter(patch: Partial<HighlighterStyle>): void;
  onTool(tool: ToolId): void;
  onDuplicate(): void;
  onDelete(): void;
}

type Kind = "pen" | "shape" | "fillable" | "rect" | "text" | "highlight";

const COLOR_NAMES: Record<ColorId, string> = {
  black: "Preto",
  red: "Vermelho",
  blue: "Azul",
  green: "Verde",
  yellow: "Amarelo",
  pink: "Rosa",
};

/** What the panel edits: the selected items, or the active tool's next item. */
function kindsOf(tool: ToolId, selected: Annotation[]): Set<Kind> {
  const types = selected.length ? selected.map((a) => a.type) : [tool];
  const kinds = new Set<Kind>();
  for (const t of types) {
    if (t === "pen") kinds.add("pen");
    if (t === "text") kinds.add("text");
    if (t === "highlighter" || t === "text-highlight") kinds.add("highlight");
    if (t === "rect" || t === "ellipse" || t === "diamond" || t === "arrow" || t === "line") kinds.add("shape");
    if (t === "rect" || t === "ellipse" || t === "diamond") kinds.add("fillable");
    if (t === "rect") kinds.add("rect");
  }
  return kinds;
}

/** Excalidraw-style properties panel, docked on the left. */
export function PropertiesPanel(props: Props) {
  const { tool, selected, style, highlighter, onStyle, onHighlighter } = props;
  const kinds = kindsOf(tool, selected);
  const highlightOnly = kinds.size === 1 && kinds.has("highlight");
  const stroked = kinds.has("pen") || kinds.has("shape") || kinds.has("text");
  if (!stroked && !kinds.has("highlight")) return null;

  // Show the first selected item's values (Excalidraw shows the common one).
  const first = selected[0] as (Annotation & Partial<Record<string, unknown>>) | undefined;
  const value = <K extends keyof ItemStyle>(key: K): ItemStyle[K] => {
    if (first && key in first) return first[key] as unknown as ItemStyle[K];
    return style[key];
  };
  const fontSizeValue = (): FontSizeId => {
    if (first?.type === "text") {
      const sizes: [FontSizeId, number][] = [["s", 16], ["m", 20], ["l", 28], ["xl", 36]];
      return sizes.reduce((best, s) => (Math.abs(s[1] - first.fontSize) < Math.abs(best[1] - first.fontSize) ? s : best))[0];
    }
    return style.fontSize;
  };

  return (
    <aside className="properties" aria-label="Propriedades">
      {highlightOnly && (
        <>
          <Section title="Modo">
            <div className="segmented">
              <button role="radio" aria-checked={tool === "highlighter"} onClick={() => props.onTool("highlighter")}>
                Livre
              </button>
              <button role="radio" aria-checked={tool === "text-highlight"} onClick={() => props.onTool("text-highlight")}>
                No texto
              </button>
            </div>
          </Section>
          <Section title="Cor">
            <Swatches palette={HIGHLIGHT_COLORS} value={highlighter.color} onChange={(color) => color && onHighlighter({ color })} />
          </Section>
          {tool !== "text-highlight" && (
            <Section title="Espessura">
              <Options<WidthId>
                value={highlighter.width}
                onChange={(width) => onHighlighter({ width })}
                options={WIDTH_IDS.map((w, i) => ({ value: w, label: ["Fino", "Médio", "Grosso"][i], icon: <WidthGlyph w={[3, 6, 10][i]} /> }))}
              />
            </Section>
          )}
        </>
      )}

      {stroked && (
        <Section title="Traço">
          <Swatches palette={PEN_COLORS} value={value("color")} onChange={(color) => color && onStyle({ color })} />
        </Section>
      )}

      {kinds.has("fillable") && (
        <Section title="Fundo">
          <Swatches
            palette={BACKGROUND_COLORS}
            value={value("fill")}
            transparent
            onChange={(fill) => onStyle({ fill })}
          />
        </Section>
      )}

      {kinds.has("fillable") && value("fill") && (
        <Section title="Preenchimento">
          <Options<FillStyle>
            value={value("fillStyle")}
            onChange={(fillStyle) => onStyle({ fillStyle })}
            options={[
              { value: "hachure", label: "Hachura", icon: <Glyph><path d="M5 19 19 5M5 13l8-8M11 19l8-8" /></Glyph> },
              { value: "cross-hatch", label: "Hachura cruzada", icon: <Glyph><path d="M5 19 19 5M5 13l8-8M11 19l8-8M5 5l14 14M5 11l8 8M11 5l8 8" /></Glyph> },
              { value: "solid", label: "Sólido", icon: <Glyph><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /></Glyph> },
            ]}
          />
        </Section>
      )}

      {(kinds.has("pen") || kinds.has("shape")) && (
        <Section title="Espessura do traço">
          <Options<WidthId>
            value={value("width")}
            onChange={(width) => onStyle({ width })}
            options={WIDTH_IDS.map((w, i) => ({ value: w, label: ["Fino", "Negrito", "Extra negrito"][i], icon: <WidthGlyph w={[1.5, 3, 5][i]} /> }))}
          />
        </Section>
      )}

      {kinds.has("shape") && (
        <>
          <Section title="Estilo do traço">
            <Options<StrokeStyle>
              value={value("strokeStyle")}
              onChange={(strokeStyle) => onStyle({ strokeStyle })}
              options={[
                { value: "solid", label: "Sólido", icon: <Glyph><path d="M4 12h16" /></Glyph> },
                { value: "dashed", label: "Tracejado", icon: <Glyph><path d="M4 12h4M10 12h4M16 12h4" /></Glyph> },
                { value: "dotted", label: "Pontilhado", icon: <Glyph><path d="M4 12h.5M8 12h.5M12 12h.5M16 12h.5M20 12h.5" /></Glyph> },
              ]}
            />
          </Section>
          <Section title="Desleixo">
            <Options<Sloppiness>
              value={value("roughness")}
              onChange={(roughness) => onStyle({ roughness })}
              options={[
                { value: 0, label: "Arquiteto", icon: <Glyph><path d="M4 16c4-6 12-6 16-2" /></Glyph> },
                { value: 1, label: "Artista", icon: <Glyph><path d="M4 16c3-5 6-7 9-4s5 2 7-1" /></Glyph> },
                { value: 2, label: "Cartunista", icon: <Glyph><path d="M4 17c2-4 3-8 6-5s2 5 4 2 4-6 6-3" /></Glyph> },
              ]}
            />
          </Section>
        </>
      )}

      {kinds.has("rect") && (
        <Section title="Bordas">
          <Options<Edges>
            value={value("edges")}
            onChange={(edges) => onStyle({ edges })}
            options={[
              { value: "sharp", label: "Retas", icon: <Glyph><path d="M6 18V6h12" /></Glyph> },
              { value: "round", label: "Arredondadas", icon: <Glyph><path d="M6 18v-6a6 6 0 0 1 6-6h6" /></Glyph> },
            ]}
          />
        </Section>
      )}

      {kinds.has("text") && (
        <>
          <Section title="Fonte">
            <Options<FontFamily>
              value={value("fontFamily")}
              onChange={(fontFamily) => onStyle({ fontFamily })}
              options={[
                { value: "hand", label: "Manuscrita", icon: <span className="font-glyph" style={{ fontFamily: fontStack("hand") }}>Aa</span> },
                { value: "normal", label: "Normal", icon: <span className="font-glyph" style={{ fontFamily: fontStack("normal") }}>Aa</span> },
                { value: "code", label: "Código", icon: <span className="font-glyph" style={{ fontFamily: fontStack("code") }}>Aa</span> },
              ]}
            />
          </Section>
          <Section title="Tamanho da fonte">
            <Options<FontSizeId>
              value={fontSizeValue()}
              onChange={(fontSize) => onStyle({ fontSize })}
              options={(["s", "m", "l", "xl"] as FontSizeId[]).map((s, i) => ({
                value: s,
                label: ["Pequeno", "Médio", "Grande", "Muito grande"][i],
                icon: <span className="font-glyph">{["P", "M", "G", "GG"][i]}</span>,
              }))}
            />
          </Section>
          <Section title="Alinhamento">
            <Options<TextAlign>
              value={value("textAlign")}
              onChange={(textAlign) => onStyle({ textAlign })}
              options={[
                { value: "left", label: "Esquerda", icon: <Glyph><path d="M4 6h16M4 12h10M4 18h13" /></Glyph> },
                { value: "center", label: "Centro", icon: <Glyph><path d="M4 6h16M7 12h10M5.5 18h13" /></Glyph> },
                { value: "right", label: "Direita", icon: <Glyph><path d="M4 6h16M10 12h10M7 18h13" /></Glyph> },
              ]}
            />
          </Section>
        </>
      )}

      {stroked && (
        <Section title="Opacidade">
          <input
            className="opacity"
            type="range"
            min={10}
            max={100}
            step={10}
            value={value("opacity") ?? 100}
            aria-label="Opacidade"
            onChange={(e) => onStyle({ opacity: Number(e.target.value) })}
          />
        </Section>
      )}

      {selected.length > 0 && (
        <Section title="Ações">
          <div className="options">
            <button className="option" aria-label="Duplicar" data-tip="Duplicar (⌘D)" onClick={props.onDuplicate}>
              <CopyIcon />
            </button>
            <button className="option" aria-label="Apagar" data-tip="Apagar (Delete)" onClick={props.onDelete}>
              <TrashIcon />
            </button>
          </div>
        </Section>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="prop-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Swatches({
  palette,
  value,
  onChange,
  transparent,
}: {
  palette: Record<ColorId, string>;
  value: ColorId | null;
  onChange(color: ColorId | null): void;
  transparent?: boolean;
}) {
  return (
    <div className="swatches" role="radiogroup">
      {transparent && (
        <button
          role="radio"
          aria-checked={value === null}
          aria-label="Transparente"
          data-tip="Transparente"
          className="swatch swatch-transparent"
          onClick={() => onChange(null)}
        />
      )}
      {COLOR_IDS.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={value === c}
          aria-label={COLOR_NAMES[c]}
          data-tip={COLOR_NAMES[c]}
          className="swatch"
          style={{ "--swatch": palette[c] } as CSSProperties}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function Options<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon: ReactNode }[];
  onChange(value: T): void;
}) {
  return (
    <div className="options" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.label}
          data-tip={o.label}
          className="option"
          onClick={() => onChange(o.value)}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

function WidthGlyph({ w }: { w: number }) {
  return (
    <Glyph>
      <path d="M5 12h14" strokeWidth={w} />
    </Glyph>
  );
}
