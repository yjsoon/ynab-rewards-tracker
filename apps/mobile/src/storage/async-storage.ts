import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'ynab-rewards-tracker:';

/**
 * AsyncStorage wrapper with typed helpers and namespace isolation
 * Note: PAT storage will be migrated to SecureStore in Phase 5 for better security
 */
export class AsyncStorageService {
  private static getKey(key: string): string {
    return `${STORAGE_PREFIX}${key}`;
  }

  static async getString(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(this.getKey(key));
    } catch (error) {
      if (__DEV__) {
        console.error(`AsyncStorageService.getString failed for key: ${key}`, error);
      }
      return null;
    }
  }

  static async setString(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(this.getKey(key), value);
    } catch (error) {
      if (__DEV__) {
        console.error(`AsyncStorageService.setString failed for key: ${key}`, error);
      }
      throw error;
    }
  }

  static async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.getKey(key));
    } catch (error) {
      if (__DEV__) {
        console.error(`AsyncStorageService.remove failed for key: ${key}`, error);
      }
      throw error;
    }
  }

  static async multiGet<TKey extends string>(keys: TKey[]): Promise<Record<TKey, string | null>> {
    try {
      const prefixedKeys = keys.map(k => this.getKey(k));
      const pairs = await AsyncStorage.multiGet(prefixedKeys);
      const result = {} as Record<TKey, string | null>;
      
      pairs.forEach(([prefixedKey, value], index) => {
        result[keys[index]] = value;
      });
      
      return result;
    } catch (error) {
      if (__DEV__) {
        console.error('AsyncStorageService.multiGet failed', error);
      }
      return {} as Record<TKey, string | null>;
    }
  }

  static async multiSet<TKey extends string>(entries: Array<[TKey, string]>): Promise<void> {
    try {
      const prefixedEntries = entries.map(([key, value]) => [this.getKey(key), value] as [string, string]);
      await AsyncStorage.multiSet(prefixedEntries);
    } catch (error) {
      if (__DEV__) {
        console.error('AsyncStorageService.multiSet failed', error);
      }
      throw error;
    }
  }

  static async clearNamespace(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const keysToRemove = allKeys.filter(key => key.startsWith(STORAGE_PREFIX));
      
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
      }
    } catch (error) {
      if (__DEV__) {
        console.error('AsyncStorageService.clearNamespace failed', error);
      }
      throw error;
    }
  }
}