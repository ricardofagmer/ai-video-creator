'use client';

import { Button, Checkbox, Input, Select, Table, type TableColumn } from '@studio/ui';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { newVariableRow, VARIABLES_FIELD_ID, type PromptVariableRow, type PromptVariableType } from './kind-details-model';

const variableTypeOptions: readonly { value: PromptVariableType; label: string }[] = [
  { value: 'string', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'boolean', label: 'Sim ou não' },
  { value: 'string-list', label: 'Lista de textos' },
];

function isVariableType(value: string): value is PromptVariableType {
  return variableTypeOptions.some((option) => option.value === value);
}

export interface PromptVariablesEditorProps {
  rows: readonly PromptVariableRow[];
  onChange: (rows: PromptVariableRow[]) => void;
  error?: string;
  disabled: boolean;
}

/** design/telas/04 "Campos do tipo", prompt: editable variables table (Nome · Tipo · Padrão). */
export function PromptVariablesEditor({ rows, onChange, error, disabled }: PromptVariablesEditorProps): ReactElement {
  const errorId = `${VARIABLES_FIELD_ID}-error`;

  function update(key: string, patch: Partial<PromptVariableRow>): void {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  const columns: readonly TableColumn<PromptVariableRow>[] = [
    {
      key: 'name',
      header: 'Nome',
      render: (row) => (
        <Input
          mono
          aria-label="Nome da variável"
          value={row.name}
          disabled={disabled}
          onChange={(event) => update(row.key, { name: event.currentTarget.value })}
        />
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (row) => (
        <Select
          aria-label="Tipo da variável"
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
      header: 'Padrão',
      render: (row) => (
        <Input
          aria-label="Valor padrão da variável"
          value={row.defaultText}
          disabled={disabled}
          onChange={(event) => update(row.key, { defaultText: event.currentTarget.value })}
        />
      ),
    },
    {
      key: 'required',
      header: 'Obrigatória',
      render: (row) => (
        <Checkbox
          id={`${row.key}-obrigatoria`}
          label={<span className="visually-hidden">Variável obrigatória</span>}
          checked={row.required}
          disabled={disabled}
          onChange={(event) => update(row.key, { required: event.currentTarget.checked })}
        />
      ),
    },
    {
      key: 'actions',
      header: <span className="visually-hidden">Ações</span>,
      align: 'end',
      render: (row) => (
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(rows.filter((candidate) => candidate.key !== row.key))}>
          Remover<span className="visually-hidden"> a variável {row.name}</span>
        </Button>
      ),
    },
  ];

  return (
    <div id={VARIABLES_FIELD_ID} tabIndex={-1} className={layout.stack} aria-describedby={error === undefined ? undefined : errorId}>
      <Table caption="Variáveis do prompt" columns={columns} rows={rows} rowKey={(row) => row.key} emptyText="Nenhuma variável." />
      {error !== undefined && (
        <p id={errorId} className={layout.fieldError}>
          {error}
        </p>
      )}
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onChange([...rows, newVariableRow()])}>
        Adicionar variável
      </Button>
    </div>
  );
}
