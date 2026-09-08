import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { SessionStore } from "@labourmarket/client-core";

/**
 * The credential lives in the operating system's keychain.
 *
 * Not AsyncStorage. AsyncStorage is an unencrypted file inside the app
 * sandbox, readable on a rooted or jailbroken device and often included in
 * device backups. `expo-secure-store` is Keychain Services on iOS and
 * EncryptedSharedPreferences on Android — hardware-backed where the device
 * offers it.
 *
 * This adapter never swallows a failure. If the keychain is locked or absent,
 * the error propagates to `readStoredSession`, which turns it into
 * `unavailable` — deliberately NOT `signed_out`. A person on a train must not
 * be signed out of a working session because their phone briefly refused to
 * open its keychain.
 */

/**
 * Web is supported only so the shell can be run and inspected in a browser
 * during development. `expo-secure-store` has no web implementation, and there
 * is no honest browser equivalent of a hardware keychain — `localStorage` is
 * readable by any script on the origin.
 *
 * So on web this store REFUSES rather than silently downgrading. The session
 * then reads as `unavailable`, which is exactly true: this platform cannot
 * hold a credential securely. The production web client is the Next.js app,
 * which uses http-only cookies and never had this problem.
 */
class WebKeychainUnavailable extends Error {
  constructor() {
    super("secure storage is not available on this platform");
    this.name = "WebKeychainUnavailable";
  }
}

export const secureSessionStore: SessionStore = {
  async get(key) {
    if (Platform.OS === "web") throw new WebKeychainUnavailable();
    return SecureStore.getItemAsync(key);
  },
  async set(key, value) {
    if (Platform.OS === "web") throw new WebKeychainUnavailable();
    await SecureStore.setItemAsync(key, value, {
      // The credential is not needed while the phone is locked — nothing in
      // this app runs in the background — so the strictest class that still
      // survives a reboot is the right one.
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  async remove(key) {
    if (Platform.OS === "web") throw new WebKeychainUnavailable();
    await SecureStore.deleteItemAsync(key);
  },
};

/**
 * An in-memory store, used only where the keychain cannot be: the development
 * web preview. It is explicitly NOT persistent, so nobody can mistake the web
 * preview for a signed-in state that survives a reload.
 */
export function memorySessionStore(): SessionStore {
  const data = new Map<string, string>();
  return {
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
  };
}

export const sessionStore: SessionStore =
  Platform.OS === "web" ? memorySessionStore() : secureSessionStore;
