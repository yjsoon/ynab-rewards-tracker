"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface DashboardQuickStatsProps {
  selectedBudget: {
    id?: string;
    name?: string;
  };
  trackedAccountCount: number;
}

export function DashboardQuickStats({ selectedBudget, trackedAccountCount }: DashboardQuickStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Budget</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold truncate">{selectedBudget.name || "None Selected"}</p>
          {selectedBudget.id && (
            <Button variant="link" size="sm" asChild className="px-0">
              <Link href="/settings#settings-budget">Change</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tracked Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{trackedAccountCount}</p>
          <Button variant="link" size="sm" asChild className="px-0">
            <Link href="/settings#settings-accounts">Manage</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
