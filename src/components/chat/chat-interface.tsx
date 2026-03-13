
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
import Link from 'next/link';
import { FileText } from 'lucide-react';
import {doc, getDoc, serverTimestamp, setDoc} from 'firebase/firestore';

type DisplayMessage = {
  role: 'user' | 'model';
  text: string;
  followUpQuestions?: string[];
  relatedResources?: {
    title: string;
    url: string;
  }[];
};

export function ChatInterface() {
  const {user, isUserLoading, firestore} = useFirebase();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {toast} = useToast();

  useEffect(() => {
    async function loadConversation() {
      if (!user) return;
      const chatDocRef = doc(firestore, 'users', user.uid, 'mentorChats', 'default');

      try {
        const existingConversation = await getDoc(chatDocRef);
        if (existingConversation.exists()) {
          const savedMessages = existingConversation.data().messages;
          if (Array.isArray(savedMessages) && savedMessages.length > 0) {
            setMessages(savedMessages as DisplayMessage[]);
            return;
          }
        }

        const firstName = user.displayName?.split(' ')?.[0] || 'friend';
        const response = await mentorFirstResponse({userName: firstName});
        const initialMessages: DisplayMessage[] = [
          {
            role: 'model',
            text: response,
          },
        ];
        setMessages(initialMessages);
        await setDoc(
          chatDocRef,
          {
            messages: initialMessages,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          {merge: true}
        );
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
  }, [user, firestore, toast]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages]);

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || !user) return;
    const chatDocRef = doc(firestore, 'users', user.uid, 'mentorChats', 'default');

    const userMessage: DisplayMessage = {
      role: 'user',
      text: textToSend,
    };

    const messagesWithUser = [...messages, userMessage];
    setMessages(messagesWithUser);
    setInput('');
    setIsLoading(true);

    try {
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
        followUpQuestions: response.followUpQuestions,
        relatedResources: response.relatedResources,
      };
      const updatedMessages = [...messagesWithUser, modelMessage];
      setMessages(updatedMessages);
      await setDoc(
        chatDocRef,
        {
          messages: updatedMessages,
          updatedAt: serverTimestamp(),
        },
        {merge: true}
      );
    } catch (error) {
      console.error('Failed to get AI response:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to get AI response. Please try again.',
      });
    } finally {
      setIsLoading(false);
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
              key={index}
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
