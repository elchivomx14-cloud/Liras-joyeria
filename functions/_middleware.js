import worker from '../src/worker.js';
export const onRequest = (ctx) => worker.fetch(ctx.request, ctx.env);
{ "version": 1, "include": ["/api/*", "/uploads/*"], "exclude": [] }
name = "liras-joyeria"
compatibility_date = "2025-01-01"
pages_build_output_dir = "./public"

[[d1_databases]]
binding = "DB"
database_name = "liras-db"
database_id = "00fff739-1600-48af-bd22-9ecd29ff2027"
