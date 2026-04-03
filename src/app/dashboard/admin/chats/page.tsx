'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFirebase } from '@/firebase/provider';
import {
  dedupeMessagesByRoleAndText,
  formatDateShort,
  formatTimeShort,
  getConversationIndexId,
  toIsoStringIfPossible,
} from '@/lib/chat-message-utils';
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type ConversationSummary = {
  id: string;
  uid: string;
  displayName?: string;
  email?: string;
  chatId: string;
  title?: string;
  messageCount?: number;
  lastMessagePreview?: string;
  latestAt?: string;
  updatedAt?: string;
};

type AdminMessage = {
  id: string;
  uid: string;
  chatId: string;
  role: 'user' | 'model';
  text: string;
  sentAt?: string;
};

function dedupeAdminMessages(messages: AdminMessage[]): AdminMessage[] {
  return dedupeMessagesByRoleAndText(messages);
}

function formatTime(isoString?: string): string {
  return formatTimeShort(isoString);
}

function formatDate(isoString?: string): string {
  return formatDateShort(isoString);
}

function getConversationUserLabel(conversation: ConversationSummary | null): string {
  if (!conversation) return 'User';
  if (conversation.displayName && conversation.displayName.trim()) return conversation.displayName.trim();
  if (conversation.email && conversation.email.includes('@')) return conversation.email.split('@')[0];
  return 'User';
}

export default function AdminChatsPage() {
  const { user, isUserLoading, firestore } = useFirebase();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationKey) ?? null,
    [conversations, selectedConversationKey]
  );

  async function loadConversationIndex(): Promise<ConversationSummary[]> {
    const indexQuery = query(collection(firestore, 'conversationIndex'), orderBy('updatedAt', 'desc'));
    const indexSnapshot = await getDocs(indexQuery);

    return indexSnapshot.docs.map((indexDoc) => {
      const data = indexDoc.data() as {
        uid?: string;
        displayName?: string;
        email?: string;
        chatId?: string;
        title?: string;
        messageCount?: number;
        lastMessagePreview?: string;
        latestAt?: unknown;
        updatedAt?: unknown;
      };
      return {
        id: indexDoc.id,
        uid: data.uid ?? '',
        displayName: data.displayName ?? undefined,
        email: data.email ?? undefined,
        chatId: data.chatId ?? 'default',
        title: data.title ?? 'AI Mentor Chat',
        messageCount: data.messageCount ?? 0,
        lastMessagePreview: data.lastMessagePreview ?? '',
        latestAt: toIsoStringIfPossible(data.latestAt),
        updatedAt: toIsoStringIfPossible(data.updatedAt),
      };
    });
  }

  async function backfillConversationIndexFromMentorChats() {
    const usersSnapshot = await getDocs(collection(firestore, 'users'));

    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data() as {displayName?: string; email?: string;};
      const chatsSnapshot = await getDocs(collection(firestore, 'users', uid, 'mentorChats'));

      for (const chatDoc of chatsSnapshot.docs) {
        const chatId = chatDoc.id;
        const chatData = chatDoc.data() as {
          title?: string;
          messageCount?: number;
          lastMessagePreview?: string;
          createdAt?: unknown;
          updatedAt?: unknown;
        };

        await setDoc(
          doc(firestore, 'conversationIndex', getConversationIndexId(uid, chatId)),
          {
            uid,
            displayName: userData.displayName ?? null,
            email: userData.email ?? null,
            chatId,
            title: chatData.title ?? 'AI Mentor Chat',
            messageCount: typeof chatData.messageCount === 'number' ? chatData.messageCount : 0,
            lastMessagePreview: chatData.lastMessagePreview ?? '',
            latestAt: chatData.updatedAt ?? chatData.createdAt ?? new Date(),
            updatedAt: chatData.updatedAt ?? new Date(),
            createdAt: chatData.createdAt ?? new Date(),
          },
          { merge: true }
        );
      }
    }
  }

  async function hydrateMissingIdentityFields(conversationList: ConversationSummary[]) {
    const missing = conversationList.filter((conversation) => !conversation.displayName || !conversation.email);
    const uniqueUids = Array.from(new Set(missing.map((conversation) => conversation.uid).filter(Boolean)));
    if (uniqueUids.length === 0) return;

    const userProfileByUid = new Map<string, {displayName?: string | null; email?: string | null;}>();
    await Promise.all(
      uniqueUids.map(async (uid) => {
        const userSnapshot = await getDoc(doc(firestore, 'users', uid));
        if (!userSnapshot.exists()) return;
        const userData = userSnapshot.data() as {displayName?: string; email?: string;};
        userProfileByUid.set(uid, {
          displayName: userData.displayName ?? null,
          email: userData.email ?? null,
        });
      })
    );

    await Promise.all(
      missing.map(async (conversation) => {
        const profile = userProfileByUid.get(conversation.uid);
        if (!profile) return;
        await setDoc(
          doc(firestore, 'conversationIndex', conversation.id),
          {
            displayName: profile.displayName ?? null,
            email: profile.email ?? null,
            updatedAt: new Date(),
          },
          { merge: true }
        );
      })
    );
  }

  useEffect(() => {
    async function checkAndLoadConversations() {
      if (!user) {
        setIsCheckingAdmin(false);
        setIsLoadingConversations(false);
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
          setIsLoadingConversations(false);
          return;
        }

        let loadedConversations = await loadConversationIndex();

        if (loadedConversations.length === 0) {
          await backfillConversationIndexFromMentorChats();
          loadedConversations = await loadConversationIndex();
        }

        await hydrateMissingIdentityFields(loadedConversations);
        loadedConversations = await loadConversationIndex();

        setConversations(loadedConversations);
      } catch (e) {
        console.error(e);
        setError('Failed to load admin chats.');
      } finally {
        setIsLoadingConversations(false);
      }
    }

    checkAndLoadConversations();
  }, [user, firestore]);

  useEffect(() => {
    if (!selectedConversationKey && conversations.length > 0) {
      setSelectedConversationKey(conversations[0].id);
    }
  }, [conversations, selectedConversationKey]);

  useEffect(() => {
    async function loadSelectedConversationMessages() {
      if (!selectedConversation || !isAdmin) {
        setMessages([]);
        return;
      }

      try {
        setIsLoadingMessages(true);
        const messagesQuery = query(
          collection(firestore, 'users', selectedConversation.uid, 'mentorChats', selectedConversation.chatId, 'messages'),
          orderBy('sentAt', 'asc')
        );
        const messagesSnapshot = await getDocs(messagesQuery);
        const loadedMessages: AdminMessage[] = messagesSnapshot.docs.map((messageDoc) => {
          const data = messageDoc.data() as {
            role?: 'user' | 'model';
            text?: string;
            sentAt?: unknown;
          };

          return {
            id: messageDoc.id,
            uid: selectedConversation.uid,
            chatId: selectedConversation.chatId,
            role: data.role === 'model' ? 'model' : 'user',
            text: data.text ?? '',
            sentAt: toIsoStringIfPossible(data.sentAt),
          };
        });

        setMessages(dedupeAdminMessages(loadedMessages));
      } catch (e) {
        console.error(e);
        setError('Failed to load messages for selected conversation.');
      } finally {
        setIsLoadingMessages(false);
      }
    }

    loadSelectedConversationMessages();
  }, [firestore, selectedConversation, isAdmin]);

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
      {isLoadingConversations ? (
        <p>Loading chats...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
              {conversations.length === 0 && <p className="text-sm text-muted-foreground">No chats found.</p>}
              {conversations.map((conversation) => (
                <Button
                  key={conversation.id}
                  variant={selectedConversationKey === conversation.id ? 'default' : 'outline'}
                  className="w-full justify-start h-auto py-2"
                  onClick={() => setSelectedConversationKey(conversation.id)}
                >
                  <div className="text-left">
                    <p className="font-medium">
                      {conversation.displayName || 'Unknown User'}
                      {conversation.email ? ` (${conversation.email})` : ''}
                    </p>
                    <p className="text-xs opacity-80">UID: {conversation.uid}</p>
                    <p className="text-xs opacity-80">Chat: {conversation.chatId}</p>
                    <p className="text-xs opacity-80">Count: {conversation.messageCount ?? 0}</p>
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
              {selectedConversation && isLoadingMessages && (
                <p className="text-sm text-muted-foreground">Loading messages...</p>
              )}
              {selectedConversation && !isLoadingMessages && messages.length === 0 && (
                <p className="text-sm text-muted-foreground">No messages found.</p>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-md border p-3 ${
                    message.role === 'user' ? 'bg-primary/5' : 'bg-muted'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1">
                    {message.role === 'user'
                      ? getConversationUserLabel(selectedConversation)
                      : 'EmpowerU'}
                  </p>
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
