import { useEffect, useState } from "react";

import { applyTheme, getInitialTheme, toggleTheme } from "./theme";

type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return {
    theme,
    toggle: () => setTheme((t) => toggleTheme(t)),
  } as const;
}
