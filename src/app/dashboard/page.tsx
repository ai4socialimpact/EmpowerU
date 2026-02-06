'use client';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight, BookOpen, GraduationCap, MessageSquare } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useFirebase();
  
  const displayName = user?.displayName || user?.email || 'Student';

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
       <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold font-headline tracking-tight">Welcome back, {displayName}!</h2>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AI Mentor</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-headline">Chat Now</div>
              <p className="text-xs text-muted-foreground">
                Get instant answers to your college questions.
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href="/dashboard/mentor">Start Conversation <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resource Library</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-headline">Explore</div>
              <p className="text-xs text-muted-foreground">
                Access articles, guides, and more.
              </p>
               <Button asChild size="sm" className="mt-4">
                <Link href="/dashboard/resources">Browse Resources <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recommendations</CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-headline">Get Your List</div>
              <p className="text-xs text-muted-foreground">
                Find colleges that fit your profile.
              </p>
               <Button asChild size="sm" className="mt-4">
                <Link href="/dashboard/recommendations">Find Colleges <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Your Journey Starts Here</CardTitle>
                <CardDescription>EmpowerU is designed to be your trusted partner in navigating the path to higher education. Whether you're just starting to think about college or are deep in the application process, we have the tools to help you succeed.</CardDescription>
            </CardHeader>
            <CardContent>
                <p>Use the navigation on the left to explore all the features available to you. We're excited to be a part of your journey!</p>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
