import { handleApi } from "./api.js";
import { HttpError, json } from "./http.js";

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(req, env, url, ctx);
      } catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status);
        console.error(e);
        return json({ error: "Algo falló en el servidor. Inténtalo de nuevo." }, 500);
      }
    }
    return env.ASSETS.fetch(req);
  },
};
