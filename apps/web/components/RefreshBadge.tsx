import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RefreshBadgeProps {
  isRefreshing?: boolean;
  className?: string;
}

export function RefreshBadge({ isRefreshing, className }: RefreshBadgeProps) {
  if (!isRefreshing) {
    return null;
  }

  return (
    <div className={cn("absolute top-0 right-0 z-10", className)}>
      <div className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2 py-1 text-xs text-blue-600 dark:text-blue-400">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    </div>
  );
}