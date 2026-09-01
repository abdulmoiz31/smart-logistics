import { GoogleGenAI } from '@google/genai';
import livingRoom from './fixtures/living_room.json';
import bedroom from './fixtures/bedroom.json';
import {
  parseRefinement,
  parseRoomAnalysis,
  REFINE_SCHEMA,
  ROOM_ANALYSIS_SCHEMA,
  SchemaError,
} from './schema';
import type { ImageInput, RoomAnalysis, RoomType, SizeClass } from './types';

export const ANALYZE_PROMPT = `You are surveying a home for a moving company.

You are given several photographs of ONE room. They may show the same objects from different angles and distances. Identify every movable household item in the room and return a single consolidated inventory.

Critical rules:
1. The photographs are of the SAME room. If one physical object appears in several photographs, report it ONCE.
2. Count distinct physical objects, never appearances across photographs.
3. Group identical items such as dining chairs and moving boxes into one entry with the total count.
4. Ignore fitted carpet, built-in cabinetry, radiators, light fixtures, doors, windows, and walls.
5. Set confidence below 0.7 when you are unsure of identity, size, or count.
6. Use ambiguousBetween when an item could fit more than one catalogue category.
7. Choose s, m, or l relative to typical items of that type.
8. Infer roomType from the photographs.
9. When you set confidence below 0.7, add "uncertaintyReason": a short plain-English phrase naming what limited you — for example "partly hidden behind the sofa", "only visible from one angle", "could not tell the size". Keep it under 12 words. Do not use it for items you are confident about.

Report honestly. An uncertain item is more useful than a confident guess.

How to count correctly:
Work object by object, not photograph by photograph. For each object you see, ask
whether you have already recorded that same physical object from another angle. Use
position in the room, colour, material, and neighbouring objects to decide.

Worked example. Given three photographs where a grey sofa is visible in the first two
from different angles, and a single armchair appears in the third:
  correct   -> [{ "name": "grey sofa", "count": 1 }, { "name": "armchair", "count": 1 }]
  incorrect -> [{ "name": "grey sofa", "count": 2 }, { "name": "armchair", "count": 1 }]
The sofa is one object photographed twice, not two sofas.

If you cannot tell whether two views show the same object or two similar objects,
record the lower count and set confidence below 0.7.`;

export interface AnalyzeResult {
  analysis: RoomAnalysis;
  demoMode: boolean;
  degraded: boolean;
  modelUsed: string | null;
}

export interface RefineResult {
  category: string;
  sizeClass: SizeClass;
  confidence: number;
  demoMode: boolean;
  degraded: boolean;
}

const TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 1_500;
const fixtures: Partial<Record<RoomType, unknown>> = {
  living_room: livingRoom,
  bedroom,
};

function isDemoMode(): boolean {
  return process.env.MOVESCAN_DEMO_MODE === '1' || !process.env.GEMINI_API_KEY;
}

function fixtureFor(hint?: RoomType): RoomAnalysis {
  return parseRoomAnalysis(fixtures[hint ?? 'living_room'] ?? livingRoom);
}

function client(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
}

function primaryModel(): string {
  return process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
}

function fallbackModel(): string {
  return process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-3.1-flash-lite';
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const QUOTA_PATTERNS = [
  '429', 'resource_exhausted', 'quota', 'rate limit',
  '500', '502', '503', '504', 'timed out', 'unavailable',
];

export function isQuotaError(error: unknown): boolean {
  if (error instanceof SchemaError) return false;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return QUOTA_PATTERNS.some((pattern) => message.includes(pattern));
}

interface CascadeOutcome<T> {
  value: T | null;
  degraded: boolean;
  modelUsed: string | null;
}

async function cascade<T>(
  attempt: (model: string, repair: boolean) => Promise<T>,
): Promise<CascadeOutcome<T>> {
  const primary = primaryModel();

  for (let tryIndex = 0; tryIndex < 2; tryIndex += 1) {
    try {
      return { value: await attempt(primary, tryIndex === 1), degraded: false, modelUsed: primary };
    } catch (error) {
      console.error(`[gemini] ${primary} attempt ${tryIndex + 1} failed`, error);
      if (isQuotaError(error)) break;
      if (tryIndex === 0) await sleep(RETRY_DELAY_MS);
    }
  }

  const fallback = fallbackModel();
  if (fallback && fallback !== primary) {
    try {
      return { value: await attempt(fallback, false), degraded: true, modelUsed: fallback };
    } catch (error) {
      console.error(`[gemini] fallback ${fallback} failed`, error);
    }
  }

  return { value: null, degraded: true, modelUsed: null };
}

async function callGemini(
  model: string,
  prompt: string,
  images: ImageInput[],
  responseJsonSchema: unknown,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await client().models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          ...images.map((image) => ({
            inlineData: { data: image.base64, mimeType: image.mimeType },
          })),
        ],
      }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema,
        temperature: 0.1,
        abortSignal: controller.signal,
      },
    });
    const text = response.text;
    if (!text) throw new SchemaError('Gemini returned no response text');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeRoom(images: ImageInput[], hint?: RoomType): Promise<AnalyzeResult> {
  if (isDemoMode()) {
    return { analysis: fixtureFor(hint), demoMode: true, degraded: false, modelUsed: null };
  }

  const outcome = await cascade(async (model, repair) => parseRoomAnalysis(await callGemini(
    model,
    repair ? `${ANALYZE_PROMPT}\n\nYour previous response was invalid. Reply with only a JSON object matching the schema.` : ANALYZE_PROMPT,
    images,
    ROOM_ANALYSIS_SCHEMA,
  )));

  return outcome.value
    ? { analysis: outcome.value, demoMode: false, degraded: outcome.degraded, modelUsed: outcome.modelUsed }
    : { analysis: fixtureFor(hint), demoMode: true, degraded: true, modelUsed: null };
}

export async function refineItem(
  images: ImageInput[],
  itemName: string,
  candidates: string[],
): Promise<RefineResult> {
  if (isDemoMode()) {
    return { category: candidates[0] ?? 'unknown_item', sizeClass: 'm', confidence: 0.5, demoMode: true, degraded: false };
  }

  const prompt = `Look at photographs of one room and consider only the ${JSON.stringify(itemName)}. Choose the correct category from ${candidates.join(', ') || 'unknown_item'} and judge whether it is s, m, or l. Ignore every other object.`;
  const outcome = await cascade(async (model, repair) => parseRefinement(await callGemini(
    model,
    repair ? `${prompt}\n\nReply with only a JSON object matching the schema.` : prompt,
    images,
    REFINE_SCHEMA,
  )));

  return outcome.value
    ? { ...outcome.value, demoMode: false, degraded: outcome.degraded }
    : { category: candidates[0] ?? 'unknown_item', sizeClass: 'm', confidence: 0.5, demoMode: true, degraded: true };
}
