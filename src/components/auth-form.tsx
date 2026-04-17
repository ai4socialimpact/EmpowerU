'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { FirebaseError } from 'firebase/app';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useFirebase } from '@/firebase';

const loginSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

const signupSchema = z.object({
  username: z.string().min(3, { message: 'Username must be at least 3 characters.' }).max(20),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

type AuthFormProps = {
  mode: 'login' | 'signup';
};

const LOGIN_LOCKOUT_KEY_PREFIX = 'empoweru-login-lockout:';
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

type LoginLockoutState = {
  failedAttempts: number;
  lockoutUntil: number | null;
};

function normalizeLoginEmail(email: string) {
  return email.trim().toLowerCase();
}

function getLoginLockoutKey(email: string) {
  return `${LOGIN_LOCKOUT_KEY_PREFIX}${normalizeLoginEmail(email)}`;
}

function readLoginLockoutState(email: string): LoginLockoutState {
  if (typeof window === 'undefined') {
    return { failedAttempts: 0, lockoutUntil: null };
  }

  const key = getLoginLockoutKey(email);
  const rawValue = window.localStorage.getItem(key);

  if (!rawValue) {
    return { failedAttempts: 0, lockoutUntil: null };
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<LoginLockoutState>;
    const failedAttempts = typeof parsed.failedAttempts === 'number' ? parsed.failedAttempts : 0;
    const lockoutUntil = typeof parsed.lockoutUntil === 'number' ? parsed.lockoutUntil : null;

    if (lockoutUntil && lockoutUntil <= Date.now()) {
      window.localStorage.removeItem(key);
      return { failedAttempts: 0, lockoutUntil: null };
    }

    return { failedAttempts, lockoutUntil };
  } catch {
    window.localStorage.removeItem(key);
    return { failedAttempts: 0, lockoutUntil: null };
  }
}

function writeLoginLockoutState(email: string, state: LoginLockoutState) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getLoginLockoutKey(email), JSON.stringify(state));
}

function clearLoginLockoutState(email: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(getLoginLockoutKey(email));
}

function formatLockoutTimeRemaining(lockoutUntil: number | null) {
  if (!lockoutUntil) {
    return null;
  }

  const remainingMs = Math.max(lockoutUntil - Date.now(), 0);
  if (remainingMs <= 0) {
    return null;
  }

  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingSeconds = Math.ceil((remainingMs % 60000) / 1000);

  if (remainingMinutes <= 0) {
    return `${remainingSeconds}s`;
  }

  return `${remainingMinutes}m ${remainingSeconds}s`;
}

function handleFirebaseAuthError(error: unknown, toast: ReturnType<typeof useToast>['toast']) {
  console.error(error);
  const firebaseError = error as FirebaseError;
  let errorMessage = 'An unexpected error occurred. Please try again.';

  if (firebaseError.code) {
    switch (firebaseError.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        errorMessage = 'Invalid email or password.';
        break;
      case 'auth/email-already-in-use':
        errorMessage = 'An account with this email already exists.';
        break;
      default:
        errorMessage = firebaseError.message;
    }
  }

  toast({
    variant: 'destructive',
    title: 'Authentication Failed',
    description: errorMessage,
  });
}

async function upsertUserProfile(params: {
  firestore: ReturnType<typeof useFirebase>['firestore'];
  uid: string;
  email?: string | null;
  displayName?: string | null;
}) {
  const { firestore, uid, email, displayName } = params;
  await setDoc(
    doc(firestore, 'users', uid),
    {
      uid,
      email: email ?? null,
      displayName: displayName ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function LoginForm() {
  const { auth, firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [timeRemainingLabel, setTimeRemainingLabel] = useState<string | null>(null);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const watchedEmail = form.watch('email');

  useEffect(() => {
    const normalizedEmail = normalizeLoginEmail(watchedEmail);

    if (!normalizedEmail) {
      setLockoutUntil(null);
      setTimeRemainingLabel(null);
      return;
    }

    const syncLockout = () => {
      const state = readLoginLockoutState(normalizedEmail);
      setLockoutUntil(state.lockoutUntil);
      setTimeRemainingLabel(formatLockoutTimeRemaining(state.lockoutUntil));
    };

    syncLockout();

    const intervalId = window.setInterval(syncLockout, 1000);
    return () => window.clearInterval(intervalId);
  }, [watchedEmail]);

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    const normalizedEmail = normalizeLoginEmail(values.email);
    const existingState = readLoginLockoutState(normalizedEmail);

    if (existingState.lockoutUntil && existingState.lockoutUntil > Date.now()) {
      const remainingTime = formatLockoutTimeRemaining(existingState.lockoutUntil);
      setLockoutUntil(existingState.lockoutUntil);
      setTimeRemainingLabel(remainingTime);
      toast({
        variant: 'destructive',
        title: 'Too Many Attempts',
        description: `This account is temporarily locked. Try again in ${remainingTime ?? 'a moment'}.`,
      });
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, values.email, values.password);
      clearLoginLockoutState(normalizedEmail);
      setLockoutUntil(null);
      setTimeRemainingLabel(null);
      await upsertUserProfile({
        firestore,
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName,
      });
      router.push('/dashboard');
    } catch (error) {
      const nextFailedAttempts = existingState.failedAttempts + 1;
      const nextLockoutUntil =
        nextFailedAttempts >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOGIN_LOCKOUT_WINDOW_MS : null;

      writeLoginLockoutState(normalizedEmail, {
        failedAttempts: nextFailedAttempts,
        lockoutUntil: nextLockoutUntil,
      });

      setLockoutUntil(nextLockoutUntil);
      setTimeRemainingLabel(formatLockoutTimeRemaining(nextLockoutUntil));
      handleFirebaseAuthError(error, toast);

      if (nextLockoutUntil) {
        toast({
          variant: 'destructive',
          title: 'Login Locked',
          description: `Too many failed attempts. Try again in ${formatLockoutTimeRemaining(nextLockoutUntil) ?? '15m'}.`,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isLockedOut = Boolean(lockoutUntil && lockoutUntil > Date.now());

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="name@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="********" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {isLockedOut ? (
            <p className="text-sm font-medium text-destructive">
              Too many failed attempts. Try again in {timeRemainingLabel ?? 'a moment'}.
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isLoading || isLockedOut}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLockedOut ? 'Locked' : 'Log In'}
          </Button>
        </form>
      </Form>
      <div className="mt-4 text-center text-sm">
        Don&apos;t have an account?
        <Link href="/signup" className="underline ml-1">
          Sign up
        </Link>
      </div>
    </>
  );
}

export function SignupForm() {
  const { auth, firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof signupSchema>) => {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
      await updateProfile(userCredential.user, { displayName: values.username });
      await upsertUserProfile({
        firestore,
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: values.username,
      });      router.push('/dashboard');
    } catch (error) {
      handleFirebaseAuthError(error, toast);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="name@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="********" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign Up
          </Button>
        </form>
      </Form>
      <div className="mt-4 text-center text-sm">
        Already have an account?
        <Link href="/login" className="underline ml-1">
          Log in
        </Link>
      </div>
    </>
  );
}

export function AuthForm({ mode }: AuthFormProps) {
  return mode === 'login' ? <LoginForm /> : <SignupForm />;
}
