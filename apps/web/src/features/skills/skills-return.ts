/**
 * The Skills address (with its category tab) the modals opened from it go back to. Module state on
 * purpose, like `catalog-return.ts`: it lives exactly as long as the soft-navigation span of a modal.
 */
let skillsReturnHref = '/skills';

export function rememberSkillsHref(href: string): void {
  skillsReturnHref = href;
}

export function skillsReturnTarget(): string {
  return skillsReturnHref;
}
