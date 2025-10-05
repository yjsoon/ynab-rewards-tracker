import { StorageService } from './storage/service';

export * from './storage/types';
export { StorageService } from './storage/service';

export const storage = new StorageService();
