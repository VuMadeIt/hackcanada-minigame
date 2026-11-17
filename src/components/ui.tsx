import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { spriteUrl } from "./sprites";

export function Icon({ name, size = 32, className = "" }: { name: string; size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={spriteUrl(name)} alt="" draggable={false} className={`icon ${className}`} style={{ width: size, height: size }} />;
}

type Tone = "wood" | "green" | "red" | "gold" | "blue";

export function PxButton({ tone = "wood", className = "", children, ref, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; children: ReactNode; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button ref={ref} className={`px-btn px-${tone} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Panel({ title, onClose, children, className = "" }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  return (
    <aside className={`panel ${className}`} role="dialog" aria-label={title}>
      <header className="panel-head">
        <h2>{title}</h2>
        <button className="panel-x" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <div className="panel-body">{children}</div>
    </aside>
  );
}
