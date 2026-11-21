import worker from '../src/worker.js';
export const onRequest = (ctx) => worker.fetch(ctx.request, ctx.env);
