'use client';
import React from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
} from '@/components/ui/sidebar';
import {
  MessageSquare,
  BookOpen,
  GraduationCap,
  LogIn,
  Shield,
  Flag,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserNav } from '@/components/user-nav';
import { Logo } from '@/components/logo';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFirebase } from '@/firebase/provider';
import { doc, getDoc } from 'firebase/firestore';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, isUserLoading, firestore } = useFirebase();
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [isAdminLoading, setIsAdminLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;

    async function resolveAdminStatus() {
      if (!user) {
        if (isMounted) {
          setIsAdmin(false);
          setIsAdminLoading(false);
        }
        return;
      }

      try {
        const adminDocRef = doc(firestore, 'admins', user.uid);
        const adminDoc = await getDoc(adminDocRef);
        if (isMounted) {
          setIsAdmin(adminDoc.exists());
        }
      } catch {
        if (isMounted) {
          setIsAdmin(false);
        }
      } finally {
        if (isMounted) {
          setIsAdminLoading(false);
        }
      }
    }

    resolveAdminStatus();
    return () => {
      isMounted = false;
    };
  }, [user, firestore]);

  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Logo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
             <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === '/dashboard'}
                tooltip="Dashboard"
              >
                <Link href="/dashboard">
                  <SparklesIcon />
                  <span className="group-data-[collapsible=icon]:hidden">Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === '/dashboard/mentor'}
                tooltip="AI Mentor"
              >
                <Link href="/dashboard/mentor">
                  <MessageSquare />
                  <span className="group-data-[collapsible=icon]:hidden">AI Mentor</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === '/dashboard/resources'}
                tooltip="Resources"
              >
                <Link href="/dashboard/resources">
                  <BookOpen />
                  <span className="group-data-[collapsible=icon]:hidden">Resource Library</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === '/dashboard/recommendations'}
                tooltip="Recommendations"
              >
                <Link href="/dashboard/recommendations">
                  <GraduationCap />
                  <span className="group-data-[collapsible=icon]:hidden">Recommendations</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {!isAdminLoading && isAdmin && (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === '/dashboard/admin/chats'}
                    tooltip="Admin Chats"
                  >
                    <Link href="/dashboard/admin/chats">
                      <Shield />
                      <span className="group-data-[collapsible=icon]:hidden">Admin Chats</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === '/dashboard/admin/feedback'}
                    tooltip="Admin Feedback"
                  >
                    <Link href="/dashboard/admin/feedback">
                      <Flag />
                      <span className="group-data-[collapsible=icon]:hidden">Admin Feedback</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          {user && !user.isAnonymous ? (
            <UserNav />
          ) : (
            <div className="p-2 group-data-[collapsible=icon]:p-0">
               <Button asChild className="w-full justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:size-8">
                  <Link href="/login">
                      <LogIn className="group-data-[collapsible=icon]:size-4" />
                      <span className="group-data-[collapsible=icon]:hidden ml-2">Sign In</span>
                  </Link>
              </Button>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.9 1.9-1.1-3-1.9 1.9-3-1.1 1.9 1.9-1.9 3 3 1.1 1.9-1.9 1.1 3 1.9-1.9 3 1.1-1.9-1.9 1.9-3-3-1.1Z" />
      <path d="M5 21v-3" />
      <path d="M19 21v-3" />
      <path d="M3 12H0" />
      <path d="M21 12h3" />
      <path d="m5 3-3-3" />
      <path d="m19 3 3-3" />
    </svg>
  )
}
