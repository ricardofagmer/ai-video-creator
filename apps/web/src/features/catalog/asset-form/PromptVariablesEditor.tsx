'use client';

import { Button, Checkbox, Input, Select, Table, type TableColumn } from '@studio/ui';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { newVariableRow, VARIABLES_FIELD_ID, type PromptVariableRow, type PromptVariableType } from './kind-details-model';

const variableTypes: readonly PromptVariableType[] = ['string', 'number', 'boolean', 'string-list'];

function isVariableType(value: string): value is PromptVariableType {
  return variableTypes.some((type) => type === value);
}

export interface PromptVariablesEditorProps {
  rows: readonly PromptVariableRow[];
  onChange: (rows: PromptVariableRow[]) => void;
  error?: string;
  disabled: boolean;
}

/** design/telas/04 "Campos do tipo", prompt: editable variables table (Nome · Tipo · Padrão). */
export function PromptVariablesEditor({ rows, onChange, error, disabled }: PromptVariablesEditorProps): ReactElement {
  const t = useWebMessages().catalog.form.variables;
  const variableTypeOptions = variableTypes.map((type) => ({ value: type, label: t.types[type] }));
  const errorId = `${VARIABLES_FIELD_ID}-error`;

  function update(key: string, patch: Partial<PromptVariableRow>): void {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  const columns: readonly TableColumn<PromptVariableRow>[] = [
    {
      key: 'name',
      header: t.name,
      render: (row) => (
        <Input
          mono
          aria-label={t.nameLabel}
          value={row.name}
          disabled={disabled}
          onChange={(event) => update(row.key, { name: event.currentTarget.value })}
        />
      ),
    },
    {
      key: 'type',
      header: t.type,
      render: (row) => (
        <Select
          aria-label={t.typeLabel}
          options={variableTypeOptions}
          value={row.type}
          disabled={disabled}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (isVariableType(value)) update(row.key, { type: value });
          }}
        />
      ),
    },
    {
      key: 'default',
      header: t.default,
      render: (row) => (
        <Input
          aria-label={t.defaultLabel}
          value={row.defaultText}
          disabled={disabled}
          onChange={(event) => update(row.key, { defaultText: event.currentTarget.value })}
        />
      ),
    },
    {
      key: 'required',
      header: t.required,
      render: (row) => (
        <Checkbox
          id={`${row.key}-obrigatoria`}
          label={<span className="visually-hidden">{t.requiredLabel}</span>}
          checked={row.required}
          disabled={disabled}
          onChange={(event) => update(row.key, { required: event.currentTarget.checked })}
        />
      ),
    },
    {
      key: 'actions',
      header: <span className="visually-hidden">{t.actions}</span>,
      align: 'end',
      render: (row) => (
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(rows.filter((candidate) => candidate.key !== row.key))}>
          {t.remove}
          <span className="visually-hidden">{t.removeHidden(row.name)}</span>
        </Button>
      ),
    },
  ];

  return (
    <div id={VARIABLES_FIELD_ID} tabIndex={-1} className={layout.stack} aria-describedby={error === undefined ? undefined : errorId}>
      <Table caption={t.caption} columns={columns} rows={rows} rowKey={(row) => row.key} emptyText={t.empty} />
      {error !== undefined && (
        <p id={errorId} className={layout.fieldError}>
          {error}
        </p>
      )}
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onChange([...rows, newVariableRow()])}>
        {t.add}
      </Button>
    </div>
  );
}
