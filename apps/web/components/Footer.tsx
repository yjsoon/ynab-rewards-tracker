import { Github } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-16 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
            <span>
              Made by{" "}
              <a
                href="https://yjsoon.com"
                target="_blank"
                className="font-medium underline underline-offset-4 hover:text-primary">
                YJ Soon
              </a>{" "}
              from{" "}
              <a
                href="https://tinkercademy.com"
                target="_blank"
                className="font-medium underline underline-offset-4 hover:text-primary">
                Tinkercademy
              </a>{" "}
              in Singapore.
            </span>
            <span className="hidden sm:inline">•</span>
            <span className="inline-flex items-center">
              <a
                href="https://github.com/yjsoon/ynab-rewards-tracker"
                target="_blank"
                className="inline-flex items-center gap-1.5 font-medium underline underline-offset-4 hover:text-primary">
                <Github className="h-4 w-4" />
                <span>Open source</span>
              </a>
              <span className="ml-0.5">.</span>
            </span>
          </div>
          <p className="text-xs text-center text-muted-foreground">
            YJAB is not affiliated with or endorsed by{" "}
            <a
              href="https://www.ynab.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary">
              YNAB
            </a>
            . Free to use, with your own paid YNAB subscription.
          </p>
        </div>
      </div>
    </footer>
  );
}
