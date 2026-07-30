export interface BotSession {
  step?: string;
  data?: Record<string, unknown>;
  adminPage?: number;
}

export type SessionContext = {
  session: BotSession;
};
