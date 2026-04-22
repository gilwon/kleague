'use client';

import { createContext, useContext, type ReactNode } from 'react';

const ThemeCtx = createContext({ resolvedTheme: 'dark', setTheme: (_t: string) => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeCtx.Provider value={{ resolvedTheme: 'dark', setTheme: () => {} }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
