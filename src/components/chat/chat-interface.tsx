
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {useToast} from '@/hooks/use-toast';
import {
  dedupeMessagesByRoleAndText,
  formatDateShort,
  formatTimeShort,
  getConversationIndexId,
  toIsoStringIfPossible,
} from '@/lib/chat-message-utils';
import Link from 'next/link';
import { FileText, ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
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
  feedback?: 'up' | 'down' | null;
  feedbackReason?: string | null;
  feedbackDetails?: string | null;
  followUpQuestions?: string[];
  relatedResources?: {
    title: string;
    url: string;
    }[];
};

const negativeFeedbackOptions = [
  'Incorrect or incomplete',
  'Not what I asked for',
  'Slow or buggy',
  'Style or tone',
  'Safety or legal concern',
  'Other',
] as const;

const positiveFeedbackOptions = [
  'Helpful and accurate',
  'Clear and easy to follow',
  'Encouraging tone',
  'Useful resources',
  'Good follow-up ideas',
  'Other',
] as const;

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

function truncatePreview(text: string, maxLength = 160): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function getFeedbackCounts(messages: DisplayMessage[]) {
  return messages.reduce(
    (counts, message) => {
      if (message.feedback === 'up') {
        counts.up += 1;
      }

      if (message.feedback === 'down') {
        counts.down += 1;
      }

      return counts;
    },
    {up: 0, down: 0}
  );
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
  const [chatMessageCount, setChatMessageCount] = useState(0);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [feedbackMessageIds, setFeedbackMessageIds] = useState<string[]>([]);
  const [feedbackDialogMessageId, setFeedbackDialogMessageId] = useState<string | null>(null);
  const [feedbackDialogType, setFeedbackDialogType] = useState<'up' | 'down' | null>(null);
  const [feedbackReason, setFeedbackReason] = useState<string>('');
  const [feedbackDetails, setFeedbackDetails] = useState('');
  const isSendingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {toast} = useToast();
  const chatId = 'default';

  const upsertConversationIndex = async (params: {
    uid: string;
    chatId: string;
    messageCount: number;
    lastMessagePreview: string;
    lastMessageRole?: 'user' | 'model';
    latestSentAt?: string;
    downvoteCount: number;
    upvoteCount: number;
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
        lastMessagePreview: truncatePreview(params.lastMessagePreview),
        lastMessageRole: params.lastMessageRole ?? null,
        downvoteCount: params.downvoteCount,
        upvoteCount: params.upvoteCount,
        latestAt: params.latestSentAt ? new Date(params.latestSentAt) : serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(params.created ? {createdAt: serverTimestamp()} : {}),
      },
      {merge: true}
    );
  };

  const upsertChatSummary = async (params: {
    chatDocRef: ReturnType<typeof doc>;
    messageCount: number;
    lastMessagePreview: string;
    lastMessageRole?: 'user' | 'model';
    latestSentAt?: string;
    downvoteCount: number;
    upvoteCount: number;
    created?: boolean;
  }) => {
    await setDoc(
      params.chatDocRef,
      {
        ...(params.created ? {createdAt: serverTimestamp()} : {}),
        updatedAt: serverTimestamp(),
        title: 'AI Mentor Chat',
        messageCount: params.messageCount,
        lastMessagePreview: truncatePreview(params.lastMessagePreview),
        lastMessageRole: params.lastMessageRole ?? null,
        lastMessageAt: params.latestSentAt ? new Date(params.latestSentAt) : serverTimestamp(),
        userFeedbackDownCount: params.downvoteCount,
        userFeedbackUpCount: params.upvoteCount,
        archived: false,
      },
      {merge: true}
    );
  };

  useEffect(() => {
    async function loadConversation() {
      if (!user) return;
      const chatDocRef = doc(firestore, 'users', user.uid, 'mentorChats', chatId);
      const messagesColRef = collection(chatDocRef, 'messages');

      try {
        const messagesQuery = query(messagesColRef, orderBy('sentAt', 'desc'), limit(50));
        const existingMessagesSnapshot = await getDocs(messagesQuery);

        if (!existingMessagesSnapshot.empty) {
          const loadedMessages: DisplayMessage[] = [...existingMessagesSnapshot.docs].reverse().map((messageDoc) => {
            const data = messageDoc.data() as Omit<DisplayMessage, 'id'>;
            return {
              id: messageDoc.id,
              role: data.role,
              text: data.text,
              sentAt: toIsoStringIfPossible(data.sentAt),
              feedback: data.feedback ?? null,
              feedbackReason: data.feedbackReason ?? null,
              feedbackDetails: data.feedbackDetails ?? null,
              followUpQuestions: data.followUpQuestions,
              relatedResources: data.relatedResources,
            };
          });
          const existingConversation = await getDoc(chatDocRef);
          const storedMessageCount = existingConversation.exists() &&
            typeof existingConversation.data().messageCount === 'number'
            ? existingConversation.data().messageCount
            : loadedMessages.length;

          setChatMessageCount(storedMessageCount);
          setMessages(loadedMessages);
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
                feedback: message.feedback ?? null,
                feedbackReason: message.feedbackReason ?? null,
                feedbackDetails: message.feedbackDetails ?? null,
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
            setChatMessageCount(migratedMessages.length);
            const latestMessage = migratedMessages[migratedMessages.length - 1];
            const feedbackCounts = getFeedbackCounts(migratedMessages);
            await upsertChatSummary({
              chatDocRef,
              messageCount: migratedMessages.length,
              lastMessagePreview: latestMessage?.text ?? '',
              lastMessageRole: latestMessage?.role,
              latestSentAt: latestMessage?.sentAt,
              downvoteCount: feedbackCounts.down,
              upvoteCount: feedbackCounts.up,
              created: !existingConversation.data().createdAt,
            });
            await upsertConversationIndex({
              uid: user.uid,
              chatId,
              messageCount: migratedMessages.length,
              lastMessagePreview: latestMessage?.text ?? '',
              lastMessageRole: latestMessage?.role,
              latestSentAt: latestMessage?.sentAt,
              downvoteCount: feedbackCounts.down,
              upvoteCount: feedbackCounts.up,
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
          feedback: null,
          feedbackReason: null,
          feedbackDetails: null,
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
        setChatMessageCount(1);
        await upsertChatSummary({
          chatDocRef,
          messageCount: 1,
          lastMessagePreview: response,
          lastMessageRole: 'model',
          latestSentAt: initialMessage.sentAt,
          downvoteCount: 0,
          upvoteCount: 0,
          created: true,
        });
        await upsertConversationIndex({
          uid: user.uid,
          chatId,
          messageCount: 1,
          lastMessagePreview: response,
          lastMessageRole: 'model',
          latestSentAt: initialMessage.sentAt,
          downvoteCount: 0,
          upvoteCount: 0,
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
    const chatDocRef = doc(firestore, 'users', user.uid, 'mentorChats', chatId);

    const userMessage: DisplayMessage = {
      role: 'user',
      text: textToSend,
      sentAt: new Date().toISOString(),
      feedback: null,
      feedbackReason: null,
      feedbackDetails: null,
      followUpQuestions: [],
      relatedResources: [],
    };

    const messagesWithUser = [...messages, userMessage];
    setMessages(messagesWithUser);
    setInput('');
    setIsLoading(true);

    try {
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
        feedback: null,
        feedbackReason: null,
        feedbackDetails: null,
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
        feedback: null,
        feedbackReason: null,
        feedbackDetails: null,
        followUpQuestions: response.followUpQuestions,
        relatedResources: response.relatedResources,
      };
      const modelMessageId = await stableMessageId(`model|${user.uid}|${chatId}|${userMessageId}`);
      const modelMessageRef = doc(messagesColRef, modelMessageId);
      await setDoc(modelMessageRef, {
        role: modelMessage.role,
        text: modelMessage.text,
        sentAt: new Date(modelMessage.sentAt ?? new Date().toISOString()),
        feedback: null,
        feedbackReason: null,
        feedbackDetails: null,
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
      const nextMessageCount = chatMessageCount + 2;
      setChatMessageCount(nextMessageCount);
      const feedbackCounts = getFeedbackCounts(updatedMessages);
      await upsertChatSummary({
        chatDocRef,
        messageCount: nextMessageCount,
        lastMessagePreview: modelMessage.text,
        lastMessageRole: 'model',
        latestSentAt: modelMessage.sentAt,
        downvoteCount: feedbackCounts.down,
        upvoteCount: feedbackCounts.up,
      });
      await upsertConversationIndex({
        uid: user.uid,
        chatId,
        messageCount: nextMessageCount,
        lastMessagePreview: modelMessage.text,
        lastMessageRole: 'model',
        latestSentAt: modelMessage.sentAt,
        downvoteCount: feedbackCounts.down,
        upvoteCount: feedbackCounts.up,
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

  const handleFeedbackDialogOpenChange = (open: boolean) => {
    if (open) {
      return;
    }

    setFeedbackDialogMessageId(null);
    setFeedbackDialogType(null);
    setFeedbackReason('');
    setFeedbackDetails('');
  };

  const openNegativeFeedbackDialog = (message: DisplayMessage) => {
    setFeedbackDialogMessageId(message.id ?? null);
    setFeedbackDialogType('down');
    setFeedbackReason(message.feedbackReason ?? '');
    setFeedbackDetails(message.feedbackDetails ?? '');
  };

  const openPositiveFeedbackDialog = (message: DisplayMessage) => {
    setFeedbackDialogMessageId(message.id ?? null);
    setFeedbackDialogType('up');
    setFeedbackReason(message.feedbackReason ?? '');
    setFeedbackDetails(message.feedbackDetails ?? '');
  };

  const handleMessageFeedback = async (
    messageId: string,
    feedback: 'up' | 'down',
    options?: {
      reason?: string | null;
      details?: string | null;
    }
  ) => {
    if (!user) return;

    const currentMessage = messages.find((message) => message.id === messageId);
    if (!currentMessage) return;

    setFeedbackMessageIds((current) =>
      current.includes(messageId) ? current : [...current, messageId]
    );

    try {
      const messageRef = doc(firestore, 'users', user.uid, 'mentorChats', chatId, 'messages', messageId);
      const chatDocRef = doc(firestore, 'users', user.uid, 'mentorChats', chatId);
      const feedbackDocRef = doc(firestore, 'chatFeedback', getConversationIndexId(user.uid, `${chatId}_${messageId}`));
      await setDoc(
        messageRef,
        {
          feedback,
          hasFeedback: true,
          feedbackReason: options?.reason ?? null,
          feedbackDetails: options?.details ?? null,
          feedbackUpdatedAt: serverTimestamp(),
        },
        {merge: true}
      );

      const updatedMessages = messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              feedback,
              feedbackReason: options?.reason ?? null,
              feedbackDetails: options?.details ?? null,
            }
          : message
      );
      setMessages(updatedMessages);

      const feedbackCounts = getFeedbackCounts(updatedMessages);
      const latestMessage = updatedMessages[updatedMessages.length - 1];

      await upsertChatSummary({
        chatDocRef,
        messageCount: chatMessageCount,
        lastMessagePreview: latestMessage?.text ?? '',
        lastMessageRole: latestMessage?.role,
        latestSentAt: latestMessage?.sentAt,
        downvoteCount: feedbackCounts.down,
        upvoteCount: feedbackCounts.up,
      });
      await upsertConversationIndex({
        uid: user.uid,
        chatId,
        messageCount: chatMessageCount,
        lastMessagePreview: latestMessage?.text ?? '',
        lastMessageRole: latestMessage?.role,
        latestSentAt: latestMessage?.sentAt,
        downvoteCount: feedbackCounts.down,
        upvoteCount: feedbackCounts.up,
      });

      await setDoc(
        feedbackDocRef,
        {
          uid: user.uid,
          chatId,
          messageId,
          feedback,
          reason: options?.reason ?? null,
          details: options?.details ?? null,
          active: feedback === 'down',
          displayName: user.displayName ?? null,
          email: user.email ?? null,
          messageTextPreview: truncatePreview(currentMessage.text, 240),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        {merge: true}
      );
    } catch (error) {
      console.error('Failed to save message feedback:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to save feedback. Please try again.',
      });
    } finally {
      setFeedbackMessageIds((current) => current.filter((id) => id !== messageId));
    }
  };

  const submitFeedback = async () => {
    if (!feedbackDialogMessageId || !feedbackDialogType) return;

    await handleMessageFeedback(feedbackDialogMessageId, feedbackDialogType, {
      reason: feedbackReason || null,
      details: feedbackDetails.trim() || null,
    });
    handleFeedbackDialogOpenChange(false);
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
    <Dialog open={Boolean(feedbackDialogMessageId)} onOpenChange={handleFeedbackDialogOpenChange}>
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
                  {msg.role === 'model' && msg.id && (
                    <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
                      <span className="text-xs text-muted-foreground">Was this helpful?</span>
                      <Button
                        type="button"
                        variant={msg.feedback === 'up' ? 'default' : 'outline'}
                        size="sm"
                        disabled={feedbackMessageIds.includes(msg.id)}
                        aria-label="Thumbs up"
                        onClick={() => openPositiveFeedbackDialog(msg)}>
                        <ThumbsUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={msg.feedback === 'down' ? 'default' : 'outline'}
                        size="sm"
                        disabled={feedbackMessageIds.includes(msg.id)}
                        aria-label="Thumbs down"
                        onClick={() => openNegativeFeedbackDialog(msg)}>
                        <ThumbsDown className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {feedbackDialogType === 'up' ? 'Share positive feedback' : 'Share feedback'}
          </DialogTitle>
          <DialogDescription>
            {feedbackDialogType === 'up'
              ? 'Tell us what worked well with this AI response.'
              : 'Tell us what went wrong with this AI response.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(feedbackDialogType === 'up' ? positiveFeedbackOptions : negativeFeedbackOptions).map((option) => (
              <Button
                key={option}
                type="button"
                variant={feedbackReason === option ? 'default' : 'outline'}
                className="rounded-full"
                onClick={() => setFeedbackReason(option)}>
                {option}
              </Button>
            ))}
          </div>
          <Textarea
            placeholder="Share details (optional)"
            value={feedbackDetails}
            onChange={(e) => setFeedbackDetails(e.target.value)}
            rows={4}
          />
          <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Your feedback helps improve the AI Mentor experience for students.
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleFeedbackDialogOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              !feedbackDialogMessageId ||
              feedbackMessageIds.includes(feedbackDialogMessageId) ||
              (!feedbackReason && !feedbackDetails.trim())
            }
            onClick={submitFeedback}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
