import { ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-3xl border border-white/10 bg-zinc-950/55 shadow-soft backdrop-blur", className)}>
      {children}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function Button({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "rounded-2xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-[0_12px_34px_rgba(251,191,36,0.2)] transition hover:-translate-y-0.5 hover:bg-amber-300 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/15 disabled:opacity-50",
        props.className
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-28 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/15 disabled:opacity-50",
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-zinc-50 outline-none transition focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/15 disabled:opacity-50",
        props.className
      )}
    />
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border border-white/10 bg-white/7 px-2.5 py-1 text-xs text-zinc-200", className)}>
      {children}
    </span>
  );
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="space-y-2">
      {eyebrow ? <div className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/80">{eyebrow}</div> : null}
      <div className="text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">{title}</div>
      {children ? <div className="max-w-2xl text-sm leading-6 text-zinc-400">{children}</div> : null}
    </div>
  );
}
