'use client';

import { ProfileForm } from '@/components/profile-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirebase } from '@/firebase';

export default function ProfilePage() {
  const { user } = useFirebase();
  const displayName = user?.displayName || 'User';

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-headline font-bold">{displayName}'s Profile</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account settings and update your profile information.
        </p>
      </header>
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="font-headline">Update Your Username</CardTitle>
          <CardDescription>
            This is the name that will be displayed to you throughout the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm />
        </CardContent>
      </Card>
    </div>
  );
}
