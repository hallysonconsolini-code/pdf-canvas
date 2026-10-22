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

export const LassoIcon = () => (
  <svg {...base}>
    <path d="M7 22a5 5 0 0 1-2-4" />
    <path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1" />
    <path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
  </svg>
);

export const TextIcon = () => (
  <svg {...base}>
    <path d="M4 7V5h16v2" />
    <path d="M12 5v14" />
    <path d="M9 19h6" />
  </svg>
);

export const ArrowIcon = () => (
  <svg {...base}>
    <path d="M5 19 19 5" />
    <path d="M10 5h9v9" />
  </svg>
);

export const RectIcon = () => (
  <svg {...base}>
    <rect x="4" y="5" width="16" height="14" rx="1.5" />
  </svg>
);

export const EllipseIcon = () => (
  <svg {...base}>
    <ellipse cx="12" cy="12" rx="9" ry="7" />
  </svg>
);

export const DiamondIcon = () => (
  <svg {...base}>
    <path d="M12 3 21 12 12 21 3 12z" />
  </svg>
);

export const LineIcon = () => (
  <svg {...base}>
    <path d="M5 19 19 5" />
  </svg>
);

export const LockIcon = ({ locked }: { locked: boolean }) => (
  <svg {...base}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d={locked ? "M8 11V7a4 4 0 0 1 8 0v4" : "M8 11V7a4 4 0 0 1 7.5-2"} />
  </svg>
);

export const TrashIcon = () => (
  <svg {...base}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

export const CopyIcon = () => (
  <svg {...base}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);

/** Small 24×24 previews for the properties panel options. */
export const Glyph = ({ children }: { children: React.ReactNode }) => (
  <svg {...base} width={20} height={20}>
    {children}
  </svg>
);

export const SunIcon = () => (
  <svg {...base} width={16} height={16}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

export const MoonIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
  </svg>
);

export const SystemIcon = () => (
  <svg {...base} width={16} height={16}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
  </svg>
);
