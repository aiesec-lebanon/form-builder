// Modal <dialog>s sit in the browser's top layer, so a select list or calendar
// rendered outside them shows up behind. The design system renders overlays
// inside the nearest [data-theme] element: giving each dialog the page's theme
// ("calm" when the page follows the OS) keeps overlays inside the dialog.
export function scopeDialogTheme(dialog: HTMLDialogElement): void {
  dialog.dataset.theme = document.documentElement.dataset.theme || "calm";
}
