// Re-export everything from the shared package
export * from '@ynab-counter/app-core/storage';

// Import and re-export the web-specific StorageService
export { StorageService } from './storage/service';
import { StorageService as WebStorageService } from './storage/service';

export const storage = new WebStorageService();
