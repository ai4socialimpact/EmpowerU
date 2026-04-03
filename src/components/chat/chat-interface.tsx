
'use client';

import {useState, useEffect, useRef} from 'react';
import {useFirebase} from '@/firebase/provider';
import {mentorFirstResponse} from '@/ai/flows/ai-mentor-first-response';
import {mentorChat} from '@/ai/flows/mentor-chat';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {MentorChatInput} from '@/ai/flows/mentor-chat';
import {Avatar, AvatarFallback, AvatarImage} from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';
import {useToast} from '@/hooks/use-toast';
import {
  dedupeMessagesByRoleAndText,
  formatDateShort,
  formatTimeShort,
  getConversationIndexId,
  isLikelyDuplicateMessage,
  toIsoStringIfPossible,
} from '@/lib/chat-message-utils';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

type DisplayMessage = {
  id?: string;
  role: 'user' | 'model';
  text: string;
  sentAt?: string;
  followUpQuestions?: string[];
  relatedResources?: {
    title: string;
    url: string;
  }[];
};

function dedupeStoredMessages(messages: DisplayMessage[]): DisplayMessage[] {
  return dedupeMessagesByRoleAndText(messages);
}

function formatMessageTime(isoString?: string): string {
  const formatted = formatTimeShort(isoString);
  return formatted === '--' ? '' : formatted;
}

function formatMessageDate(isoString?: string): string {
  const formatted = formatDateShort(isoString);
  return formatted === '--' ? '' : formatted;
}

async function stableMessageId(seed: string): Promise<string> {
  const encoded = new TextEncoder().encode(seed);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `m_${hex.slice(0, 40)}`;
}

export function ChatInterface() {
  const {user, isUserLoading, firestore} = useFirebase();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const isSendingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {toast} = useToast();
  const chatId = 'default';

  const upsertConversationIndex = async (params: {
    uid: string;
    chatId: string;
    messageCount: number;
    lastMessagePreview: string;
    latestSentAt?: string;
    created?: boolean;
  }) => {
    const indexDocRef = doc(firestore, 'conversationIndex', getConversationIndexId(params.uid, params.chatId));

    await setDoc(
      indexDocRef,
      {
        uid: params.uid,
        displayName: user?.displayName ?? null,
        email: user?.email ?? null,
        chatId: params.chatId,
        title: 'AI Mentor Chat',
        messageCount: params.messageCount,
        lastMessagePreview: params.lastMessagePreview,
        latestAt: params.latestSentAt ? new Date(params.latestSentAt) : serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(params.created ? {createdAt: serverTimestamp()} : {}),
      },
      {merge: true}
    );
  };

  useEffect(() => {
    async function loadConversation() {
      if (!user) return;
      const userDocRef = doc(firestore, 'users', user.uid);
      const chatDocRef = doc(firestore, 'users', user.uid, 'mentorChats', chatId);
      const messagesColRef = collection(chatDocRef, 'messages');

      try {
        await setDoc(
          userDocRef,
          {
            uid: user.uid,
            displayName: user.displayName ?? null,
            email: user.email ?? null,
            updatedAt: serverTimestamp(),
          },
          {merge: true}
        );

        const messagesQuery = query(messagesColRef, orderBy('sentAt', 'asc'));
        const existingMessagesSnapshot = await getDocs(messagesQuery);

        if (!existingMessagesSnapshot.empty) {
          const duplicateDocRefs: Array<ReturnType<typeof doc>> = [];
          const uniqueMessages: DisplayMessage[] = [];
          const lastSeenByContent = new Map<string, DisplayMessage>();

          for (const messageDoc of existingMessagesSnapshot.docs) {
            const data = messageDoc.data() as Omit<DisplayMessage, 'id'>;
            const normalizedMessage: DisplayMessage = {
              id: messageDoc.id,
              role: data.role,
              text: data.text,
              sentAt: toIsoStringIfPossible(data.sentAt),
              followUpQuestions: data.followUpQuestions,
              relatedResources: data.relatedResources,
            };
            const key = `${normalizedMessage.role}|${(normalizedMessage.text ?? '').trim()}`;
            const previousMatch = lastSeenByContent.get(key);
            if (previousMatch && isLikelyDuplicateMessage(previousMatch, normalizedMessage)) {
              duplicateDocRefs.push(messageDoc.ref);
              continue;
            }

            uniqueMessages.push(normalizedMessage);
            lastSeenByContent.set(key, normalizedMessage);
          }

          if (duplicateDocRefs.length > 0) {
            await Promise.allSettled(duplicateDocRefs.map((messageRef) => deleteDoc(messageRef)));
            await setDoc(
              chatDocRef,
              {
                updatedAt: serverTimestamp(),
                messageCount: uniqueMessages.length,
                lastMessagePreview: uniqueMessages[uniqueMessages.length - 1]?.text ?? '',
              },
              {merge: true}
            );
          }

          await upsertConversationIndex({
            uid: user.uid,
            chatId,
            messageCount: uniqueMessages.length,
            lastMessagePreview: uniqueMessages[uniqueMessages.length - 1]?.text ?? '',
            latestSentAt: uniqueMessages[uniqueMessages.length - 1]?.sentAt,
          });

          setMessages(dedupeStoredMessages(uniqueMessages));
          return;
        }

        const existingConversation = await getDoc(chatDocRef);
        // One-time fallback/migration for existing array-based conversations.
        if (existingConversation.exists()) {
          const savedMessages = existingConversation.data().messages;
          if (Array.isArray(savedMessages) && savedMessages.length > 0) {
            const baseTime = Date.now();
            const normalizedLegacyMessages: DisplayMessage[] = savedMessages.map((msg, index) => {
              const message = msg as DisplayMessage;
              const sentAt = toIsoStringIfPossible(message.sentAt) ??
                new Date(baseTime - (savedMessages.length - 1 - index) * 60_000).toISOString();

              return {
                role: message.role,
                text: message.text,
                sentAt,
                followUpQuestions: message.followUpQuestions ?? [],
                relatedResources: message.relatedResources ?? [],
              };
            });

            const dedupedLegacyMessages = dedupeStoredMessages(normalizedLegacyMessages);
            const migratedMessages = await Promise.all(
              dedupedLegacyMessages.map(async (message, index) => {
                const migratedMessageId = await stableMessageId(
                  `legacy|${user.uid}|${chatId}|${index}|${message.role}|${message.text}|${message.sentAt}`
                );

                await setDoc(doc(messagesColRef, migratedMessageId), {
                  ...message,
                  sentAt: new Date(message.sentAt ?? new Date().toISOString()),
                });

                return {
                  id: migratedMessageId,
                  ...message,
                };
              })
            );

            setMessages(dedupeStoredMessages(migratedMessages));
            await setDoc(
              chatDocRef,
              {
                createdAt: existingConversation.data().createdAt ?? serverTimestamp(),
                updatedAt: serverTimestamp(),
                messageCount: migratedMessages.length,
                lastMessagePreview: migratedMessages[migratedMessages.length - 1]?.text ?? '',
              },
              {merge: true}
            );
            await upsertConversationIndex({
              uid: user.uid,
              chatId,
              messageCount: migratedMessages.length,
              lastMessagePreview: migratedMessages[migratedMessages.length - 1]?.text ?? '',
              latestSentAt: migratedMessages[migratedMessages.length - 1]?.sentAt,
            });
            return;
          }
        }

        const firstName = user.displayName?.split(' ')?.[0] || 'friend';
        const response = await mentorFirstResponse({userName: firstName});
        const initialMessage = {
          role: 'model' as const,
          text: response,
          sentAt: new Date().toISOString(),
          followUpQuestions: [] as string[],
          relatedResources: [] as {title: string; url: string;}[],
        };
        const initialMessageId = await stableMessageId(`initial|${user.uid}|${chatId}|model`);
        await setDoc(doc(messagesColRef, initialMessageId), {
          ...initialMessage,
          sentAt: new Date(initialMessage.sentAt),
        });
        setMessages([
          {
            id: initialMessageId,
            ...initialMessage,
          },
        ]);
        await setDoc(
          chatDocRef,
          {
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            title: 'AI Mentor Chat',
            messageCount: 1,
            lastMessagePreview: response,
          },
          {merge: true}
        );
        await upsertConversationIndex({
          uid: user.uid,
          chatId,
          messageCount: 1,
          lastMessagePreview: response,
          latestSentAt: initialMessage.sentAt,
          created: true,
        });
      } catch (error) {
        console.error('Failed to get initial AI response:', error);
        toast({
          variant: 'destructive',
          title: 'Failed to get initial AI response. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    }

    if (user) {
      loadConversation();
    }
  }, [user, firestore, toast, chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages]);

  const handleSendMessage = async (messageText?: string) => {
    if (isLoading || isSendingRef.current) return;
    const textToSend = (messageText ?? input).trim();
    if (!textToSend || !user) return;
    isSendingRef.current = true;
    const userDocRef = doc(firestore, 'users', user.uid);
    const chatDocRef = doc(firestore, 'users', user.uid, 'mentorChats', chatId);

    const userMessage: DisplayMessage = {
      role: 'user',
      text: textToSend,
      sentAt: new Date().toISOString(),
      followUpQuestions: [],
      relatedResources: [],
    };

    const messagesWithUser = [...messages, userMessage];
    setMessages(messagesWithUser);
    setInput('');
    setIsLoading(true);

    try {
      await setDoc(
        userDocRef,
        {
          uid: user.uid,
          displayName: user.displayName ?? null,
          email: user.email ?? null,
          updatedAt: serverTimestamp(),
        },
        {merge: true}
      );

      const messagesColRef = collection(chatDocRef, 'messages');
      const anchorId = messages[messages.length - 1]?.id ?? 'root';
      const userMessageId = await stableMessageId(
        `user|${user.uid}|${chatId}|${anchorId}|${textToSend}`
      );
      const userMessageRef = doc(messagesColRef, userMessageId);
      await setDoc(userMessageRef, {
        role: userMessage.role,
        text: userMessage.text,
        sentAt: new Date(userMessage.sentAt ?? new Date().toISOString()),
        followUpQuestions: [],
        relatedResources: [],
      });

      const userMessageWithId: DisplayMessage = {
        ...userMessage,
        id: userMessageRef.id,
      };
      const messagesAfterUserWrite = [...messages, userMessageWithId];
      setMessages(messagesAfterUserWrite);

      const history: MentorChatInput['history'] = messages.map(msg => ({
        role: msg.role,
        content: [{text: msg.text}],
      }));

      const response = await mentorChat({
        history: history,
        message: textToSend,
      });

      const modelMessage: DisplayMessage = {
        role: 'model',
        text: response.answer,
        sentAt: new Date().toISOString(),
        followUpQuestions: response.followUpQuestions,
        relatedResources: response.relatedResources,
      };
      const modelMessageId = await stableMessageId(`model|${user.uid}|${chatId}|${userMessageId}`);
      const modelMessageRef = doc(messagesColRef, modelMessageId);
      await setDoc(modelMessageRef, {
        role: modelMessage.role,
        text: modelMessage.text,
        sentAt: new Date(modelMessage.sentAt ?? new Date().toISOString()),
        followUpQuestions: modelMessage.followUpQuestions ?? [],
        relatedResources: modelMessage.relatedResources ?? [],
      });
      const updatedMessages = [
        ...messagesAfterUserWrite,
        {
          ...modelMessage,
          id: modelMessageRef.id,
        },
      ];
      setMessages(updatedMessages);
      await setDoc(
        chatDocRef,
        {
          updatedAt: serverTimestamp(),
          messageCount: updatedMessages.length,
          lastMessagePreview: modelMessage.text,
        },
        {merge: true}
      );
      await upsertConversationIndex({
        uid: user.uid,
        chatId,
        messageCount: updatedMessages.length,
        lastMessagePreview: modelMessage.text,
        latestSentAt: modelMessage.sentAt,
      });
    } catch (error) {
      console.error('Failed to get AI response:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to get AI response. Please try again.',
      });
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Authenticating...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Please log in to use the AI Mentor.</p>
      </div>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto h-[80vh] flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Avatar className="mr-2">
            <AvatarImage src="/empoweru-logo.svg" alt="EmpowerU Logo" />
            <AvatarFallback>EU</AvatarFallback>
          </Avatar>
          AI Mentor
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.map((msg, index) => (
            <div
              key={msg.id ?? `${msg.role}-${index}-${msg.text.slice(0, 20)}`}
              className={`flex items-start gap-4 ${
                msg.role === 'user' ? 'justify-end' : ''
              }`}>
              {msg.role !== 'user' && (
                <Avatar>
                  <AvatarImage
                    src="/empoweru-logo.svg"
                    alt="EmpowerU Logo"
                  />
                  <AvatarFallback>EU</AvatarFallback>
                </Avatar>
              )}
              <div
                className={`rounded-lg p-3 max-w-[70%] ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}>
                <p className="whitespace-pre-wrap">{msg.text}</p>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs opacity-70">
                  <span>{formatMessageDate(msg.sentAt) || 'Today'}</span>
                  <span className="text-right">{formatMessageTime(msg.sentAt) || 'Now'}</span>
                </div>
                {msg.role === 'model' && msg.relatedResources && msg.relatedResources.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-semibold">Related Resources:</p>
                    {msg.relatedResources.map((resource, i) => (
                       <Button key={i} variant="outline" size="sm" asChild className="w-full text-left justify-start">
                         <Link href={resource.url} target="_blank" rel="noopener noreferrer">
                           <FileText className="mr-2 h-4 w-4" />
                           {resource.title}
                         </Link>
                       </Button>
                    ))}
                  </div>
                )}
                {msg.role === 'model' && msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-semibold">
                      Suggested follow-ups:
                    </p>
                    {msg.followUpQuestions.map((q, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        className="w-full text-left justify-start"
                        disabled={isLoading}
                        onClick={() => handleSendMessage(q)}>
                        {q}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <Avatar>
                  <AvatarImage
                    src={user.photoURL || undefined}
                    alt={user.displayName || 'User'}
                  />
                  <AvatarFallback>
                    {user.displayName
                      ?.split(' ')
                      .map(n => n[0])
                      .join('')}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-start gap-4">
              <Avatar>
                <AvatarImage src="/empoweru-logo.svg" alt="EmpowerU Logo" />
                <AvatarFallback>EU</AvatarFallback>
              </Avatar>
              <div className="rounded-lg p-3 max-w-[70%] bg-muted animate-pulse">
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </CardContent>
      <CardFooter className="p-4 border-t">
        <div className="flex w-full items-start space-x-2">
          <Textarea
            placeholder="Type your message here... (Shift+Enter for new line)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={2}
            className="resize-none"
          />
          <Button onClick={() => handleSendMessage()} disabled={isLoading} className="self-end">
            Send
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
