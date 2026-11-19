import { createDatingService } from './service.mjs';

export default {
  fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/dating-api/')) return env.ASSETS.fetch(request);
    const dating = createDatingService(env.DB, { signups: env.TELEPHONE_SIGNUPS !== 'closed' });
    return dating(request, { clientAddress: request.headers.get('CF-Connecting-IP') || '' });
  },
};
