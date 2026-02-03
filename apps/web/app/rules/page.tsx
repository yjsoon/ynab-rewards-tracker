import { permanentRedirect } from 'next/navigation';

type RulesRedirectProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

/**
 * Legacy route redirect
 * Maintains backwards compatibility for bookmarks and external links
 * to the old /rules path, redirecting to /?tab=all while preserving query params
 */
export default function RulesRedirect({ searchParams }: RulesRedirectProps) {
  const params = new URLSearchParams();

  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (typeof value === 'string') {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined) {
          params.append(key, entry);
        }
      });
    }
  });

  const query = params.toString();
  params.set('tab', 'all');
  permanentRedirect(`/?${params.toString()}`);
}
