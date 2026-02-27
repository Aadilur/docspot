import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";

import { getFirebaseAuth, isFirebaseConfigured } from "./firebase";

type AuthState = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  error: string | null;
};

export function useAuthState(): AuthState {
  const configured = isFirebaseConfigured();
  const [state, setState] = useState<AuthState>({
    configured,
    loading: configured,
    user: null,
    error: null,
  });

  useEffect(() => {
    if (!configured) {
      setState({ configured: false, loading: false, user: null, error: null });
      return;
    }

    let unsubscribe: (() => void) | null = null;

    try {
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          setState({ configured: true, loading: false, user, error: null });
        },
        (err) => {
          setState({
            configured: true,
            loading: false,
            user: null,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      );
    } catch (e) {
      setState({
        configured: true,
        loading: false,
        user: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [configured]);

  return state;
}
