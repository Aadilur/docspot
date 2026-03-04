import { useCallback, useMemo, useRef, useState } from "react";

import { ADSENSE_SLOTS } from "./config";
import { AdGateModal } from "./AdGateModal";
import { useAdsEnabled } from "./useAdsEnabled";

export function useAdGate(opts?: { seconds?: number }): {
  available: boolean;
  run: (action: () => Promise<void> | void) => void;
  modal: JSX.Element;
} {
  const seconds = opts?.seconds ?? 14;

  const { enabled } = useAdsEnabled();
  const hasGateSlot = !!(ADSENSE_SLOTS.gate || "").trim();

  const available = enabled && hasGateSlot;

  const [open, setOpen] = useState(false);
  const pendingActionRef = useRef<null | (() => Promise<void>)>(null);

  const run = useCallback(
    (action: () => Promise<void> | void) => {
      if (!available) {
        void Promise.resolve(action());
        return;
      }

      if (open) return;

      pendingActionRef.current = async () => {
        await action();
      };
      setOpen(true);
    },
    [available, open],
  );

  const onClose = useCallback(() => {
    setOpen(false);

    const action = pendingActionRef.current;
    pendingActionRef.current = null;

    if (action) void action();
  }, []);

  const modal = useMemo(() => {
    return <AdGateModal open={open} seconds={seconds} onClose={onClose} />;
  }, [open, seconds, onClose]);

  return { available, run, modal };
}
