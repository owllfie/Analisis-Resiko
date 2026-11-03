import { createContext, useContext, useState } from 'react';

const SearchContext = createContext(null);

export function SearchProvider({ children }) {
  const [search, setSearch] = useState('');
  return <SearchContext.Provider value={{ search, setSearch }}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch harus dipakai di dalam SearchProvider');
  return ctx;
}
