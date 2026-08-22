export function formatLastUpdated(isoString: string | null): string | null {
  if (!isoString) {
    return null;
  }

  const date = new Date(isoString);
  const now = new Date();

  if (date.getTime() > now.getTime()) {
    return 'just now';
  }

  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return 'just now';
  }
  if (diffMins === 1) {
    return '1 min ago';
  }
  if (diffMins < 60) {
    return `${diffMins} mins ago`;
  }

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) {
    return '1 hour ago';
  }
  if (diffHours < 24) {
    return `${diffHours} hours ago`;
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
