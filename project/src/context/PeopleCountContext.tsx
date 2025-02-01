import React, { createContext, useContext, useState, ReactNode } from 'react';

interface PeopleCountContextType {
  count: number;
  setCount: (count: number) => void;
}

const PeopleCountContext = createContext<PeopleCountContextType | undefined>(undefined);

export function PeopleCountProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  return (
    <PeopleCountContext.Provider value={{ count, setCount }}>
      {children}
    </PeopleCountContext.Provider>
  );
}

export function usePeopleCount() {
  const context = useContext(PeopleCountContext);
  if (context === undefined) {
    throw new Error('usePeopleCount must be used within a PeopleCountProvider');
  }
  return context;
}
