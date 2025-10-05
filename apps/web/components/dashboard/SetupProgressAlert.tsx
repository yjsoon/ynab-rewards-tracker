"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface SetupProgressAlertProps {
  setupStatus: {
    pat: boolean;
    budget: boolean;
    accounts: boolean;
    cards: boolean;
  };
  setupProgress: number;
  setupPercentage: number;
}

export function SetupProgressAlert({ setupStatus, setupProgress, setupPercentage }: SetupProgressAlertProps) {
  return (
    <Alert className="mb-6">
      <AlertDescription>
        <div className="mt-2">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold">Setup Progress: {setupProgress}/4 steps completed</span>
            <Button variant="outline" size="sm" asChild aria-label="Complete setup">
              <Link href="/settings">
                Complete Setup
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <Progress
            value={setupPercentage}
            className="mb-3"
            aria-label={`Setup progress: ${setupProgress} of 4 steps completed`}
          />
          <div className="flex gap-4 flex-wrap text-sm">
            {[
              { label: "YNAB Token", complete: setupStatus.pat },
              { label: "Budget Selected", complete: setupStatus.budget },
              { label: "Accounts Tracked", complete: setupStatus.accounts },
              { label: "Cards Configured", complete: setupStatus.cards },
            ].map(({ label, complete }) => (
              <span key={label} className="flex items-center">
                {complete ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 mr-1" aria-hidden="true" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground mr-1" aria-hidden="true" />
                )}
                {label}
              </span>
            ))}
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
