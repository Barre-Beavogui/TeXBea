import { handle } from '../_lib/app.js';
export const onRequest = ({ request, env }) => handle(request, env);
