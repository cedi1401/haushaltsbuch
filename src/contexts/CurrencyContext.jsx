import React, { createContext, useContext } from "react";

const defaultFmt = (n) => String(n);

// Holds both the formatter and the raw base-currency code so consumers can read
// either without prop-drilling. Value shape: `{ fmt, baseCurrency }`.
const CurrencyContext = createContext({ fmt: defaultFmt, baseCurrency: "CHF" });

export function useFmt() {
  return useContext(CurrencyContext).fmt;
}

export function useBaseCurrency() {
  return useContext(CurrencyContext).baseCurrency;
}

export default CurrencyContext;
