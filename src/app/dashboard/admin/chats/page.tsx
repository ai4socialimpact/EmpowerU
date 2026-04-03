'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFirebase } from '@/firebase/provider';
import { collection, doc, getDoc, getDocs, orderBy, query, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type AdminMessage = {
  id: string;
  uid: string;
  chatId: string;
  role: 'user' | 'model';
  text: string;
  sentAt?: string;
};

type ConversationGroup = {
  key: string;
  uid: string;
  chatId: string;
  messages: AdminMessage[];
  latestAt: string;
};

function dedupeAdminMessages(messages: AdminMessage[]): AdminMessage[] {
  const sorted = [...messages].sort((a, b) => {
    if (a.uid !== b.uid) return a.uid.localeCompare(b.uid);
    if (a.chatId !== b.chatId) return a.chatId.localeCompare(b.chatId);
    const aTime = new Date(a.sentAt || 0).getTime();
    const bTime = new Date(b.sentAt || 0).getTime();
    return aTime - bTime;
  });
  const deduped: AdminMessage[] = [];

  for (const message of sorted) {
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      previous.uid === message.uid &&
      previous.chatId === message.chatId &&
      previous.role === message.role &&
      (previous.text ?? '').trim() === (message.text ?? '').trim()
    ) {
      const prevTime = new Date(previous.sentAt || 0).getTime();
      const currentTime = new Date(message.sentAt || 0).getTime();
      if (
        (!Number.isNaN(prevTime) && !Number.isNaN(currentTime) && Math.abs(prevTime - currentTime) <= 120_000) ||
        Number.isNaN(prevTime) ||
        Number.isNaN(currentTime)
      ) {
        continue;
      }
    }
    deduped.push(message);
  }

  return deduped;
}

function toIsoStringIfPossible(value: unknown): string | undefined {
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
  if (value instanceof Timestamp) return value.toDate().toISOString();

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

function formatTime(isoString?: string): string {
  if (!isoString) return '--';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '--';

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDate(isoString?: string): string {
  if (!isoString) return '--';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '--';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export default function AdminChatsPage() {
  const { user, isUserLoading, firestore } = useFirebase();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);

  const groupedConversations = useMemo<ConversationGroup[]>(() => {
    const grouped = new Map<string, ConversationGroup>();

    for (const message of messages) {
      const key = `${message.uid}/${message.chatId}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          key,
          uid: message.uid,
          chatId: message.chatId,
          messages: [message],
          latestAt: message.sentAt ?? '',
        });
        continue;
      }

      existing.messages.push(message);
      const existingLatest = new Date(existing.latestAt || 0).getTime();
      const current = new Date(message.sentAt || 0).getTime();
      if (current > existingLatest) {
        existing.latestAt = message.sentAt ?? existing.latestAt;
      }
    }

    return Array.from(grouped.values())
      .map((conversation) => ({
        ...conversation,
        messages: conversation.messages.sort((a, b) => {
          const aTime = new Date(a.sentAt || 0).getTime();
          const bTime = new Date(b.sentAt || 0).getTime();
          return aTime - bTime;
        }),
      }))
      .sort((a, b) => {
        const aTime = new Date(a.latestAt || 0).getTime();
        const bTime = new Date(b.latestAt || 0).getTime();
        return bTime - aTime;
      });
  }, [messages]);

  const selectedConversation = groupedConversations.find((c) => c.key === selectedConversationKey) ?? null;

  useEffect(() => {
    async function checkAndLoad() {
      if (!user) {
        setIsCheckingAdmin(false);
        setIsLoading(false);
        return;
      }

      try {
        setError(null);
        const adminDocRef = doc(firestore, 'admins', user.uid);
        const adminDoc = await getDoc(adminDocRef);
        const admin = adminDoc.exists();
        setIsAdmin(admin);
        setIsCheckingAdmin(false);

        if (!admin) {
          setIsLoading(false);
          return;
        }

        const loadedMessages: AdminMessage[] = [];
        const usersSnapshot = await getDocs(collection(firestore, 'users'));

        for (const userDoc of usersSnapshot.docs) {
          const uid = userDoc.id;
          const chatsSnapshot = await getDocs(collection(firestore, 'users', uid, 'mentorChats'));

          for (const chatDoc of chatsSnapshot.docs) {
            const chatId = chatDoc.id;
            const messagesRef = collection(firestore, 'users', uid, 'mentorChats', chatId, 'messages');
            const messagesQuery = query(messagesRef, orderBy('sentAt', 'asc'));
            const messagesSnapshot = await getDocs(messagesQuery);

            for (const messageDoc of messagesSnapshot.docs) {
              const data = messageDoc.data() as {
                role?: 'user' | 'model';
                text?: string;
                sentAt?: unknown;
              };

              loadedMessages.push({
                id: messageDoc.id,
                uid,
                chatId,
                role: data.role === 'model' ? 'model' : 'user',
                text: data.text ?? '',
                sentAt: toIsoStringIfPossible(data.sentAt),
              });
            }
          }
        }

        setMessages(dedupeAdminMessages(loadedMessages));
      } catch (e) {
        console.error(e);
        setError('Failed to load admin chats.');
      } finally {
        setIsLoading(false);
      }
    }

    checkAndLoad();
  }, [user, firestore]);

  useEffect(() => {
    if (!selectedConversationKey && groupedConversations.length > 0) {
      setSelectedConversationKey(groupedConversations[0].key);
    }
  }, [groupedConversations, selectedConversationKey]);

  if (isUserLoading || isCheckingAdmin) {
    return <div className="p-6">Loading admin access...</div>;
  }

  if (!user) {
    return <div className="p-6">Please sign in to access admin tools.</div>;
  }

  if (!isAdmin) {
    return <div className="p-6">You do not have admin access.</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-4">Admin Chat Viewer</h1>
      {error && <p className="text-sm text-destructive mb-4">{error}</p>}
      {isLoading ? (
        <p>Loading chats...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
              {groupedConversations.length === 0 && <p className="text-sm text-muted-foreground">No chats found.</p>}
              {groupedConversations.map((conversation) => (
                <Button
                  key={conversation.key}
                  variant={selectedConversationKey === conversation.key ? 'default' : 'outline'}
                  className="w-full justify-start h-auto py-2"
                  onClick={() => setSelectedConversationKey(conversation.key)}
                >
                  <div className="text-left">
                    <p className="font-medium">User: {conversation.uid}</p>
                    <p className="text-xs opacity-80">Chat: {conversation.chatId}</p>
                    <p className="text-xs opacity-80">
                      Last: {formatDate(conversation.latestAt)} {formatTime(conversation.latestAt)}
                    </p>
                  </div>
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                {selectedConversation
                  ? `Conversation: ${selectedConversation.uid} / ${selectedConversation.chatId}`
                  : 'Select a conversation'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
              {!selectedConversation && (
                <p className="text-sm text-muted-foreground">Choose a conversation to view messages.</p>
              )}
              {selectedConversation?.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-md border p-3 ${
                    message.role === 'user' ? 'bg-primary/5' : 'bg-muted'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1">{message.role}</p>
                  <p className="whitespace-pre-wrap">{message.text}</p>
                  <div className="mt-2 flex items-center justify-between text-xs opacity-70">
                    <span>{formatDate(message.sentAt)}</span>
                    <span>{formatTime(message.sentAt)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
