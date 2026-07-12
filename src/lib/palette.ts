/**
 * App color themes — each pairs a set of app-wide semantic tokens (defined in
 * index.css as `[data-app-theme="…"]` rules) with a category color palette
 * offered when picking or changing a category's color. Selectable in
 * More → Appearance (Settings.appTheme). Existing categories keep whatever
 * color they were assigned — switching themes only changes the *options*
 * offered going forward, plus the app's own surface/accent colors.
 */
export type AppTheme = 'sage' | 'botanical' | 'coral' | 'ocean'

export interface AppThemeMeta {
  id: AppTheme
  name: string
  blurb: string
}

export const APP_THEMES: AppThemeMeta[] = [
  { id: 'sage', name: 'Sage Ledger', blurb: 'Muted, earthy sage and clay — the original palette.' },
  {
    id: 'botanical',
    name: 'Botanical Bold',
    blurb: 'The same organic family, pushed to deeper, higher-contrast shades.',
  },
  {
    id: 'coral',
    name: 'Coral Contrast',
    blurb: 'Twelve hues spaced evenly around the wheel, for maximum separation between categories.',
  },
  {
    id: 'ocean',
    name: 'Ocean Punch',
    blurb: 'Cool blues and teals, with a punchy warm rose reserved for spending.',
  },
]

export const CATEGORY_PALETTES: Record<AppTheme, readonly string[]> = {
  sage: [
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
  ],
  botanical: [
    '#C2410C', // terracotta bold
    '#CA8A04', // gold
    '#3730A3', // indigo denim
    '#78350F', // deep brown
    '#BE185D', // rose bold
    '#B45309', // amber
    '#86198F', // plum bold
    '#0F766E', // teal bold
    '#1F7A4D', // forest
    '#0284C7', // sky blue
    '#1D4ED8', // denim blue
    '#4D7C0F', // olive lime
  ],
  coral: [
    '#DC2626', // red
    '#F97316', // orange
    '#EAB308', // yellow-gold
    '#65A30D', // lime
    '#16A34A', // green
    '#0D9488', // teal
    '#0891B2', // cyan
    '#2563EB', // sky-blue
    '#4F46E5', // indigo
    '#7C3AED', // violet
    '#C026D3', // fuchsia
    '#DB2777', // rose
  ],
  ocean: [
    '#F48434', // orange
    '#F0AC19', // gold
    '#129AE2', // ocean blue
    '#A05022', // brown
    '#A155E7', // purple
    '#E44444', // red
    '#905CEB', // violet
    '#6861E5', // indigo
    '#11D497', // emerald
    '#17BEE8', // cyan
    '#1EB8AB', // teal
    '#8AD61F', // lime
  ],
}

/** The category color palette a theme offers (falls back to Sage Ledger's
 * for an unrecognized/legacy value, e.g. a backup from before this feature). */
export function categoryPalette(theme: AppTheme): readonly string[] {
  return CATEGORY_PALETTES[theme] ?? CATEGORY_PALETTES.sage
}

export function paletteColor(theme: AppTheme, index: number): string {
  const p = categoryPalette(theme)
  return p[index % p.length]
}
