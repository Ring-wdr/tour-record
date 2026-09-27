import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { tripSchema, daySchema } from './schemas/trip';

// 여행 1개 = src/content/trips/<slug>/ 폴더 하나 (trip.yaml + days/dayXX.md)
const BASE = './src/content/trips';

/** id = 여행 slug ("almaty-2026") */
const trips = defineCollection({
  loader: glob({ pattern: '*/trip.yaml', base: BASE, generateId: ({ entry }) => entry.split('/')[0] }),
  schema: tripSchema,
});

/** id = "<slug>/dayXX" ("almaty-2026/day01") */
const days = defineCollection({
  loader: glob({
    pattern: '*/days/*.md',
    base: BASE,
    generateId: ({ entry }) => entry.replace('/days/', '/').replace(/\.md$/, ''),
  }),
  schema: daySchema,
});

export const collections = { trips, days };
