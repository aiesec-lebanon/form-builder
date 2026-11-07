'use client';
import * as React from 'react';

const LinkContext = React.createContext<React.ElementType>('a');

export interface LinkProviderProps {
  /** The router's link component, e.g. `next/link`. Default `'a'`. */
  component: React.ElementType;
  children?: React.ReactNode;
}

/** Makes every AIESEC component render links with your router's link (set once, in a client providers file). */
export function LinkProvider({ component, children }: LinkProviderProps) {
  return <LinkContext.Provider value={component}>{children}</LinkContext.Provider>;
}

/** The link element to render: an explicit override, else the provider's, else `<a>`. */
export function useLinkComponent(override?: React.ElementType): React.ElementType {
  const fromContext = React.useContext(LinkContext);
  return override ?? fromContext;
}
