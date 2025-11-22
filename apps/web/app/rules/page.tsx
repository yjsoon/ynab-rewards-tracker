import { redirect } from 'next/navigation';

/**
 * Legacy route redirect
 * Maintains backwards compatibility for bookmarks and external links
 * to the old /rules path, redirecting to /card-rules
 */
export default function RulesRedirect() {
  redirect('/card-rules');
}
