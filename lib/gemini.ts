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

Report honestly. An uncertain item is more useful than a confident guess.`;

export interface AnalyzeResult {
  analysis: RoomAnalysis;
  demoMode: boolean;
}

export interface RefineResult {
  category: string;
  sizeClass: SizeClass;
  confidence: number;
  demoMode: boolean;
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

function modelId(): string {
  return process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function callGemini(
  prompt: string,
  images: ImageInput[],
  responseJsonSchema: unknown,
): Promise<unknown> {
  const response = await Promise.race([
    client().models.generateContent({
      model: modelId(),
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
      },
    }),
    sleep(TIMEOUT_MS).then(() => {
      throw new Error('Gemini request timed out');
    }),
  ]);

  const text = response.text;
  if (!text) throw new SchemaError('Gemini returned no response text');
  return JSON.parse(text);
}

async function retry<T>(request: (repair: boolean) => Promise<T>): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await request(attempt === 1);
    } catch (error) {
      console.error(`Gemini attempt ${attempt + 1} failed`, error);
      if (attempt === 0) await sleep(RETRY_DELAY_MS);
    }
  }
  return null;
}

export async function analyzeRoom(images: ImageInput[], hint?: RoomType): Promise<AnalyzeResult> {
  if (isDemoMode()) {
    return { analysis: fixtureFor(hint), demoMode: true };
  }

  const analysis = await retry(async (repair) => parseRoomAnalysis(await callGemini(
    repair
      ? `${ANALYZE_PROMPT}\n\nYour previous response was invalid. Reply with only a JSON object matching the schema.`
      : ANALYZE_PROMPT,
    images,
    ROOM_ANALYSIS_SCHEMA,
  )));

  return analysis
    ? { analysis, demoMode: false }
    : { analysis: fixtureFor(hint), demoMode: true };
}

export async function refineItem(
  images: ImageInput[],
  itemName: string,
  candidates: string[],
): Promise<RefineResult> {
  const fallback: RefineResult = {
    category: candidates[0] ?? 'unknown_item',
    sizeClass: 'm',
    confidence: 0.5,
    demoMode: true,
  };
  if (isDemoMode()) return fallback;

  const prompt = `Look at photographs of one room and consider only the ${JSON.stringify(itemName)}. Choose the correct category from ${candidates.join(', ') || 'unknown_item'} and judge whether it is s, m, or l. Ignore every other object.`;
  const refinement = await retry(async (repair) => parseRefinement(await callGemini(
    repair ? `${prompt}\n\nReply with only a JSON object matching the schema.` : prompt,
    images,
    REFINE_SCHEMA,
  )));

  return refinement ? { ...refinement, demoMode: false } : fallback;
}
