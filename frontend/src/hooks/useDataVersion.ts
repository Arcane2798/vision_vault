import { useSyncExternalStore } from 'react';

/** Data that can be changed from outside the page showing it (e.g. confirmed from the assistant chat). */
export type DataTopic = 'incidents' | 'people';

const versions: Record<DataTopic, number> = { incidents: 0, people: 0 };
const listeners = new Set<() => void>();

/** Tell every page showing this data to re-fetch it. */
export function notifyDataChanged(topic: DataTopic) {
  versions[topic] += 1;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A counter that changes whenever the topic's data changed elsewhere - put it in useAsync deps. */
export function useDataVersion(topic: DataTopic): number {
  return useSyncExternalStore(subscribe, () => versions[topic]);
}
