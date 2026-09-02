export interface QuotaError {
  code: 'quota_exceeded';
  authenticated: boolean;
  message: string;
}

export function asQuotaError(status: number, data: unknown): QuotaError | null {
  if (status !== 429 || typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.code !== 'quota_exceeded') return null;
  return {
    code: 'quota_exceeded',
    authenticated: Boolean(record.authenticated),
    message: typeof record.error === 'string' ? record.error : 'Daily limit reached.',
  };
}
