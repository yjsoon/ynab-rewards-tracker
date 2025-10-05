"use client";

import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface RulesReminderAlertProps {
  show: boolean;
}

export function RulesReminderAlert({ show }: RulesReminderAlertProps) {
  if (!show) {
    return null;
  }

  return (
    <Alert className="mb-6 border-primary/20 bg-primary/5">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          Nice one—your accounts are synced. Pop over to the Rules page to fine-tune earn rates and optimise your rewards.
        </span>
        <Button variant="outline" size="sm" asChild>
          <Link href="/rules">Go to Rules</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
