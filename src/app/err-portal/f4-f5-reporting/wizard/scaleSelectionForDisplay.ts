/** Scale a selection drawn at refW×refH to the image's current on-screen size (zoom / fit-width). */
export function scaleSelectionForDisplay (
  sel: { x: number; y: number; w: number; h: number; refW?: number; refH?: number },
  currentW: number,
  currentH: number
): { x: number; y: number; w: number; h: number } {
  const refW = sel.refW != null && sel.refW > 0 ? sel.refW : currentW
  const refH = sel.refH != null && sel.refH > 0 ? sel.refH : currentH
  if (currentW <= 0 || currentH <= 0 || refW <= 0 || refH <= 0) {
    return { x: sel.x, y: sel.y, w: sel.w, h: sel.h }
  }
  const scaleX = currentW / refW
  const scaleY = currentH / refH
  return {
    x: sel.x * scaleX,
    y: sel.y * scaleY,
    w: sel.w * scaleX,
    h: sel.h * scaleY,
  }
}
