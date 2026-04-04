"use client";

import type { ReactNode } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DashboardPeriodNavigatorProps {
  dateValue: string;
  monthLabel: string;
  asOfLabel: string;
  triggerLabel: string;
  maxDateValue: string;
  isToday: boolean;
  onPreviousDay(): void;
  onNextDay(): void;
  onPreviousMonth(): void;
  onNextMonth(): void;
  onReset(): void;
  onDateChange(value: string): void;
}

interface StepperRowProps {
  label: string;
  backLabel: string;
  forwardLabel: string;
  onBack(): void;
  onForward(): void;
  disableForward?: boolean;
  backIcon: ReactNode;
  forwardIcon: ReactNode;
}

function StepperRow({
  label,
  backLabel,
  forwardLabel,
  onBack,
  onForward,
  disableForward = false,
  backIcon,
  forwardIcon,
}: StepperRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} aria-label={backLabel}>
          {backIcon}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onForward}
          disabled={disableForward}
          aria-label={forwardLabel}
        >
          {forwardIcon}
        </Button>
      </div>
    </div>
  );
}

export function DashboardPeriodNavigator({
  dateValue,
  monthLabel,
  asOfLabel,
  triggerLabel,
  maxDateValue,
  isToday,
  onPreviousDay,
  onNextDay,
  onPreviousMonth,
  onNextMonth,
  onReset,
  onDateChange,
}: DashboardPeriodNavigatorProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="group shrink-0 gap-1.5 px-2.5 data-[state=open]:bg-red-50 data-[state=open]:text-red-700 hover:data-[state=open]:bg-red-50 hover:data-[state=open]:text-red-700 dark:data-[state=open]:bg-red-950/40 dark:data-[state=open]:text-red-300"
        >
          <span className="flex items-center gap-2">
            {isToday ? <CalendarDays className="h-4 w-4" /> : <History className="h-4 w-4" />}
            <span>{triggerLabel}</span>
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground transition-colors group-data-[state=open]:text-red-600 dark:group-data-[state=open]:text-red-300" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[calc(100vw-2rem)] max-w-sm space-y-3 p-3 sm:w-80"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              {isToday ? <CalendarDays className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
              <span>{isToday ? "Live snapshot" : "Historical snapshot"}</span>
            </div>
            <div className="text-base font-semibold">{asOfLabel}</div>
            <div className="text-sm text-muted-foreground">{monthLabel}</div>
          </div>

          {!isToday && (
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onReset}>
              Today
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="dashboard-as-of-date" className="text-xs font-medium text-muted-foreground">
            Jump to date
          </label>
          <Input
            id="dashboard-as-of-date"
            type="date"
            value={dateValue}
            max={maxDateValue}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <StepperRow
            label="Day"
            backLabel="Go back 1 day"
            forwardLabel="Go forward 1 day"
            onBack={onPreviousDay}
            onForward={onNextDay}
            disableForward={isToday}
            backIcon={<ChevronLeft className="h-4 w-4" />}
            forwardIcon={<ChevronRight className="h-4 w-4" />}
          />
          <StepperRow
            label="Month"
            backLabel="Go back 1 month"
            forwardLabel="Go forward 1 month"
            onBack={onPreviousMonth}
            onForward={onNextMonth}
            disableForward={isToday}
            backIcon={<ChevronsLeft className="h-4 w-4" />}
            forwardIcon={<ChevronsRight className="h-4 w-4" />}
          />
        </div>

        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-xs",
            isToday
              ? "border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
          )}
        >
          {isToday
            ? "Live mode shows rewards with today’s current progress."
            : "Rewind mode shows rewards and spend as they stood on the selected day."}
        </div>
      </PopoverContent>
    </Popover>
  );
}
