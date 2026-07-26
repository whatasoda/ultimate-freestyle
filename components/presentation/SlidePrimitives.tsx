import type { ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="lead">{children}</p>;
}

export function Accent({ children }: { children: ReactNode }) {
  return <span className="accent-text">{children}</span>;
}

export function Columns({ children }: { children: ReactNode }) {
  return <div className="columns">{children}</div>;
}

export function Card({
  label,
  children
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <section className="card">
      {label ? <p className="card-label">{label}</p> : null}
      {children}
    </section>
  );
}

export function BigNumber({
  value,
  unit,
  children
}: {
  value: string;
  unit?: string;
  children: ReactNode;
}) {
  return (
    <div className="big-number">
      <p>
        <strong>{value}</strong>
        {unit ? <span>{unit}</span> : null}
      </p>
      <small>{children}</small>
    </div>
  );
}
