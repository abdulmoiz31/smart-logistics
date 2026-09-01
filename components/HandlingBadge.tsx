import type { HandlingFlag } from '@/lib/types';

const labels: Record<HandlingFlag, string> = {
  fragile: 'Fragile',
  heavy: 'Heavy',
  high_value: 'High value',
  disassembly: 'Disassembly required',
};

const styles: Record<HandlingFlag, string> = {
  fragile: 'bg-amber-50 text-amber-800 border-amber-200',
  heavy: 'bg-slate-100 text-slate-700 border-slate-300',
  high_value: 'bg-violet-50 text-violet-800 border-violet-200',
  disassembly: 'bg-sky-50 text-sky-800 border-sky-200',
};

export function HandlingBadge({ flag }: { flag: HandlingFlag }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${styles[flag]}`}>
      {labels[flag]}
    </span>
  );
}
