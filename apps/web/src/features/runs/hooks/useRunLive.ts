'use client';

import { type EventLogItem } from '@studio/ui';
import { type RunStateResponse } from '@studio/shared/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EVENT_LOG_LIMIT, appendEvents, toEventLogItem } from '../run-events';
import { isAbort, isEventLogReset } from '../run-error-text';
import { stopsPolling } from '../run-labels';
import { browserRunsApi } from '../runs-api';
import { usePageVisible } from './usePageVisible';

/** A17: one poll per second keeps criterion 14's 2 s bound with a missed tick to spare. */
export const POLL_INTERVAL_MS = 1000;
/**
 * The api answers at most 1 MiB of events per page (apps/api run-state.reader). A page that
 * advanced this far probably stopped at that cap, so the next page is read in the same tick.
 */
const FULL_PAGE_BYTES = 512 * 1024;
/** Bounds the catch-up work of one tick (a long log is read over several ticks). */
const MAX_EVENT_PAGES_PER_TICK = 8;

export type LiveConnection = 'live' | 'unreachable';

interface LiveState {
  state: RunStateResponse;
  events: readonly EventLogItem[];
  /** Epoch ms of the last successful poll. */
  lastUpdatedAtMs: number;
  /** Epoch ms of the last poll attempt, successful or not; drives "atualizado há N s". */
  checkedAtMs: number;
  connection: LiveConnection;
}

export interface RunLive extends LiveState {
  /** Polling is on: tab visible and the run not in a status that stops it. */
  polling: boolean;
  /** Polls now and restarts the loop, e.g. after an owner action. */
  refresh: () => void;
}

interface EventCursor {
  /** Byte offset of the first unread line of events.jsonl (`nextByte` of the last page). */
  nextByte: number;
  /** Count of events read so far; gives each EventLog row a stable key. */
  sequence: number;
}

interface EventsRead {
  cursor: EventCursor;
  items: EventLogItem[];
  /** The log was rewritten and read again from byte 0: the shown rows are replaced. */
  reset: boolean;
}

/**
 * Reads only what was appended since `start.nextByte` (never the whole log again). Works on a copy
 * of the cursor; the caller commits it together with the rows, so an aborted tick loses nothing.
 */
async function readNewEvents(runId: string, start: EventCursor, signal: AbortSignal): Promise<EventsRead> {
  const cursor = { ...start };
  let items: EventLogItem[] = [];
  let reset = false;
  for (let page = 0; page < MAX_EVENT_PAGES_PER_TICK; page += 1) {
    let response;
    try {
      response = await browserRunsApi.getRunEvents(runId, cursor.nextByte, signal);
    } catch (error) {
      if (reset || !isEventLogReset(error)) throw error;
      cursor.nextByte = 0;
      items = [];
      reset = true;
      continue;
    }
    const advancedBytes = response.nextByte - cursor.nextByte;
    for (const event of response.entries) {
      cursor.sequence += 1;
      items.push(toEventLogItem(event, cursor.sequence));
    }
    cursor.nextByte = response.nextByte;
    if (advancedBytes < FULL_PAGE_BYTES) break;
  }
  return { cursor, items: items.slice(-EVENT_LOG_LIMIT), reset };
}

/**
 * Live run state for `/execucoes/[runId]` (design/telas/08, A17). One loop, no overlap: read
 * `GET /runs/:runId`, then the new `events.jsonl` lines from `fromByte`, wait 1 s, repeat. The
 * state is read before the events so the log always covers the status shown. The loop stops when
 * the tab is hidden (and restarts on return) and when the run reaches a status that stops polling;
 * `refresh` restarts it. Api failures keep the last state and mark the connection unreachable.
 */
export function useRunLive(runId: string, initialState: RunStateResponse): RunLive {
  const visible = usePageVisible();
  const [wakeToken, setWakeToken] = useState(0);
  const cursorRef = useRef<EventCursor>({ nextByte: 0, sequence: 0 });
  const [live, setLive] = useState<LiveState>(() => {
    const startedAtMs = Date.now();
    return { state: initialState, events: [], lastUpdatedAtMs: startedAtMs, checkedAtMs: startedAtMs, connection: 'live' };
  });

  // Stable identity so the polling effect restarts only on visibility, run or wake changes.
  const pollOnce = useCallback(
    async (signal: AbortSignal): Promise<boolean> => {
      try {
        const state = await browserRunsApi.getRunState(runId, signal);
        const read = await readNewEvents(runId, cursorRef.current, signal);
        if (signal.aborted) return false;
        cursorRef.current = read.cursor;
        const atMs = Date.now();
        setLive((previous) => ({
          state,
          events: read.reset ? read.items : appendEvents(previous.events, read.items),
          lastUpdatedAtMs: atMs,
          checkedAtMs: atMs,
          connection: 'live',
        }));
        return !stopsPolling(state.displayedStatus);
      } catch (error) {
        if (isAbort(error) || signal.aborted) return false;
        setLive((previous) => ({ ...previous, checkedAtMs: Date.now(), connection: 'unreachable' }));
        return true;
      }
    },
    [runId],
  );

  useEffect(() => {
    if (!visible) return undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async (): Promise<void> => {
      const keepPolling = await pollOnce(controller.signal);
      if (keepPolling && !controller.signal.aborted) timer = setTimeout(() => void loop(), POLL_INTERVAL_MS);
    };
    void loop();
    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [visible, pollOnce, wakeToken]);

  const refresh = useCallback(() => setWakeToken((token) => token + 1), []);
  const polling = visible && !stopsPolling(live.state.displayedStatus);
  return { ...live, polling, refresh };
}
