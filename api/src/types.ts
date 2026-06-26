export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
  durationMinutes: number | null;
}
