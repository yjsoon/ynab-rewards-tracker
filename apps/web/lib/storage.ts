// Re-export everything from the shared package
export * from '@ynab-counter/app-core/storage';

// Re-export types that live under the /storage/types subpath
export type { Card, CardSubcategory, CreditCard } from '@ynab-counter/app-core/storage/types';

// Import and re-export the web-specific StorageService
export { StorageService } from './storage/service';
import { StorageService as WebStorageService } from './storage/service';

export const storage = new WebStorageService();
