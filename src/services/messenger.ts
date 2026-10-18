/** Slack operations the services need. Abstracted so services are testable without Slack. */
export interface Messenger {
  /** Returns the posted message's ts, which identifies its thread. */
  post(channel: string, text: string): Promise<string>;
  notifyAdmin(text: string): Promise<void>;
}
