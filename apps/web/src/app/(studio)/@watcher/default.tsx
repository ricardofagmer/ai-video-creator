import { ShellWatcherIndicator } from '@/features/runs/components/ShellWatcherIndicator';

/** Watcher-state slot of the shell (design/telas/01): `GET /watcher`, polled every 2 s (SPEC 0002 rev 4, R1-27). */
export default function WatcherSlot() {
  return <ShellWatcherIndicator />;
}
