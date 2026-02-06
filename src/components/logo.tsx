import { GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type LogoProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export function Logo({ size = 'md', className }: LogoProps) {
  const sizeClasses = {
    sm: { icon: 'h-6 w-6', text: 'text-lg' },
    md: { icon: 'h-8 w-8', text: 'text-xl' },
    lg: { icon: 'h-10 w-10', text: 'text-2xl' },
  };

  const selectedSize = sizeClasses[size];

  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2 group", className)}>
      <GraduationCap className={cn(selectedSize.icon, "text-primary group-hover:animate-pulse")} />
      <h1 className={cn(selectedSize.text, "font-headline font-bold text-foreground")}>
        EmpowerU
      </h1>
    </Link>
  );
}
