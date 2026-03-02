//home/user/studio/src/app/dashboard/mentor/page.tsx
import { ChatInterface } from '@/components/chat/chat-interface';
import { Separator } from '@/components/ui/separator';

export default function MentorPage() {
  return (
    <div className="h-full w-full flex flex-col">
      <div className="p-4">
        <h1 className="text-2xl font-headline font-bold">AI Mentor</h1>
        <p className="text-muted-foreground">Ask me anything about your journey to higher education!</p>
      </div>
      <Separator />
      <ChatInterface />
    </div>
  );
}
