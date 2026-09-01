import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import livingRoom from './fixtures/living_room.json';

afterEach(() => {
  vi.resetModules();
  delete process.env.MOVESCAN_DEMO_MODE;
  delete process.env.GEMINI_API_KEY;
});

describe('Gemini demo fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.MOVESCAN_DEMO_MODE = '1';
    delete process.env.GEMINI_API_KEY;
  });

  it('returns fixture inventory without making network requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { analyzeRoom } = await import('./gemini');
    const result = await analyzeRoom([], 'living_room');
    expect(result.demoMode).toBe(true);
    expect(result.analysis.items).toHaveLength(livingRoom.items.length);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('uses a useful fixture for room types without a dedicated fixture', async () => {
    const { analyzeRoom } = await import('./gemini');
    await expect(analyzeRoom([], 'garage')).resolves.toMatchObject({
      demoMode: true,
      analysis: { roomType: 'living_room' },
    });
  });

  it('falls back when the API key is absent outside explicit demo mode', async () => {
    process.env.MOVESCAN_DEMO_MODE = '0';
    delete process.env.GEMINI_API_KEY;
    const { analyzeRoom, refineItem } = await import('./gemini');
    await expect(analyzeRoom([], 'bedroom')).resolves.toMatchObject({ demoMode: true });
    await expect(refineItem([], 'chair', ['armchair'])).resolves.toMatchObject({
      category: 'armchair',
      demoMode: true,
    });
  });
});
