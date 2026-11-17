// Index compact de toutes les vidéos, chargé à la demande par la page « Toutes les vidéos ».
import type { APIRoute } from 'astro';
import { getData } from '../lib/data';

export const GET: APIRoute = async () => {
  const { creators } = await getData();
  const videos = creators
    .flatMap((c, i) => c.videos.map((v) => [v.id, v.t, v.d, v.s, v.v, i] as const))
    .sort((a, b) => b[2].localeCompare(a[2]) || a[0].localeCompare(b[0]));
  const body = {
    creators: creators.map((c) => ({ id: c.id, name: c.data.name, domains: c.data.domains })),
    videos,
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
