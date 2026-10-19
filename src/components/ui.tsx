import clsx from "clsx";
import { AudioLines, Box, Clapperboard, File, FileCode, Image as ImageIcon, Type, X } from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Kind } from "../types";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-accent text-accent-fg hover:enabled:bg-accent-hover",
        variant === "secondary" && "border border-border-strong bg-surface text-fg hover:enabled:bg-surface-hover",
        variant === "ghost" && "text-fg hover:enabled:bg-surface-hover",
        variant === "danger" && "border border-danger/50 bg-surface text-danger hover:enabled:bg-danger/10",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-fg disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

const kindIcon: Record<Kind, typeof ImageIcon> = {
  image: ImageIcon,
  audio: AudioLines,
  model: Box,
  font: Type,
  video: Clapperboard,
  text: FileCode,
  other: File,
};

/** Kind tints from the design system: image=info, audio=warn, model=accent, font=fg, video=danger, text/other=muted. */
export const kindTint: Record<Kind, string> = {
  image: "text-info",
  audio: "text-warn",
  model: "text-accent",
  font: "text-fg",
  video: "text-danger",
  text: "text-muted",
  other: "text-muted",
};

export function KindIcon({ kind, className }: { kind: Kind; className?: string }) {
  const Icon = kindIcon[kind];
  return <Icon aria-hidden className={clsx("shrink-0", kindTint[kind], className)} />;
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      tabIndex={-1}
      className="size-4 cursor-pointer rounded accent-[var(--accent)]"
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-px font-mono text-[11px] text-muted">
      {children}
    </kbd>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("[data-autofocus], button, input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>("button, input, a[href], [tabindex='0']")].filter(
          (el) => !el.hasAttribute("disabled"),
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx(
          "flex max-h-[85vh] w-full flex-col rounded-lg border border-border-strong bg-surface shadow-2xl",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 id="modal-title" className="text-base font-semibold">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
