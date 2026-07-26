"use client";

import { createContext, useContext, type ReactNode } from "react";

const RevealStepContext = createContext(0);

export function RevealProvider({
  step,
  children
}: {
  step: number;
  children: ReactNode;
}) {
  return (
    <RevealStepContext.Provider value={step}>
      {children}
    </RevealStepContext.Provider>
  );
}

export function Reveal({ at, children }: { at: number; children: ReactNode }) {
  const currentStep = useContext(RevealStepContext);
  return (
    <div className="reveal" data-visible={currentStep >= at} aria-hidden={currentStep < at}>
      {children}
    </div>
  );
}
