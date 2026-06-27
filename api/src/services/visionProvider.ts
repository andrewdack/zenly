import type { FocusStatus, SessionMode } from "../types.js";

export interface FocusImageInput {
  image: Buffer;
  mimeType: string;
  mode: SessionMode;
  task?: string | null;
}

export interface FocusResult {
  status: FocusStatus;
  isFocused: boolean;                 // derived: on_task | ok
  destructiveCategory: string | null; // social | games | gambling | other | null
  confidence: number;
  reason: string;
  provider: string;
  model: string;
}

export interface VisionProvider {
  isFocused(input: FocusImageInput): Promise<FocusResult>;
}
