type MessageLike = {
  role: string;
  text?: string;
  sentAt?: string;
};

export function getConversationIndexId(uid: string, chatId: string): string {
  return `${uid}__${chatId}`;
}

export function toIsoStringIfPossible(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  if (typeof value === 'number') {
    const asMs = value < 10_000_000_000 ? value * 1000 : value;
    const parsed = new Date(asMs);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  if (value instanceof Date) return value.toISOString();

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as {toDate?: unknown}).toDate === 'function'
  ) {
    try {
      const date = (value as {toDate: () => Date}).toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    } catch {
      return undefined;
    }
  }

  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as {
      seconds?: unknown;
      nanoseconds?: unknown;
      _seconds?: unknown;
      _nanoseconds?: unknown;
    };
    const rawSeconds = maybeTimestamp.seconds ?? maybeTimestamp._seconds;
    const rawNanoseconds = maybeTimestamp.nanoseconds ?? maybeTimestamp._nanoseconds;
    if (typeof rawSeconds === 'number') {
      const nanos = typeof rawNanoseconds === 'number' ? rawNanoseconds : 0;
      const parsed = new Date(rawSeconds * 1000 + Math.floor(nanos / 1_000_000));
      return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
    }
  }

  return undefined;
}

export function getValidDate(isoString?: string): Date | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateShort(isoString?: string): string {
  const date = getValidDate(isoString);
  if (!date) return '--';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatTimeShort(isoString?: string): string {
  const date = getValidDate(isoString);
  if (!date) return '--';

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function isLikelyDuplicateMessage(
  a: Pick<MessageLike, 'role' | 'text' | 'sentAt'>,
  b: Pick<MessageLike, 'role' | 'text' | 'sentAt'>,
  windowMs = 120_000
): boolean {
  if (a.role !== b.role) return false;
  if ((a.text ?? '').trim() !== (b.text ?? '').trim()) return false;

  const aTime = getValidDate(a.sentAt)?.getTime();
  const bTime = getValidDate(b.sentAt)?.getTime();
  if (!aTime || !bTime) return false;

  return Math.abs(aTime - bTime) <= windowMs;
}

export function dedupeMessagesByRoleAndText<T extends MessageLike>(
  messages: T[],
  windowMs = 120_000
): T[] {
  const sorted = [...messages].sort((a, b) => {
    const aTime = getValidDate(a.sentAt)?.getTime() ?? 0;
    const bTime = getValidDate(b.sentAt)?.getTime() ?? 0;
    return aTime - bTime;
  });
  const deduped: T[] = [];
  const lastSeenByContent = new Map<string, T>();

  for (const message of sorted) {
    const key = `${message.role}|${(message.text ?? '').trim()}`;
    const previousMatch = lastSeenByContent.get(key);
    if (previousMatch && isLikelyDuplicateMessage(previousMatch, message, windowMs)) continue;
    deduped.push(message);
    lastSeenByContent.set(key, message);
  }

  return deduped;
}
