'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFirebase } from '@/firebase/provider';
import {
  dedupeMessagesByRoleAndText,
  formatDateShort,
  formatTimeShort,
  toIsoStringIfPossible,
} from '@/lib/chat-message-utils';
import {
  collection,
  doc,
  DocumentData,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 50;

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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<QueryDocumentSnapshot<DocumentData> | null>>([]);
  const [totalMessageCount, setTotalMessageCount] = useState(0);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationKey) ?? null,
    [conversations, selectedConversationKey]
  );
  const totalPages = useMemo(() => {
    const messageCount = totalMessageCount || selectedConversation?.messageCount || 0;
    return Math.max(1, Math.ceil(messageCount / PAGE_SIZE));
  }, [selectedConversation, totalMessageCount]);

  async function withAccurateMessageCounts(conversationList: ConversationSummary[]): Promise<ConversationSummary[]> {
    return Promise.all(
      conversationList.map(async (conversation) => {
        try {
          const messagesCollection = collection(
            firestore,
            'users',
            conversation.uid,
            'mentorChats',
            conversation.chatId,
            'messages'
          );
          const snapshot = await getCountFromServer(messagesCollection);

          return {
            ...conversation,
            messageCount: snapshot.data().count,
          };
        } catch (error) {
          console.error(error);
          return conversation;
        }
      })
    );
  }

  function mapAdminMessages(
    conversation: ConversationSummary,
    docs: QueryDocumentSnapshot<DocumentData>[]
  ): AdminMessage[] {
    return docs.map((messageDoc) => {
      const data = messageDoc.data() as {
        role?: 'user' | 'model';
        text?: string;
        sentAt?: unknown;
      };

      return {
        id: messageDoc.id,
        uid: conversation.uid,
        chatId: conversation.chatId,
        role: data.role === 'model' ? 'model' : 'user',
        text: data.text ?? '',
        sentAt: toIsoStringIfPossible(data.sentAt),
      };
    });
  }

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

        const loadedConversations = await loadConversationIndex();
        setConversations(await withAccurateMessageCounts(loadedConversations));
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
    async function loadSelectedConversationCount() {
      if (!selectedConversation || !isAdmin) {
        setTotalMessageCount(0);
        return;
      }

      try {
        const messagesCollection = collection(
          firestore,
          'users',
          selectedConversation.uid,
          'mentorChats',
          selectedConversation.chatId,
          'messages'
        );
        const snapshot = await getCountFromServer(messagesCollection);
        setTotalMessageCount(snapshot.data().count);
      } catch (e) {
        console.error(e);
        setTotalMessageCount(selectedConversation.messageCount ?? 0);
      }
    }

    loadSelectedConversationCount();
  }, [firestore, selectedConversation, isAdmin]);

  useEffect(() => {
    setCurrentPage(1);
    setPageCursors([]);
    setTotalMessageCount(selectedConversation?.messageCount ?? 0);
  }, [selectedConversation?.id]);

  const loadConversationPage = async (conversation: ConversationSummary, pageNumber: number) => {
    if (!isAdmin) {
      return;
    }

    try {
      setIsLoadingMessages(true);

      let workingCursors = [...pageCursors];
      let startCursor: QueryDocumentSnapshot<DocumentData> | null = null;

      if (pageNumber > 1) {
        if (workingCursors.length >= pageNumber - 1) {
          startCursor = workingCursors[pageNumber - 2] ?? null;
        } else {
          startCursor = workingCursors[workingCursors.length - 1] ?? null;
          const firstMissingPage = Math.max(1, workingCursors.length + 1);

          for (let page = firstMissingPage; page < pageNumber; page += 1) {
            const cursorQuery = startCursor
              ? query(
                  collection(firestore, 'users', conversation.uid, 'mentorChats', conversation.chatId, 'messages'),
                  orderBy('sentAt', 'asc'),
                  startAfter(startCursor),
                  limit(PAGE_SIZE)
                )
              : query(
                  collection(firestore, 'users', conversation.uid, 'mentorChats', conversation.chatId, 'messages'),
                  orderBy('sentAt', 'asc'),
                  limit(PAGE_SIZE)
                );

            const cursorSnapshot = await getDocs(cursorQuery);
            const lastDoc = cursorSnapshot.docs[cursorSnapshot.docs.length - 1] ?? null;
            workingCursors[page - 1] = lastDoc;
            startCursor = lastDoc;

            if (!lastDoc) {
              break;
            }
          }
        }
      }

      const pageQuery = startCursor
        ? query(
            collection(firestore, 'users', conversation.uid, 'mentorChats', conversation.chatId, 'messages'),
            orderBy('sentAt', 'asc'),
            startAfter(startCursor),
            limit(PAGE_SIZE)
          )
        : query(
            collection(firestore, 'users', conversation.uid, 'mentorChats', conversation.chatId, 'messages'),
            orderBy('sentAt', 'asc'),
            limit(PAGE_SIZE)
          );

      const pageSnapshot = await getDocs(pageQuery);
      const loadedMessages = mapAdminMessages(conversation, pageSnapshot.docs);
      const lastDoc = pageSnapshot.docs[pageSnapshot.docs.length - 1] ?? null;
      workingCursors[pageNumber - 1] = lastDoc;

      setMessages(dedupeAdminMessages(loadedMessages));
      setPageCursors(workingCursors);
      setCurrentPage(pageNumber);
    } catch (e) {
      console.error(e);
      setError('Failed to load messages for selected conversation.');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (!selectedConversation || !isAdmin) {
      setMessages([]);
      setPageCursors([]);
      return;
    }

    loadConversationPage(selectedConversation, 1);
  }, [firestore, selectedConversation, isAdmin]);

  const visiblePages = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages = new Set<number>([1, 2, totalPages - 1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    return Array.from(pages)
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);
  }, [currentPage, totalPages]);

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
                    <p className="text-xs opacity-80">Length: {conversation.messageCount ?? 0}</p>
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
              {selectedConversation && totalPages > 1 && !isLoadingMessages && (
                <div className="flex flex-wrap items-center justify-center gap-2 border-t pt-4">
                  {visiblePages.map((page, index) => {
                    const previousPage = visiblePages[index - 1];
                    const showGap = previousPage && page - previousPage > 1;

                    return (
                      <div key={page} className="flex items-center gap-2">
                        {showGap && <span className="text-sm text-muted-foreground">...</span>}
                        <Button
                          type="button"
                          variant={page === currentPage ? 'default' : 'outline'}
                          size="sm"
                          disabled={isLoadingMessages}
                          onClick={() => loadConversationPage(selectedConversation, page)}
                        >
                          {page}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
