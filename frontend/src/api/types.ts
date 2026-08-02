// Types mirror the FastAPI Pydantic schemas (app/schemas.py).

export interface Service {
  id: string;
  name: string;
  duration_min: number;
  price: number | null;
  description: string | null;
}

export interface Business {
  id: string;
  name: string;
  industry: string | null;
  timezone: string;
  language: string;
  greeting: string;
  system_prompt: string | null;
  agent_type: string;
  owner_phone: string | null;
  owner_email: string | null;
  hours: Record<string, [string, string] | null>;
  booking_buffer_min: number;
  max_bookings_per_day: number;
  google_calendar_id: string | null;
  voice_id: string;
  escalation_threshold: number;
  phone_number: string | null;
  onboarding_complete: boolean;
  agent_live: boolean;
  is_demo: boolean;
  services: Service[];
  created_at: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  industry: string | null;
  language: string;
  agent_live: boolean;
  is_demo: boolean;
  phone_number: string | null;
  created_at: string;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  source: string;
  created_at: string;
}

export interface TranscriptTurn {
  id: string;
  seq: number;
  role: "caller" | "agent";
  text: string;
  start_ms: number;
  confidence: number | null;
  intent: string | null;
}

export interface CallMessage {
  id: string;
  caller_name: string | null;
  caller_number: string | null;
  body: string;
  delivered: boolean;
  created_at: string;
}

export interface CallSummary {
  id: string;
  caller_number: string | null;
  source: string;
  status: string;
  outcome: string | null;
  summary: string | null;
  sentiment: string | null;
  duration_sec: number;
  started_at: string | null;
  created_at: string;
}

export interface CallDetail extends CallSummary {
  turns: TranscriptTurn[];
  messages: CallMessage[];
  recording_url: string | null;
}

export interface Booking {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  service_name: string;
  start_at: string;
  duration_min: number;
  notes: string | null;
  status: string;
  call_id: string | null;
  created_at: string;
}

export interface DashboardStats {
  calls_today: number;
  calls_week: number;
  bookings_today: number;
  bookings_week: number;
  messages_pending: number;
  escalations_week: number;
  resolution_rate: number;
  avg_duration_sec: number;
  agent_live: boolean;
}

export interface TimePoint {
  label: string;
  value: number;
}

export interface OutcomeSlice {
  outcome: string;
  count: number;
}

export interface Analytics {
  volume_by_day: TimePoint[];
  calls_by_hour: TimePoint[];
  outcomes: OutcomeSlice[];
  resolution_rate: number;
  total_calls: number;
  total_bookings: number;
}

export interface ProviderStatus {
  kind: "stt" | "tts" | "llm" | "embedding";
  provider: string;
  mode: "open-source" | "free-api" | "paid" | "mock";
  available: boolean;
  detail: string;
}

export interface Health {
  status: string;
  version: string;
  environment: string;
  providers: ProviderStatus[];
}

export interface SimulateTurnResult {
  call_id: string;
  reply: string;
  intent: string;
  confidence: number;
  outcome: string | null;
  audio_url: string | null;
  escalated: boolean;
}
