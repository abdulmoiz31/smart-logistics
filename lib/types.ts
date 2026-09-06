export type SizeClass = 's' | 'm' | 'l';

export type ItemSource = 'ai' | 'refined' | 'user_added';

export type AccessFlag = 'stairs' | 'elevator' | 'long_carry';

export type HandlingFlag = 'fragile' | 'heavy' | 'high_value' | 'disassembly';

export type RoomType =
  | 'living_room'
  | 'bedroom'
  | 'kitchen'
  | 'dining_room'
  | 'bathroom'
  | 'garage'
  | 'basement'
  | 'office'
  | 'other';

export type SessionStatus = 'scanning' | 'reviewing' | 'pending_review' | 'confirmed';
export type QuoteStatus = 'draft' | 'pending_review' | 'confirmed';

export interface BoundingBox {
  image: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Item {
  id: string;
  roomId: string;
  name: string;
  category: string;
  count: number;
  sizeClass: SizeClass;
  cubicFeet: number;
  confidence: number;
  source: ItemSource;
  editedByUser: boolean;
  ambiguousBetween?: string[];
  uncertaintyReason?: string;
  seenInImages?: number[];
  box?: BoundingBox;
}

export interface DetectedItem {
  name: string;
  category: string;
  count: number;
  sizeClass: SizeClass;
  confidence: number;
  ambiguousBetween?: string[];
  uncertaintyReason?: string;
  seenInImages?: number[];
  box?: BoundingBox;
}

export interface RoomAnalysis {
  roomType: RoomType;
  items: DetectedItem[];
}

export interface Room {
  id: string;
  sessionId: string;
  roomType: RoomType;
  accessFlags: AccessFlag[];
  items: Item[];
  capturePaths?: string[];
}

export interface ImageInput {
  base64: string;
  mimeType: string;
}

export interface CatalogueEntry {
  category: string;
  label: string;
  cubicFeet: Record<SizeClass, number>;
  commonIn: RoomType[];
  handling?: HandlingFlag[];
}

export interface RateCard {
  companyName: string;
  perCubicFootCents: number;
  cuftPerCrewHour: number;
  crewHourlyCents: number;
  minimumCents: number;
  accessAdderCents: Record<AccessFlag, number>;
}

export interface QuoteBreakdown {
  totalCubicFeet: number;
  baseCents: number;
  laborCents: number;
  accessCents: number;
  subtotalCents: number;
  tolerance: number;
  lowCents: number;
  highCents: number;
}

export interface Quote {
  id: string;
  sessionId: string;
  breakdown: QuoteBreakdown;
  status: QuoteStatus;
  confirmedCents?: number;
  agentNotes?: string;
  createdAt?: string;
}

export interface QuoteSummary extends Quote {
  roomCount: number;
  itemCount: number;
  /** Derived from rooms already loaded — costs no extra query. */
  totalCubicFeet: number;
  /** Dispatch signals: what about this job changes the truck or the crew. */
  handling: HandlingFlag[];
  /** Who to call. A dispatch queue without contact details is unusable. */
  customerEmail?: string;
}

export interface SessionDetails {
  id: string;
  customerEmail?: string;
  /** Owning account, when the scan was started signed in. */
  userId?: string;
  /** Owning device — set for every browser-created session. */
  deviceId?: string;
  /** Optional name the customer gave this saved scan. */
  label?: string;
  status: SessionStatus;
  rooms: Room[];
  latestQuote?: Quote;
}

/** Just enough of a session to make an authorization decision. */
export interface SessionOwner {
  userId: string | null;
  deviceId: string | null;
}
