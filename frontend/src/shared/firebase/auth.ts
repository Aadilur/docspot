import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type UserCredential,
} from "firebase/auth";

import { getFirebaseAuth } from "./firebase";

export async function signInWithGoogle(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return await signInWithPopup(getFirebaseAuth(), provider);
}

export async function signOutUser(): Promise<void> {
  await signOut(getFirebaseAuth());
}
