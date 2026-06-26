export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

export interface VisionOptions {
  system?: string;
  prompt: string;
  imageBase64: string;
  mediaType?: string;
  maxTokens?: number;
}

export interface LLMProvider {
  name: string;
  chat(opts: ChatOptions): Promise<string>;
  vision(opts: VisionOptions): Promise<string>;
}

export interface Session {
  task: string;
  durationMinutes: number | null; // null = indefinite
  startedAt: number;
}

export interface Stats {
  nudges: number;
  snitches: number;
  lastOnTask: boolean;
}

export interface PhoneState {
  phone: string;
  history: ChatMessage[];
  session: Session | null;
  stats: Stats;
}

export interface ParsedSession {
  task: string;
  durationMinutes: number | null; // null = indefinite
}

export interface JudgeVerdict {
  on_task: boolean;
  confidence: number;
  reason: string;
}
