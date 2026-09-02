import type { Item } from '@/lib/types';

const provenanceLabels: Record<string, string> = {
  'ai:false': 'Identified by AI',
  'ai:true': 'Identified by AI · adjusted by customer',
  'refined:false': 'Identified by AI · verified by second pass',
  'refined:true': 'Identified by AI · verified · adjusted by customer',
  'user_added:false': 'Added by customer',
  'user_added:true': 'Added by customer',
};

export function AuditTrail({ item }: { item: Item }) {
  const key = `${item.source}:${item.editedByUser}`;
  const label = provenanceLabels[key] ?? 'Identified by AI';
  return <p className="mt-1 text-xs text-u-ink-3">{label}</p>;
}
