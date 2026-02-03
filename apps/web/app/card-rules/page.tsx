import { permanentRedirect } from 'next/navigation';

type CardRulesRedirectProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

/**
 * Legacy route redirect
 * /card-rules consolidated into the Dashboard "All Cards" tab
 */
export default function CardRulesRedirect({ searchParams }: CardRulesRedirectProps) {
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

  params.set('tab', 'all');
  permanentRedirect(`/?${params.toString()}`);
}
