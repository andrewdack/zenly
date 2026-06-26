export interface FocusImageInput {
  image: Buffer;
  mimeType: string;
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
