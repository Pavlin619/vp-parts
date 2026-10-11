/**
 * Moves focus to the first field a refused submit marked, so a keyboard or
 * screen-reader user lands on what needs fixing. A group such as the place
 * picker marks its wrapper with `data-invalid` instead of the input itself.
 */
export function focusFirstInvalidField(container: HTMLElement | null): void {
  container
    ?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"] input')
    ?.focus();
}
