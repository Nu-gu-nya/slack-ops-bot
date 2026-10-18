export type CheckinResult = 'confirmed' | 'already-confirmed' | 'not-target' | 'unknown-thread';

interface Announcement {
  targets: Set<string>;
  confirmed: Set<string>;
}

/**
 * Remembers which users were mentioned in which announcement message, and who
 * has already replied. Kept in memory only (ADR-004): a restart loses the day's
 * state, which is an accepted trade-off for the MVP.
 */
export class CheckinStore {
  private readonly announcements = new Map<string, Announcement>();

  private static key(channel: string, ts: string): string {
    return `${channel}:${ts}`;
  }

  /** Previous days' threads must stop counting as check-ins, so each daily run starts clean. */
  reset(): void {
    this.announcements.clear();
  }

  register(channel: string, ts: string, userIds: readonly string[]): void {
    this.announcements.set(CheckinStore.key(channel, ts), {
      targets: new Set(userIds),
      confirmed: new Set(),
    });
  }

  recordReply(channel: string, threadTs: string, userId: string): CheckinResult {
    const announcement = this.announcements.get(CheckinStore.key(channel, threadTs));
    if (announcement === undefined) {
      return 'unknown-thread';
    }
    if (!announcement.targets.has(userId)) {
      return 'not-target';
    }
    if (announcement.confirmed.has(userId)) {
      return 'already-confirmed';
    }
    announcement.confirmed.add(userId);
    return 'confirmed';
  }
}
