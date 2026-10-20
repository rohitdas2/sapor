"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SaporStore } from "./store";
import { ApiStore } from "./api-store";

const StoreContext = createContext<SaporStore | null>(null);

function createStore(): SaporStore {
  return new ApiStore();
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<SaporStore | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  // Resolve who is browsing (or anonymous) before first render so auth gates don't flash.
  useEffect(() => {
    let live = true;
    const s = createStore();
    s.init().then(
      () => live && setStore(s),
      () => live && setInitError("Couldn't connect to Sapor. Check your connection and reload."),
    );
    return () => {
      live = false;
    };
  }, []);
  if (initError) {
    return (
      <div role="alert" className="flex min-h-[60vh] items-center justify-center px-6 text-center text-tomato-dark">
        {initError}
      </div>
    );
  }
  if (!store) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-ink-soft" role="status">
        Loading Sapor…
      </div>
    );
  }
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

/** Bumps whenever the store changes so queries can re-run. */
function useStoreVersion(store: SaporStore) {
  const version = useRef(0);
  const subscribe = useCallback(
    (cb: () => void) =>
      store.subscribe(() => {
        version.current++;
        cb();
      }),
    [store],
  );
  return useSyncExternalStore(subscribe, () => version.current, () => 0);
}

export function useCurrentUserId() {
  const store = useStore();
  useStoreVersion(store);
  return store.currentUserId();
}

export function useMe() {
  const store = useStore();
  useStoreVersion(store);
  return store.me();
}

export function useQuery<T>(fn: (s: SaporStore) => Promise<T>, deps: unknown[]) {
  const store = useStore();
  const version = useStoreVersion(store);
  const [state, setState] = useState<{ data: T | undefined; error: string | null; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });
  useEffect(() => {
    let live = true;
    fn(store).then(
      (data) => live && setState({ data, error: null, loading: false }),
      (e: unknown) => live && setState({ data: undefined, error: e instanceof Error ? e.message : "Something went wrong.", loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, ...deps]);
  return state;
}
