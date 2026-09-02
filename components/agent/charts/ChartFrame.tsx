import { useState, type ReactNode } from 'react';

interface ChartFrameProps {
  title: string;
  description?: string;
  legend?: { label: string; color: string }[];
  children: ReactNode;
  table: ReactNode;
  ariaLabel: string;
}

export function ChartFrame({ title, description, legend, children, table, ariaLabel }: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className="rounded-3xl border border-c-border bg-c-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-c-ink">{title}</h3>
          {description && <p className="mt-1 text-sm text-c-ink-3">{description}</p>}
        </div>
        <button
          type="button"
          aria-pressed={showTable}
          onClick={() => setShowTable((s) => !s)}
          className="rounded-lg border border-c-border px-3 py-1.5 text-xs font-bold text-c-ink-2 transition hover:border-c-border-hi hover:text-c-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-c-accent"
        >
          {showTable ? 'Chart' : 'Table'}
        </button>
      </div>

      {legend && legend.length >= 2 && (
        <ul className="mt-4 flex flex-wrap gap-4">
          {legend.map((entry) => (
            <li key={entry.label} className="flex items-center gap-2 text-sm text-c-ink-2">
              <span className="size-3 rounded-sm" style={{ backgroundColor: entry.color }} aria-hidden />
              {entry.label}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        {showTable ? (
          <div className="text-c-ink">{table}</div>
        ) : (
          <div role="img" aria-label={ariaLabel}>
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
