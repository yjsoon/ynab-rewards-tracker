import Link from "next/link";

import { Button } from "@/components/ui/button";
import { BrandTile } from "@/components/icons/BrandIcons";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6 p-6 text-center">
      <BrandTile className="h-20 w-20 opacity-90" aria-hidden="true" />
      <div>
        <h1 className="text-3xl font-bold mb-2">Page not found</h1>
        <p className="text-muted-foreground max-w-md">
          This page seems to have wandered off the statement. Check the address,
          or head back to your dashboard.
        </p>
      </div>
      <Button asChild size="lg">
        <Link href="/">Back to Dashboard</Link>
      </Button>
    </div>
  );
}
