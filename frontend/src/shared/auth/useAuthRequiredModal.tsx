import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import AuthRequiredModal from "../../components/AuthRequiredModal";
import { getMe } from "../api/users";
import { signInWithGoogle } from "../firebase/auth";
import { useAuthState } from "../firebase/useAuthState";

export function useAuthRequiredModal(): {
  requireAuth: (onAuthed: () => Promise<void> | void) => void;
  modal: JSX.Element;
} {
  const { t } = useTranslation();
  const { configured, user } = useAuthState();

  // While Firebase auth state is still loading, we can still allow sign-in.
  // (Disabling it makes "auth required" clicks feel broken.)
  const canAuth = configured;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<null | (() => Promise<void>)>(null);

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
    pendingRef.current = null;
  }, [busy]);

  const continueAuth = useCallback(async () => {
    if (!canAuth || busy) return;

    setBusy(true);
    try {
      await signInWithGoogle();
      // Auth succeeded; immediately sync/load server profile.
      try {
        await getMe();
      } catch {
        // ignore
      }

      setOpen(false);

      const pending = pendingRef.current;
      pendingRef.current = null;

      if (pending) await pending();
    } catch (err) {
      console.error("Login failed:", err);
    } finally {
      setBusy(false);
    }
  }, [canAuth, busy]);

  const requireAuth = useCallback(
    (onAuthed: () => Promise<void> | void) => {
      if (user) {
        void Promise.resolve(onAuthed());
        return;
      }

      pendingRef.current = async () => {
        await onAuthed();
      };

      setOpen(true);
    },
    [user],
  );

  const modal = useMemo(() => {
    return (
      <AuthRequiredModal
        open={open}
        busy={busy}
        canAuth={canAuth}
        disabledReason={!configured ? t("firebaseNotConfigured") : undefined}
        onClose={close}
        onContinue={continueAuth}
      />
    );
  }, [open, busy, canAuth, configured, t, close, continueAuth]);

  return { requireAuth, modal };
}
