import { type AssetKind } from '@studio/shared/catalog';
import { type CartAssetContent } from './cart-asset-content';
import { cartAssetDetailLines, type CartAssetDetailLabels } from './cart-asset-details';
import { cartDestinationOrder, type CartDestination } from './cart-bindings';
import { type CartItem } from './cart-store';

export interface CartVideoPromptTexts {
  heading: string;
  intro: string;
  siteHeading: string;
  instructionsHeading: string;
  fields: CartAssetDetailLabels;
}

export interface CartVideoPromptInput {
  cart: readonly CartItem[];
  destinations: ReadonlyMap<string, CartDestination>;
  /** What was read of each item, by ref; an item with no entry is listed by name and ref only. */
  contents: ReadonlyMap<string, CartAssetContent>;
  /** The valid `https:` site of the checkout, or null when there is none. */
  sourceUrl: string | null;
  instructions: string;
  texts: CartVideoPromptTexts;
  destinationTitles: Record<CartDestination, string>;
  kindLabels: Record<AssetKind, string>;
}

/** A fence longer than any backtick run in `text`, so a prompt that holds code blocks stays one block. */
function fenced(text: string): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(4, longestRun + 1));
  return `${fence}markdown\n${text}\n${fence}`;
}

function itemBlock(item: CartItem, input: CartVideoPromptInput): string {
  const parts = [`### ${input.kindLabels[item.kind]}: ${item.name} (\`${item.ref}\`)`];
  const content = input.contents.get(item.ref);
  if (content !== undefined) {
    const details = cartAssetDetailLines(content.version, input.texts.fields);
    if (details.length > 0) parts.push(details.join('\n'));
    if (content.text !== null && content.text !== '') parts.push(fenced(content.text));
  }
  return parts.join('\n\n');
}

/**
 * The checkout as one Markdown prompt for making the video elsewhere: every cart item under the
 * destination checkout gives it, with its settings and the full text of each prompt and skill,
 * then the site and the instructions.
 */
export function cartVideoPromptMarkdown(input: CartVideoPromptInput): string {
  const { cart, destinations, texts } = input;
  const blocks: string[] = [`# ${texts.heading}`, texts.intro];
  for (const destination of cartDestinationOrder) {
    const items = cart.filter((item) => destinations.get(item.ref) === destination);
    if (items.length === 0) continue;
    blocks.push(`## ${input.destinationTitles[destination]}`, ...items.map((item) => itemBlock(item, input)));
  }
  if (input.sourceUrl !== null) blocks.push(`## ${texts.siteHeading}\n\n${input.sourceUrl}`);
  const instructions = input.instructions.trim();
  if (instructions !== '') blocks.push(`## ${texts.instructionsHeading}\n\n${instructions}`);
  return `${blocks.join('\n\n')}\n`;
}
