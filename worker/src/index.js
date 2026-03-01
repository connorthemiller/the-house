// Cloudflare Worker -- proxies LLM requests with server-side Groq key
// Deploy: npx wrangler deploy
// Set key: npx wrangler secret put GROQ_KEY

var GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

var CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    if (!env.GROQ_KEY) {
      return new Response(JSON.stringify({ error: 'GROQ_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Forward request to Groq
    var body = await request.text();
    var resp = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.GROQ_KEY,
      },
      body: body,
    });

    var respBody = await resp.text();
    return new Response(respBody, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  },
};
