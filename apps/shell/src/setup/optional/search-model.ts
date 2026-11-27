import { CLI_EXIT, runCli, type SetupContext } from '../setup-context';
import { httpsHostOf, isPositiveSize, isRecordObject, parseJson, type ComponentPresence, type OptionalComponent } from './optional-component';

/** Both committed files are a few kilobytes. */
const MAX_MODEL_FILE_BYTES = 64 * 1024;

/**
 * Host and total size from the staged `scripts/models/` files, the same pins `studio models fetch`
 * downloads against. A provisional pin (`pinState` other than `pinned`, a size of 0) offers nothing:
 * install.sh treats it the same way (exit 2 of the fetch script).
 */
async function modelOffer(context: SetupContext): Promise<{ host: string; sizeBytes: number } | null> {
  const [sourceRead, manifestRead] = await Promise.all([
    context.files.readText(context.paths.modelSource, MAX_MODEL_FILE_BYTES),
    context.files.readText(context.paths.modelManifest, MAX_MODEL_FILE_BYTES),
  ]);
  if (sourceRead.status !== 'read' || manifestRead.status !== 'read') return null;
  const source = parseJson(sourceRead.text);
  const manifest = parseJson(manifestRead.text);
  if (!isRecordObject(source) || !isRecordObject(manifest) || source['pinState'] !== 'pinned') return null;
  const host = httpsHostOf(source['host']);
  const filesRaw: unknown = manifest['files'];
  const files: readonly unknown[] = Array.isArray(filesRaw) ? filesRaw : [];
  if (host === null || files.length === 0) return null;
  let sizeBytes = 0;
  for (const file of files) {
    const size: unknown = isRecordObject(file) ? file['sizeBytes'] : null;
    if (!isPositiveSize(size)) return null;
    sizeBytes += size;
  }
  return { host, sizeBytes };
}

/** Install.sh step 7, through the CLI: `studio models verify` to look, `studio models fetch` to get it. */
export function searchModelComponent(context: SetupContext): OptionalComponent {
  return {
    id: 'search-model',
    async presence(): Promise<ComponentPresence> {
      const offer = await modelOffer(context);
      if (offer === null) return { kind: 'unavailable' };
      if ((await runCli(context, ['models', 'verify'])) === CLI_EXIT.ok) return { kind: 'installed' };
      return { kind: 'absent', offer: { component: 'search-model', ...offer } };
    },
    async install() {
      if ((await runCli(context, ['models', 'fetch'])) !== CLI_EXIT.ok) return false;
      return (await runCli(context, ['models', 'verify'])) === CLI_EXIT.ok;
    },
  };
}
