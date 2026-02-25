class StorageManager {
  /**
   * Retrieves a value from local storage by key
   * @param key The key to retrieve
   * @returns The value associated with the key or null if not found
   */
  getLocal<T>(key: string): T | null {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Error getting local storage item for key "${key}":`, error);
      return null;
    }
  }

  /**
   * Retrieves a value from session storage by key
   * @param key The key to retrieve
   * @returns The value associated with the key or null if not found
   */
  getSession<T>(key: string): T | null {
    try {
      const value = sessionStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Error getting session storage item for key "${key}":`, error);
      return null;
    }
  }

  /**
   * Sets a value in local storage
   * @param key The key to set
   * @param value The value to store
   * @returns Boolean indicating success
   */
  setLocal<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error setting local storage item for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Sets a value in session storage
   * @param key The key to set
   * @param value The value to store
   * @returns Boolean indicating success
   */
  setSession<T>(key: string, value: T): boolean {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error setting session storage item for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Removes a value from local storage
   * @param key The key to remove
   */
  removeLocal(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing local storage item for key "${key}":`, error);
    }
  }

  /**
   * Removes a value from session storage
   * @param key The key to remove
   */
  removeSession(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing session storage item for key "${key}":`, error);
    }
  }
}

export default StorageManager;