export const CATEGORIES = ['defense', 'geopolitics', 'launches', 'industry', 'israel', 'policy', 'tech', 'ssa', 'exploration', 'weather'] as const;
export type Category = (typeof CATEGORIES)[number];
