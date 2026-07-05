/**
 * Shared category color palette — muted, earthy tones ("Sage Ledger") rather
 * than saturated defaults, so auto-created and user-picked categories stay
 * visually coherent with the rest of the app (donut charts, coins, chips).
 */
export const CATEGORY_PALETTE = [
  '#6C8F6E', // sage
  '#7C9473', // moss
  '#BFA05A', // olive gold
  '#D1A54E', // honey
  '#C08268', // terracotta
  '#B56A5B', // clay
  '#C08A93', // rose
  '#A78BA0', // mauve
  '#8F7396', // plum
  '#6E85A0', // denim
  '#7D93A8', // dusty blue
  '#82A9BD', // sky
  '#5E9490', // teal
  '#8A6E55', // brown
  '#C9A876', // sand
  '#6F9B7B', // fern
  '#A6A28C', // stone
  '#767B70', // slate
] as const

export function paletteColor(index: number): string {
  return CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]
}
