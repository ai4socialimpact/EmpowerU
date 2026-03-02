
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { useFirebase } from '@/firebase';

const profileSchema = z.object({
  username: z.string().min(3, { message: 'Username must be at least 3 characters.' }),
});

export function ProfileForm() {
  const { user, auth } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: user?.displayName || '',
    },
  });

  const onSubmit = async (values: z.infer<typeof profileSchema>) => {
    if (!auth.currentUser) {
        toast({
            variant: 'destructive',
            title: 'Not Authenticated',
            description: 'You must be logged in to update your profile.',
        });
        return;
    }

    setIsLoading(true);
    try {
      await updateProfile(auth.currentUser, { displayName: values.username });
      toast({
        title: 'Profile Updated',
        description: 'Your username has been successfully updated.',
      });
      // Refresh the page or router to reflect changes
      router.refresh();
    } catch (error) {
      console.error(error);
      const firebaseError = error as FirebaseError;
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: firebaseError.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="your_username" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </form>
    </Form>
  );
}
