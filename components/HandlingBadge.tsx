import type { HandlingFlag } from '@/lib/types';

const labels: Record<HandlingFlag, string> = {
  fragile: 'Fragile',
  heavy: 'Heavy',
  high_value: 'High value',
  disassembly: 'Disassembly required',
};

const styles: Record<HandlingFlag, string> = {
  fragile: 'bg-c-waiting/10 text-c-waiting border-c-waiting/20',
  heavy: 'bg-u-bg text-u-ink-2 border-u-border',
  high_value: 'bg-c-overdue/10 text-c-overdue border-c-overdue/20',
  disassembly: 'bg-c-accent/10 text-c-accent border-c-accent/20',
};

export function HandlingBadge({ flag }: { flag: HandlingFlag }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${styles[flag]}`}>
      {labels[flag]}
    </span>
  );
}
