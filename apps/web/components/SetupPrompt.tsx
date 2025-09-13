'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { X, Sparkles, ArrowRight } from 'lucide-react';

interface SetupPromptProps {
  onDismiss?: () => void;
}

export function SetupPrompt({ onDismiss }: SetupPromptProps) {
  const [isVisible, setIsVisible] = useState(true);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  return (
    <Alert className="relative bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
      <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <AlertTitle className="text-lg font-semibold">Welcome to YNAB Rewards Tracker!</AlertTitle>
      <AlertDescription className="mt-2">
        <Button
          onClick={handleDismiss}
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-6 w-6"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
        
        <p className="mb-4">
          Get started by connecting your YNAB account to start tracking credit card rewards and maximizing your cashback.
        </p>
        
        <div className="mb-4">
          <p className="font-semibold mb-2">Quick Setup Steps:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Get your YNAB Personal Access Token</li>
            <li>Select your budget</li>
            <li>Choose accounts to track for rewards</li>
            <li>Set up reward rules for each card</li>
          </ol>
        </div>
        
        <Button asChild>
          <Link href="/settings">
            Get Started
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
