'use client';

import { Alert, Button, Card, FormField, Input, Select } from '@studio/ui';
import { type MetricImportReport } from '@studio/shared/api';
import { PlatformSchema, type Platform } from '@studio/shared/metrics';
import { useState, type FormEvent, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { localFileProblem, metricImportErrorText } from '../metric-import-model';
import { localTodayIso, platformLabels, platformOrder } from '../metric-labels';
import { browserMetricsApi } from '../metrics-api';
import styles from '../metrics.module.css';
import { MetricImportReportView } from './MetricImportReportView';

type ImportStage =
  | { status: 'editing' }
  | { status: 'checking' }
  | { status: 'checked'; report: MetricImportReport }
  | { status: 'importing'; report: MetricImportReport }
  | { status: 'imported'; report: MetricImportReport };

type FieldErrors = Partial<Record<'platform' | 'asOfDate' | 'file', string>>;

const PLATFORM_ID = 'importar-plataforma';
const DATE_ID = 'importar-data';
const FILE_ID = 'importar-arquivo';

/**
 * `/metricas/importar` (SPEC 0006 sections 5.3 and 5.9): platform, "Números referentes a", the CSV;
 * "Conferir" sends a dry run that writes nothing, then "Importar" sends the same file for real.
 * Changing any input after a check drops the report, so what is imported is always what was
 * checked. The file is uploaded as is and never read or shown by the web.
 */
export function MetricImportForm(): ReactElement {
  const t = useWebMessages();
  const texts = t.metrics.import;
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [asOfDate, setAsOfDate] = useState(() => localTodayIso());
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [stage, setStage] = useState<ImportStage>({ status: 'editing' });

  const platformOptions = platformOrder.map((option) => ({ value: option, label: platformLabels[option] }));
  const busy = stage.status === 'checking' || stage.status === 'importing';

  function edited(): void {
    setServerError(null);
    if (stage.status !== 'editing') setStage({ status: 'editing' });
  }

  function validate(): { platform: Platform; file: File } | null {
    const found: FieldErrors = {};
    if (platform === null) found.platform = texts.errors.platform;
    if (asOfDate === '') found.asOfDate = texts.errors.asOfDate;
    else if (asOfDate > localTodayIso()) found.asOfDate = texts.errors.future;
    if (file === null) found.file = texts.errors.file;
    else {
      const problem = localFileProblem(file, t);
      if (problem !== null) found.file = problem;
    }
    setErrors(found);
    const firstId = found.platform !== undefined ? PLATFORM_ID : found.asOfDate !== undefined ? DATE_ID : found.file !== undefined ? FILE_ID : null;
    if (firstId !== null) document.getElementById(firstId)?.focus();
    return platform === null || file === null || firstId !== null ? null : { platform, file };
  }

  async function send(dryRun: boolean): Promise<void> {
    if (busy) return;
    const valid = validate();
    if (valid === null) return;
    setServerError(null);
    const previous = stage.status === 'checked' ? stage.report : null;
    if (dryRun || previous === null) setStage({ status: 'checking' });
    else setStage({ status: 'importing', report: previous });
    try {
      const report = await browserMetricsApi.importMetrics({ fields: { platform: valid.platform, asOfDate }, file: valid.file, dryRun });
      setStage(dryRun ? { status: 'checked', report } : { status: 'imported', report });
    } catch (error) {
      setServerError(metricImportErrorText(error, valid.platform, t));
      setStage(previous === null ? { status: 'editing' } : { status: 'checked', report: previous });
    }
  }

  function startOver(): void {
    setFile(null);
    setFileInputKey((key) => key + 1);
    setErrors({});
    setServerError(null);
    setStage({ status: 'editing' });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void send(true);
  }

  const report = stage.status === 'editing' || stage.status === 'checking' ? null : stage.report;

  return (
    <div className={layout.stackLarge}>
      <form className={layout.form} onSubmit={handleSubmit} noValidate>
        {serverError !== null && <Alert variant="error">{serverError}</Alert>}
        <FormField id={PLATFORM_ID} label={texts.platform} error={errors.platform} disabled={busy}>
          {({ invalid, ...control }) => (
            <Select
              {...control}
              invalid={invalid}
              placeholder={texts.platformPlaceholder}
              options={platformOptions}
              value={platform ?? ''}
              onChange={(event) => {
                const parsed = PlatformSchema.safeParse(event.currentTarget.value);
                setPlatform(parsed.success ? parsed.data : null);
                edited();
              }}
            />
          )}
        </FormField>
        {platform !== null && (
          <Alert variant="info" title={texts.howToExport(platformLabels[platform])}>
            <span className={styles.instructions}>{`${texts.instructions[platform]} ${texts.noCredentials}`}</span>
          </Alert>
        )}
        <FormField
          id={DATE_ID}
          label={texts.asOfDate}
          help={texts.asOfDateHelp}
          error={errors.asOfDate}
          disabled={busy}
        >
          {({ invalid, ...control }) => (
            <Input
              {...control}
              type="date"
              invalid={invalid}
              max={localTodayIso()}
              value={asOfDate}
              onChange={(event) => {
                setAsOfDate(event.currentTarget.value);
                edited();
              }}
            />
          )}
        </FormField>
        <FormField id={FILE_ID} label={texts.file} help={texts.fileHelp} error={errors.file} disabled={busy}>
          {({ invalid, ...control }) => (
            <Input
              {...control}
              key={fileInputKey}
              type="file"
              accept=".csv,text/csv"
              invalid={invalid}
              onChange={(event) => {
                setFile(event.currentTarget.files?.[0] ?? null);
                edited();
              }}
            />
          )}
        </FormField>
        <div className={styles.actions}>
          <Button type="submit" variant={stage.status === 'checked' ? 'secondary' : 'primary'} loading={stage.status === 'checking'} loadingLabel={texts.checking} disabled={busy}>
            {texts.check}
          </Button>
          {(stage.status === 'checked' || stage.status === 'importing') && (
            <Button type="button" variant="primary" loading={stage.status === 'importing'} loadingLabel={texts.importing} disabled={busy} onClick={() => void send(false)}>
              {texts.import}
            </Button>
          )}
          {stage.status === 'imported' && (
            <Button type="button" variant="secondary" onClick={startOver}>
              {texts.importAnother}
            </Button>
          )}
        </div>
      </form>
      {report !== null && (
        <Card title={report.dryRun ? texts.reportDryRun : texts.reportDone}>
          <MetricImportReportView report={report} />
        </Card>
      )}
    </div>
  );
}
