import React, { createContext, useContext, useState, useCallback } from "react";

type Unit = "ml" | "oz";

interface UnitContextType {
  unit: Unit;
  toggleUnit: () => void;
  convert: (ml: number) => number;
  label: string;
}

const UnitContext = createContext<UnitContextType | undefined>(undefined);

function getStoredUnit(): Unit {
  try {
    const stored = localStorage.getItem("petlibro-unit");
    if (stored === "oz" || stored === "ml") return stored;
  } catch {}
  return "ml";
}

export function UnitProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnit] = useState<Unit>(getStoredUnit);

  const toggleUnit = useCallback(() => {
    setUnit((prev) => {
      const next = prev === "ml" ? "oz" : "ml";
      try {
        localStorage.setItem("petlibro-unit", next);
      } catch {}
      return next;
    });
  }, []);

  const convert = useCallback(
    (ml: number) => {
      if (unit === "oz") return Math.round(ml * 0.033814 * 100) / 100;
      return ml;
    },
    [unit]
  );

  const label = unit === "ml" ? "mL" : "fl oz";

  return (
    <UnitContext.Provider value={{ unit, toggleUnit, convert, label }}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnit() {
  const ctx = useContext(UnitContext);
  if (!ctx) throw new Error("useUnit must be used within a UnitProvider");
  return ctx;
}
