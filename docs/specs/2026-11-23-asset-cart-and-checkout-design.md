# Asset cart, skills and checkout — design

Date: 2026-11-23 · Owner: Ricardo Fagmer · Status: accepted (built without preview, by the owner's choice)

## Problem

The owner walks the catalog picking the assets for a video. Before the cart, every pick had
to be remembered and bound slot by slot in the receita editor. Skills could not be picked at
all, and a skill bound to a receita never reached any agent: the writer packet had one
optional `skillText` field that the script stage never filled.

## Goal

The owner adds any catalog item (skills included) to a cart, opens a checkout step in the
cart dialog that shows where each item will go, and creates a receita that uses everything;
"Salvar e criar vídeo" then starts a run with the leftovers as references.

## Chosen approach

1. **Cart** (already built): browser-local store of at most 50 rows `{ref, name, kind,
   status, sensitivity}`; add/remove on catalog cards, the asset page and (new) skill cards.
2. **Checkout step in the cart dialog**: the dialog gets a second view that groups the cart
   by destination:
   - *Receita slot*: template, voice, brand kit, music, prompts (as the editor fills them).
   - *Writer skills*: every active, non-biometric skill → one `skill:writer` binding each,
     at most 5 (the writer packet bound).
   - *Run references*: images, sound effects, reference videos and anything that cannot be
     pinned; they travel to `/execucoes/nova` as references.
   - *Not used*: inactive versions (and biometric rows as references).
   From there the owner opens a new receita (`/receitas/nova?carrinho=1`) or picks an
   existing one; the editor applies the same mapping.
3. **Writer receives several skills** (contract change, C7 writer packet):
   `inputs.skillText?: UntrustedText` becomes `inputs.skillTexts?: UntrustedText[]` (1..5).
   The core builder delimits each skill; the writer prompt (`writer@3`) renders one
   `Skill asset <n>:` block per skill in the cacheable stable block. The script stage reads
   each bound `skill:writer` entry file (SKILL.md) through the catalog's
   `GetEntryFileTextQuery`, never for biometric versions; an unreadable bound skill stops
   the stage as needs-person instead of running silently without it.

## Rejected alternative

*Pick a role per skill at checkout* (`skill:writer`, `skill:director`, ...): only the writer
packet has a skill field, so other roles would be stored but never used. Rejected until
other packets gain skill inputs.

## Acceptance criteria

- AC1: a skill card on `/skills` has the same add/remove cart button as catalog cards.
- AC2: the cart dialog has a "Finalizar" (checkout) step listing each item under its
  destination; from it the owner can create a new receita or open the receita list.
- AC3: applying the cart in the receita editor binds every active non-biometric cart skill
  (max 5) as `skill:writer`, shows them in a "Skills do roteirista" section with remove, and
  saving keeps them (several bindings with the same slot); `allowedKinds` includes `skill`.
- AC4: editing a receita that already has `skill:writer` bindings shows and keeps them.
- AC5: the script stage sends every bound `skill:writer` text to the writer as its own
  delimited block; biometric skills are never read; zero skills sends no field.
- AC6: the writer prompt version is `writer@3` with a changelog line.
- AC7: pt-BR, en and es texts for every new label.

## Contract notes

- `WriterPacketSchema.inputs.skillTexts`: `z.array(UntrustedTextSchema).min(1).max(5).optional()`.
  Old `skillText` had no producer, so no stored packet carries it.
- Recipe bindings already allow repeated slots; `agent-call-context` meters every
  `skill:<role>` ref.

## Verification

Typecheck, lint and the browser walkthrough run only at the final gate after the owner's
approval (`rules/verification.md`).
