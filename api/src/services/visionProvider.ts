export interface FocusImageInput {
  image: Buffer;
  mimeType: string;
  task?: string; // optional — when provided, judges focus relative to this specific goal
}

export interface FocusResult {
  isFocused: boolean;
  confidence: number;
  reason: string;
  provider: string;
  model: string;
}

export interface VisionProvider {
  isFocused(input: FocusImageInput): Promise<FocusResult>;
}
