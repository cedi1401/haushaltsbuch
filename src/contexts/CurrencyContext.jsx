import React, { createContext, useContext } from "react";

const CurrencyContext = createContext((n) => String(n));

export function useFmt() {
  return useContext(CurrencyContext);
}

export default CurrencyContext;
