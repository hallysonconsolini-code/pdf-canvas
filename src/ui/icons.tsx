import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const HandIcon = () => (
  <svg {...base}>
    <path d="M18 11V6a2 2 0 0 0-4 0v5" />
    <path d="M14 10V4a2 2 0 0 0-4 0v6" />
    <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </svg>
);

export const TextCursorIcon = () => (
  <svg {...base}>
    <path d="M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1" />
    <path d="M7 22h1a4 4 0 0 0 4-4v-1" />
    <path d="M7 2h1a4 4 0 0 1 4 4v1" />
  </svg>
);

export const MinusIcon = () => (
  <svg {...base}>
    <path d="M5 12h14" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...base}>
    <path d="M5 12h14M12 5v14" />
  </svg>
);

export const FileIcon = () => (
  <svg {...base} width={28} height={28} strokeWidth={1.5}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);

export const PenIcon = () => (
  <svg {...base}>
    <path d="M12 20h9" />
    <path d="M16.38 3.62a2.12 2.12 0 1 1 3 3L7.37 18.64a2 2 0 0 1-.86.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.86z" />
  </svg>
);

export const HighlighterIcon = () => (
  <svg {...base}>
    <path d="m9 11-6 6v3h9l3-3" />
    <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
  </svg>
);

export const EraserIcon = () => (
  <svg {...base}>
    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
    <path d="M22 21H7" />
    <path d="m5 11 9 9" />
  </svg>
);
