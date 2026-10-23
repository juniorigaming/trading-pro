"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const getServerSnapshot = () => "UTC";

/** The browser timezone, with a deterministic server/hydration snapshot. */
export function useLocalTimeZone() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
