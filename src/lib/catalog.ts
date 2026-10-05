import type { Agent, Brand, Catalog, UnitModel } from '@/types';

const bySort = <T extends { sort: number; name: string }>(a: T, b: T) => a.sort - b.sort || a.name.localeCompare(b.name);

/** What a card offers: active brands and models, limited to the agent's brand when they have one. */
export function catalogFor(brandId: string | null, brands: Brand[], models: UnitModel[]): Catalog {
  const b = brands.filter(x => x.active && (!brandId || x.id === brandId)).sort(bySort);
  const ids = new Set(b.map(x => x.id));
  return { brands: b, models: models.filter(m => m.active && ids.has(m.brand_id)).sort(bySort) };
}

export const emptyCatalog = (): Catalog => ({ brands: [], models: [] });

/** The card's color: the brand's color when the agent's brand has one, otherwise the agent's own pick. */
export function cardColor(agent: Pick<Agent, 'brand_id' | 'theme'>, brands: Brand[]): string {
  return (agent.brand_id && brands.find(b => b.id === agent.brand_id)?.color) || agent.theme;
}

/** True when white text on this color would be hard to read (relative luminance above ~0.3). */
export function isTooLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(m[1]!.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.3;
}
