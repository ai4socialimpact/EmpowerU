
'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { LogOut, User, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useFirebase } from '@/firebase';
import { signOut, signInAnonymously } from 'firebase/auth';
import { useRouter } from 'next/navigation';

export function UserNav() {
  const { user, auth } = useFirebase();
  const router = useRouter();
  const avatar = PlaceHolderImages.find(p => p.id === 'avatar-1');

  if (!user || user.isAnonymous) return null;
  
  const handleLogout = () => {
    if (auth) {
      signOut(auth).then(() => {
        // After sign out, sign in anonymously to maintain a session
        signInAnonymously(auth).catch((error) => {
          console.error("Anonymous sign-in failed after logout:", error);
        }).finally(()=> router.push('/dashboard'));
      });
    }
  };

  const userInitial = user.displayName ? user.displayName[0].toUpperCase() : (user.email ? user.email[0].toUpperCase() : <User size={20} />);
  const displayName = user.displayName || user.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center w-full p-2 rounded-md text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:size-8">
            <Avatar className="h-8 w-8">
              <AvatarImage src={avatar?.imageUrl} alt={user.email ?? ''} />
              <AvatarFallback>{userInitial}</AvatarFallback>
            </Avatar>
            <div className="ml-2 flex-1 text-left truncate group-data-[collapsible=icon]:hidden">
                <p className="font-semibold leading-tight">{displayName}</p>
                <p className="text-xs text-muted-foreground">Student</p>
            </div>
            <ChevronUp className="ml-2 h-4 w-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
           <Link href="/dashboard/profile">
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
