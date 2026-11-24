import { type SetupContext } from '../setup-context';
import { type SetupRecord } from '../setup-record';
import { type OptionalComponentId, type OptionalComponentState, type OptionalComponentsReport, type SetupStep, type StepRunResult } from '../setup-types';
import { captureBrowserComponent } from '../optional/capture-browser';
import { searchModelComponent } from '../optional/search-model';
import { type OptionalComponent } from '../optional/optional-component';

function componentsOf(context: SetupContext): readonly OptionalComponent[] {
  return [searchModelComponent(context), captureBrowserComponent(context)];
}

function wasDeclined(record: SetupRecord, id: OptionalComponentId): boolean {
  return record.declined.includes(id);
}

function withDeclined(id: OptionalComponentId): (record: SetupRecord) => SetupRecord {
  return (record) => (record.declined.includes(id) ? record : { ...record, declined: [...record.declined, id] });
}

/** Asks once for one absent component; true when it ended installed or declined, false on a failed download. */
async function offerComponent(context: SetupContext, component: OptionalComponent): Promise<boolean> {
  const presence = await component.presence();
  if (presence.kind !== 'absent') return true;
  if (wasDeclined(await context.record.read(), component.id)) return true;
  const answer = await context.interaction.requestConsent(presence.offer);
  if (answer === 'declined') {
    await context.record.update(withDeclined(component.id));
    context.log({ event: 'download-declined', component: component.id });
    return true;
  }
  return component.install();
}

/**
 * Step 5 (install.sh steps 7 and 9). Each absent component is offered with its host and size, and
 * nothing is fetched without an explicit yes. A refusal is remembered and setup completes with that
 * component `not-installed` (DI-AC-04); a failed download warns and setup still completes. The
 * search model can be added later with `studio models fetch`, never silently by a later launch.
 */
export function optionalDownloadsStep(context: SetupContext): SetupStep {
  const components = componentsOf(context);
  return {
    id: 'optional-downloads',
    required: false,
    async check() {
      const record = await context.record.read();
      for (const component of components) {
        if (wasDeclined(record, component.id)) continue;
        if ((await component.presence()).kind === 'absent') return { kind: 'needed' };
      }
      return { kind: 'done' };
    },
    async run(): Promise<StepRunResult> {
      let failed = false;
      for (const component of components) {
        if (!(await offerComponent(context, component))) failed = true;
      }
      return failed ? { kind: 'warning', reason: 'download-failed' } : { kind: 'done' };
    },
  };
}

async function stateOf(component: OptionalComponent): Promise<OptionalComponentState> {
  return (await component.presence()).kind === 'installed' ? 'installed' : 'not-installed';
}

/** C1 report of the two components, read from the machine once setup has finished. */
export async function optionalComponentsReport(context: SetupContext): Promise<OptionalComponentsReport> {
  const [searchModel, captureBrowser] = await Promise.all([stateOf(searchModelComponent(context)), stateOf(captureBrowserComponent(context))]);
  return { searchModel, captureBrowser };
}
