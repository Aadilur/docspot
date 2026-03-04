import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { getMe, type UserRecord } from "../api/users";
import { useAuthState } from "../firebase/useAuthState";

type MeContextValue = {
  me: UserRecord | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<UserRecord | null>;
  setMe: (next: UserRecord | null) => void;
};

const MeContext = createContext<MeContextValue | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const { configured, loading: authLoading, user } = useAuthState();

  const [me, setMeState] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef<Promise<UserRecord | null> | null>(null);
  const lastResolvedUidRef = useRef<string | null>(null);

  const setMe = useCallback((next: UserRecord | null) => {
    setMeState(next);
  }, []);

  const refresh = useCallback(async (): Promise<UserRecord | null> => {
    if (!configured || authLoading || !user) {
      setMeState(null);
      setLoading(false);
      setError(null);
      inFlightRef.current = null;
      lastResolvedUidRef.current = null;
      return null;
    }

    if (inFlightRef.current) return await inFlightRef.current;

    setLoading(true);
    setError(null);

    const p = (async () => {
      try {
        const record = await getMe();
        setMeState(record);
        lastResolvedUidRef.current = user.uid;
        return record;
      } catch (e) {
        setMeState(null);
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setLoading(false);
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = p;
    return await p;
  }, [configured, authLoading, user]);

  useEffect(() => {
    if (!configured) {
      setMeState(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (authLoading) return;

    if (!user) {
      setMeState(null);
      setLoading(false);
      setError(null);
      inFlightRef.current = null;
      lastResolvedUidRef.current = null;
      return;
    }

    if (lastResolvedUidRef.current === user.uid && me) return;

    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, authLoading, user?.uid]);

  return (
    <MeContext.Provider value={{ me, loading, error, refresh, setMe }}>
      {children}
    </MeContext.Provider>
  );
}

export function useMe(): MeContextValue {
  const ctx = useContext(MeContext);
  if (!ctx) {
    throw new Error("useMe must be used within <MeProvider />");
  }
  return ctx;
}
