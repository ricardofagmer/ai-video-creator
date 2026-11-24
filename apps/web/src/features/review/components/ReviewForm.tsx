'use client';

import { Alert, Button, Checklist, Dialog, FormField, RatingInput, Textarea, type RatingValue } from '@studio/ui';
import { type ReviewDecisionRequest } from '@studio/shared/api';
import { type ChecklistItem } from '@studio/shared/recipes';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { describeRunError } from '@/features/runs/run-error-text';
import { ApiRequestError } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { browserReviewApi } from '../review-api';

interface ReviewFormProps {
  runId: string;
  /** The recipe checklist pinned in run.json (`recipe.definition.checklist`). */
  checklist: readonly ChecklistItem[];
}

interface ReviewErrors {
  rating?: string;
  checklist?: string;
}

const RATING_NAME = 'nota';
const CHECKLIST_PREFIX = 'checklist-revisao';
const NOTES_ID = 'notas-revisao';
const REASON_ID = 'motivo-rejeicao';
const REJECT_FORM_ID = 'form-rejeicao';
/** Notes and reason share the C3 `notes` field (max 4000). */
const MAX_NOTES_LENGTH = 2000;
const MAX_REASON_LENGTH = 1900;

function focusRating(): void {
  document.querySelector<HTMLInputElement>(`input[name="${RATING_NAME}"]`)?.focus();
}

function focusChecklistItem(itemId: string): void {
  document.getElementById(`${CHECKLIST_PREFIX}-${itemId}`)?.focus();
}

/** Required checklist items the api reported unchecked on a 422 `required-checklist-unchecked`. */
function refusedItemIds(error: unknown): readonly string[] | null {
  if (!(error instanceof ApiRequestError) || error.reason !== 'required-checklist-unchecked') return null;
  return error.body?.details?.itemIds ?? [];
}

/**
 * Card "Sua revisão" form (design/telas/09, D14). "Aprovar" never sends while the rating is
 * missing or a required checklist item is unchecked; the api refuses the same case (R1-17) and
 * that refusal is shown too. `decidedBy` and `decidedAt` are never sent: the api takes them from
 * the session and its clock.
 */
export function ReviewForm({ runId, checklist }: ReviewFormProps): ReactElement {
  const t = useWebMessages();
  const texts = t.runs.review.form;
  const RATING_REQUIRED = texts.ratingRequired;
  const CHECKLIST_REQUIRED = texts.checklistRequired;
  const router = useRouter();
  const [rating, setRating] = useState<RatingValue | null>(null);
  const [notes, setNotes] = useState('');
  const [checked, setChecked] = useState<Readonly<Record<string, boolean>>>({});
  const [errors, setErrors] = useState<ReviewErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const items = checklist.map((item) => ({ id: item.id, label: item.label, required: item.required, checked: checked[item.id] === true }));
  const missingRequired = items.filter((item) => item.required && !item.checked).map((item) => item.id);

  function toggle(itemId: string, value: boolean): void {
    setChecked((previous) => ({ ...previous, [itemId]: value }));
  }

  function chooseRating(value: RatingValue): void {
    setRating(value);
    setErrors((previous) => ({ ...previous, rating: undefined }));
  }

  async function send(request: ReviewDecisionRequest): Promise<void> {
    setPending(request.outcome === 'approved' ? 'approve' : 'reject');
    setServerError(null);
    try {
      await browserReviewApi.recordReview(runId, request);
      setRejectOpen(false);
      // The page reads approval.json again and shows the read-only decision.
      router.refresh();
    } catch (error) {
      const refused = refusedItemIds(error);
      if (refused !== null) {
        setRejectOpen(false);
        setErrors((previous) => ({ ...previous, checklist: CHECKLIST_REQUIRED }));
        const first = refused[0] ?? missingRequired[0];
        if (first !== undefined) focusChecklistItem(first);
      }
      setServerError(describeRunError(error, t));
    } finally {
      setPending(null);
    }
  }

  function answers(): ReviewDecisionRequest['checklist'] {
    return items.map((item) => ({ itemId: item.id, checked: item.checked }));
  }

  function handleApprove(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending !== null) return;
    const found: ReviewErrors = {
      rating: rating === null ? RATING_REQUIRED : undefined,
      checklist: missingRequired.length > 0 ? CHECKLIST_REQUIRED : undefined,
    };
    setErrors(found);
    if (rating === null) {
      focusRating();
      return;
    }
    const firstMissing = missingRequired[0];
    if (firstMissing !== undefined) {
      focusChecklistItem(firstMissing);
      return;
    }
    void send({ outcome: 'approved', rating, notes: notes.trim(), checklist: answers() });
  }

  function openRejection(): void {
    if (rating === null) {
      setErrors((previous) => ({ ...previous, rating: RATING_REQUIRED }));
      focusRating();
      return;
    }
    setReasonError(null);
    setRejectOpen(true);
  }

  function handleReject(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed === '') {
      setReasonError(texts.reasonRequired);
      return;
    }
    if (rating === null || pending !== null) return;
    const ownerNotes = notes.trim();
    const combined = ownerNotes === '' ? `${texts.reason}: ${trimmed}` : `${texts.reason}: ${trimmed}\n\n${ownerNotes}`;
    void send({ outcome: 'rejected', rating, notes: combined, checklist: answers() });
  }

  return (
    <>
      <form className={layout.stack} onSubmit={handleApprove} noValidate aria-label={t.runs.review.yourReview}>
        {serverError !== null && !rejectOpen && <Alert variant="error">{serverError}</Alert>}
        <RatingInput name={RATING_NAME} value={rating} onChange={chooseRating} error={errors.rating} disabled={pending !== null} />
        <FormField id={NOTES_ID} label={texts.notes} optional help={texts.notesHelp} disabled={pending !== null}>
          {({ invalid, ...control }) => (
            <Textarea {...control} invalid={invalid} maxLength={MAX_NOTES_LENGTH} value={notes} onChange={(event) => setNotes(event.currentTarget.value)} />
          )}
        </FormField>
        {items.length > 0 && (
          <Checklist items={items} onChange={toggle} error={errors.checklist} disabled={pending !== null} idPrefix={CHECKLIST_PREFIX} />
        )}
        <div className={layout.formFooter}>
          <Button variant="secondary" disabled={pending !== null} onClick={openRejection}>
            {texts.reject}
          </Button>
          <Button type="submit" variant="primary" loading={pending === 'approve'} loadingLabel={texts.approving} disabled={pending === 'reject'}>
            {texts.approve}
          </Button>
        </div>
      </form>
      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        role="alertdialog"
        title={texts.rejectTitle}
        description={texts.rejectDescription}
        footer={
          <>
            <Button variant="secondary" disabled={pending === 'reject'} onClick={() => setRejectOpen(false)}>
              {texts.cancel}
            </Button>
            <Button type="submit" form={REJECT_FORM_ID} variant="danger" loading={pending === 'reject'} loadingLabel={texts.rejecting}>
              {texts.rejectVideo}
            </Button>
          </>
        }
      >
        <form id={REJECT_FORM_ID} className={layout.stack} onSubmit={handleReject} noValidate>
          {serverError !== null && <Alert variant="error">{serverError}</Alert>}
          <FormField id={REASON_ID} label={texts.reason} error={reasonError ?? undefined}>
            {({ invalid, ...control }) => (
              <Textarea {...control} invalid={invalid} maxLength={MAX_REASON_LENGTH} value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
            )}
          </FormField>
        </form>
      </Dialog>
    </>
  );
}
