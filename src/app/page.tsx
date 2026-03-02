'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/logo';
import { useFirebase } from '@/firebase';

export default function Home() {
  const { user, isUserLoading } = useFirebase();
  const router = useRouter();

  useEffect(() => {
    // Always redirect to the dashboard.
    // The dashboard will handle anonymous vs. authenticated users.
    if (!isUserLoading) {
      router.replace('/dashboard');
    }
  }, [router, isUserLoading]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background gap-4">
      <Logo size="lg" />
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
