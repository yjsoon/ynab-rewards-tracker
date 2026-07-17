"use client";

import { useEffect, useState } from "react";

const RECOVERY_QUERY_PARAM = "moduleLoadRecovery";
const LAST_ATTEMPT_KEY = "ynab-counter:module-load-recovery-last-attempt";
const RETRY_COOLDOWN_MS = 60_000;
// Long enough to cover load-time chunk failures; after this the param is
// stripped so it doesn't leak into bookmarks or shared URLs.
const STRIP_PARAM_DELAY_MS = 10_000;

function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }

  if (typeof reason === "string") {
    return reason;
  }

  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message ?? "");
  }

  return "";
}

function isModuleLoadError(reason: unknown): boolean {
  const message = getErrorMessage(reason).toLowerCase();

  return (
    message.includes("importing a module script failed") ||
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("loading chunk") ||
    message.includes("chunkloaderror")
  );
}

// sessionStorage access throws in some privacy configurations; the recovery
// query param remains as the fallback loop guard when storage is unusable.
function readLastAttempt(): number {
  try {
    return Number(window.sessionStorage.getItem(LAST_ATTEMPT_KEY)) || 0;
  } catch {
    return 0;
  }
}

function recordAttempt(): void {
  try {
    window.sessionStorage.setItem(LAST_ATTEMPT_KEY, Date.now().toString());
  } catch {
    // Ignore; the query param still limits retries.
  }
}

function urlHasRecoveryParam(): boolean {
  return new URL(window.location.href).searchParams.has(RECOVERY_QUERY_PARAM);
}

function storageIsWritable(): boolean {
  try {
    window.sessionStorage.setItem(LAST_ATTEMPT_KEY, readLastAttempt().toString());
    return true;
  } catch {
    return false;
  }
}

function reloadWithCacheBuster(): void {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(RECOVERY_QUERY_PARAM, Date.now().toString());
  window.location.replace(nextUrl.toString());
}

export function ModuleLoadRecovery() {
  const [showRecoveryNotice, setShowRecoveryNotice] = useState(false);

  useEffect(() => {
    const stripParamTimer = window.setTimeout(() => {
      // When storage is blocked the cooldown guard can't work, so the param
      // must stay in the URL as the only protection against reload loops.
      if (!urlHasRecoveryParam() || !storageIsWritable()) {
        return;
      }
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete(RECOVERY_QUERY_PARAM);
      window.history.replaceState(window.history.state, "", nextUrl.toString());
    }, STRIP_PARAM_DELAY_MS);

    const recoverFromModuleLoadError = (reason: unknown) => {
      if (!isModuleLoadError(reason)) {
        return;
      }

      const alreadyRetried =
        urlHasRecoveryParam() ||
        Date.now() - readLastAttempt() < RETRY_COOLDOWN_MS;

      if (alreadyRetried) {
        setShowRecoveryNotice(true);
        return;
      }

      recordAttempt();
      reloadWithCacheBuster();
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      recoverFromModuleLoadError(event.reason);
    };

    const handleError = (event: ErrorEvent) => {
      recoverFromModuleLoadError(event.error ?? event.message);
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);

    return () => {
      window.clearTimeout(stripParamTimer);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  if (!showRecoveryNotice) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
      <span>
        We had trouble loading part of the app. Try reloading; if it keeps
        happening, clear this site&apos;s cache and refresh.
      </span>
      <button
        type="button"
        onClick={reloadWithCacheBuster}
        className="rounded border border-amber-300 px-2 py-1 font-medium hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/40">
        Reload page
      </button>
    </div>
  );
}
