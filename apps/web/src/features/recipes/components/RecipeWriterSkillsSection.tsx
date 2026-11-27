'use client';

import { Button, Card, FormField, Icon, Select } from '@studio/ui';
import { WRITER_SKILLS_MAX } from '@studio/shared/agents';
import { type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { type BindingOption } from '../recipe-form-model';
import styles from './RecipeWriterSkillsSection.module.css';

const ADD_SKILL_FIELD_ID = 'vinculo-skill-writer-nova';

export interface RecipeWriterSkillsSectionProps {
  options: readonly BindingOption[];
  writerSkills: readonly string[];
  onChange: (writerSkills: readonly string[]) => void;
}

/**
 * The Scriptwriter's skills (`skill:writer`): each chosen skill version reaches the script stage as
 * its own delimited block. Only names and refs are shown; the skill text is never fetched here.
 */
export function RecipeWriterSkillsSection({ options, writerSkills, onChange }: RecipeWriterSkillsSectionProps): ReactElement {
  const t = useWebMessages();
  const texts = t.recipes.writerSkills;
  const skillOptions = options.filter((option) => option.kind === 'skill');
  const choices = skillOptions.filter((option) => !writerSkills.includes(option.ref)).map((option) => ({ value: option.ref, label: option.label }));
  const full = writerSkills.length >= WRITER_SKILLS_MAX;
  const labelOf = (ref: string): string => skillOptions.find((option) => option.ref === ref)?.label ?? ref;

  return (
    <Card title={texts.title} description={texts.description(WRITER_SKILLS_MAX)}>
      <div className={styles.stack}>
        {writerSkills.length === 0 ? (
          <p className="body-sm">{texts.empty}</p>
        ) : (
          <ul className={styles.list}>
            {writerSkills.map((ref) => (
              <li key={ref} className={styles.item}>
                <span className={styles.name}>{labelOf(ref)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(writerSkills.filter((candidate) => candidate !== ref))}
                  aria-label={texts.removeHidden(labelOf(ref))}
                >
                  <Icon name="trash" size="sm" />
                  <span>{texts.remove}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <FormField id={ADD_SKILL_FIELD_ID} label={texts.add} help={full ? texts.full(WRITER_SKILLS_MAX) : undefined}>
          {({ invalid, ...control }) => (
            <Select
              {...control}
              invalid={invalid}
              disabled={full || choices.length === 0}
              options={choices}
              placeholder={choices.length === 0 ? texts.noneAvailable : texts.choose}
              value=""
              onChange={(event) => {
                const ref = event.currentTarget.value;
                if (ref !== '' && !full) onChange([...writerSkills, ref]);
              }}
            />
          )}
        </FormField>
      </div>
    </Card>
  );
}
