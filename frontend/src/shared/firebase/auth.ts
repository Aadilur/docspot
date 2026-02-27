import {
  browserLocalPersistence,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  setPersistence,
  signInWithPopup,
  signOut,
  type UserCredential,
} from "firebase/auth";

import { getFirebaseAuth } from "./firebase";

export async function signInWithGoogle(): Promise<UserCredential> {
  const auth = getFirebaseAuth();

  // Avoid storing tokens in localStorage manually.
  // Let Firebase handle persistence (prefer IndexedDB when available).
  try {
    await setPersistence(auth, indexedDBLocalPersistence);
  } catch {
    await setPersistence(auth, browserLocalPersistence);
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return await signInWithPopup(auth, provider);
}

export async function signOutUser(): Promise<void> {
  await signOut(getFirebaseAuth());
}
