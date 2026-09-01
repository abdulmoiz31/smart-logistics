import { beforeEach, describe, expect, it, vi } from 'vitest';
import livingRoom from './fixtures/living_room.json';

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('demo mode', () => {
  it('serves the fixture without a network call and is not degraded', async () => {
    vi.stubEnv('MOVESCAN_DEMO_MODE', '1');
    vi.stubEnv('GEMINI_API_KEY', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { analyzeRoom } = await import('./gemini');

    const out = await analyzeRoom([], 'living_room');

    expect(out.demoMode).toBe(true);
    expect(out.degraded).toBe(false);
    expect(out.modelUsed).toBeNull();
    expect(out.analysis.items).toHaveLength(livingRoom.items.length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('treats a missing API key as demo mode rather than throwing', async () => {
    vi.stubEnv('MOVESCAN_DEMO_MODE', '0');
    vi.stubEnv('GEMINI_API_KEY', '');
    const { analyzeRoom } = await import('./gemini');
    await expect(analyzeRoom([], 'bedroom')).resolves.toMatchObject({ demoMode: true, degraded: false });
  });
});

describe('error classification', () => {
  it('treats 429, quota, 503, and timeout as quota-ish and everything else as not', async () => {
    const { isQuotaError } = await import('./gemini');
    expect(isQuotaError(new Error('429 Too Many Requests'))).toBe(true);
    expect(isQuotaError(new Error('RESOURCE_EXHAUSTED'))).toBe(true);
    expect(isQuotaError(new Error('503 Service Unavailable'))).toBe(true);
    expect(isQuotaError(new Error('Gemini request timed out'))).toBe(true);
    expect(isQuotaError(new Error('invalid argument'))).toBe(false);
  });

  it('does not classify a SchemaError as a quota error', async () => {
    const { isQuotaError } = await import('./gemini');
    const { SchemaError } = await import('./schema');
    expect(isQuotaError(new SchemaError('items is not an array'))).toBe(false);
  });
});

describe('cascade', () => {
  it('passes an abort signal to Gemini requests', async () => {
    vi.stubEnv('MOVESCAN_DEMO_MODE', '0');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');

    let signal: AbortSignal | undefined;
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        models = {
          generateContent: async ({ config }: { config: { abortSignal?: AbortSignal } }) => {
            signal = config.abortSignal;
            return { text: JSON.stringify({ roomType: 'bedroom', items: [] }) };
          },
        };
      },
    }));

    const { analyzeRoom } = await import('./gemini');
    await analyzeRoom([{ base64: 'x', mimeType: 'image/jpeg' }], 'bedroom');

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  it('escalates to the fallback model on a quota error and reports degraded', async () => {
    vi.stubEnv('MOVESCAN_DEMO_MODE', '0');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_MODEL', 'primary-model');
    vi.stubEnv('GEMINI_FALLBACK_MODEL', 'fallback-model');

    const calls: string[] = [];
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        models = {
          generateContent: async ({ model }: { model: string }) => {
            calls.push(model);
            if (model === 'primary-model') throw new Error('429 RESOURCE_EXHAUSTED');
            return { text: JSON.stringify({ roomType: 'bedroom', items: [] }) };
          },
        };
      },
    }));

    const { analyzeRoom } = await import('./gemini');
    const out = await analyzeRoom([{ base64: 'x', mimeType: 'image/jpeg' }], 'bedroom');

    expect(calls).toEqual(['primary-model', 'fallback-model']);
    expect(out.degraded).toBe(true);
    expect(out.demoMode).toBe(false);
    expect(out.modelUsed).toBe('fallback-model');
  });

  it('retries the primary on a schema error instead of escalating', async () => {
    vi.stubEnv('MOVESCAN_DEMO_MODE', '0');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_MODEL', 'primary-model');
    vi.stubEnv('GEMINI_FALLBACK_MODEL', 'fallback-model');

    const calls: string[] = [];
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        models = {
          generateContent: async ({ model }: { model: string }) => {
            calls.push(model);
            if (calls.length === 1) return { text: 'not json at all' };
            return { text: JSON.stringify({ roomType: 'bedroom', items: [] }) };
          },
        };
      },
    }));

    const { analyzeRoom } = await import('./gemini');
    const out = await analyzeRoom([{ base64: 'x', mimeType: 'image/jpeg' }], 'bedroom');

    expect(calls).toEqual(['primary-model', 'primary-model']);
    expect(out.degraded).toBe(false);
    expect(out.modelUsed).toBe('primary-model');
  });

  it('falls back to the fixture when both models fail', async () => {
    vi.stubEnv('MOVESCAN_DEMO_MODE', '0');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        models = { generateContent: async () => { throw new Error('429 RESOURCE_EXHAUSTED'); } };
      },
    }));

    const { analyzeRoom } = await import('./gemini');
    const out = await analyzeRoom([{ base64: 'x', mimeType: 'image/jpeg' }], 'living_room');

    expect(out.demoMode).toBe(true);
    expect(out.degraded).toBe(true);
    expect(out.modelUsed).toBeNull();
    expect(out.analysis.items.length).toBeGreaterThan(0);
  });
});
