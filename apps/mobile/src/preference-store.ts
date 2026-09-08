import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Small, non-secret preferences: the chosen language, the last context.
 *
 * Deliberately NOT the session store. These values are conveniences, so every
 * operation swallows its failure and returns a neutral answer — a phone that
 * cannot remember a language preference should still open in the device's
 * language rather than refuse to start.
 *
 * ## Why SecureStore and not AsyncStorage
 *
 * These are a handful of short strings, and the app already depends on
 * `expo-secure-store` for the credential. Adding `@react-native-async-storage`
 * for two keys would be a second storage dependency carrying no additional
 * capability. Encrypting a language choice costs nothing and reveals nothing.
 *
 * If preferences ever grow past a few short values, AsyncStorage becomes the
 * right home — SecureStore warns above ~2 KB per entry on Android — and this
 * module is the one place that would change.
 */

const memory = new Map<string, string>();

const usesMemory = Platform.OS === "web";

export const preferenceStore = {
  async get(key: string): Promise<string | null> {
    if (usesMemory) return memory.get(key) ?? null;
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (usesMemory) {
      memory.set(key, value);
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // A preference that could not be remembered is not worth an error
      // screen. The choice still applies for this run.
    }
  },
};
