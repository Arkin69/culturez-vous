import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const domains = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/domains' }),
  schema: z.object({
    title: z.string(),
    short: z.string(),
    emoji: z.string(),
    /** Teinte OKLCH (0-360) qui colore le domaine dans tout le site. */
    hue: z.number().min(0).max(360),
    order: z.number(),
    tagline: z.string(),
  }),
});

const creators = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/creators' }),
  schema: z.object({
    name: z.string(),
    author: z.string().optional(),
    handle: z.string().startsWith('@'),
    channelId: z.string().regex(/^UC[\w-]{22}$/, 'channelId YouTube invalide'),
    /** Le premier domaine est le domaine principal. */
    domains: z.array(z.string()).min(1),
    tagline: z.string(),
    level: z.enum(['debutant', 'intermediaire', 'avance']),
    format: z.string(),
    forWho: z.string(),
    strengths: z.array(z.string()).min(2).max(4),
    similar: z.array(z.string()).default([]),
    /** IDs de vidéos choisies à la main pour « Par où commencer » (sinon : les plus vues). */
    startWith: z.array(z.string()).default([]),
  }),
});

export const collections = { domains, creators };
