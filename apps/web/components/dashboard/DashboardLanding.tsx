"use client";

import Link from "next/link";
import { Wallet, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DashboardLanding() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <div className="max-w-6xl w-full">
        <div className="text-center mb-12">
          <Wallet className="h-16 w-16 text-primary mx-auto mb-4" aria-hidden="true" />
          <h1 className="text-4xl font-bold mb-2">
            <span>YJAB</span>
            <span className="text-muted-foreground font-normal">
              : YNAB Journal of Awards & Bonuses
            </span>
          </h1>
          <p className="text-xl text-muted-foreground">
            Maximise your credit card rewards with intelligent tracking
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          <Card className="p-8">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-xl mb-4">Features</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <ul className="space-y-4">
                {[
                  "Automatically calculate rewards based on your actual spending",
                  "Track progress toward monthly minimum spend and caps",
                  "Get recommendations for which card to use for each purchase",
                  "100% private — all data stays in your browser",
                ].map((text) => (
                  <li key={text} className="flex items-start">
                    <CheckCircle2
                      className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-foreground">{text}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground mt-6">
                Free to use, with your own paid YNAB subscription.
              </p>
            </CardContent>
          </Card>

          <Card className="p-8 flex flex-col justify-center border-2">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-xl mb-2">Get Started</CardTitle>
              <CardDescription className="text-base">
                Connect your YNAB account to start tracking rewards across all your cards
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm font-medium mb-2">Quick Setup:</p>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Connect with your Personal Access Token</li>
                    <li>Select your budget and accounts</li>
                    <li>Configure your reward cards</li>
                    <li>Start tracking automatically</li>
                  </ol>
                </div>

                <Button size="lg" asChild className="w-full">
                  <Link href="/settings">
                    <Wallet className="mr-2 h-5 w-5" aria-hidden="true" />
                    Connect YNAB Account
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
