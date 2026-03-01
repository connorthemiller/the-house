// LLM provider abstraction -- BYO API key, client-side fetch only

var STORAGE_KEY = 'the_house_llm_v1';

// Built-in free tier -- proxied through Cloudflare Worker (key lives server-side)
var BUILTIN_ENDPOINT = 'https://the-house-llm.lobsters.workers.dev/';
var BUILTIN_PROVIDER = 'groq'; // response format
var BUILTIN_MODEL = 'llama-3.1-8b-instant';
var BUILTIN_MIN_INTERVAL = 15; // minutes -- gentle on shared free key

export var PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    defaultModel: 'claude-haiku-4-5-20251001',
    endpoint: 'https://api.anthropic.com/v1/messages',
    buildHeaders: function(apiKey) {
      return {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      };
    },
    buildBody: function(model, systemPrompt, userMessage) {
      return {
        model: model,
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      };
    },
    extractResponse: function(json) {
      var text = json.content && json.content[0] ? json.content[0].text : null;
      var usage = json.usage ? {
        input: json.usage.input_tokens || 0,
        output: json.usage.output_tokens || 0
      } : null;
      return { text: text, usage: usage };
    },
    costPerMillion: { input: 0.80, output: 4.00 }
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    buildHeaders: function(apiKey) {
      return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      };
    },
    buildBody: function(model, systemPrompt, userMessage) {
      return {
        model: model,
        max_tokens: 512,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      };
    },
    extractResponse: function(json) {
      var text = json.choices && json.choices[0] && json.choices[0].message
        ? json.choices[0].message.content : null;
      var usage = json.usage ? {
        input: json.usage.prompt_tokens || 0,
        output: json.usage.completion_tokens || 0
      } : null;
      return { text: text, usage: usage };
    },
    costPerMillion: { input: 0.15, output: 0.60 }
  },
  groq: {
    name: 'Groq',
    defaultModel: 'llama-3.1-8b-instant',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    buildHeaders: function(apiKey) {
      return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      };
    },
    buildBody: function(model, systemPrompt, userMessage) {
      return {
        model: model,
        max_tokens: 512,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      };
    },
    extractResponse: function(json) {
      var text = json.choices && json.choices[0] && json.choices[0].message
        ? json.choices[0].message.content : null;
      var usage = json.usage ? {
        input: json.usage.prompt_tokens || 0,
        output: json.usage.completion_tokens || 0
      } : null;
      return { text: text, usage: usage };
    },
    costPerMillion: { input: 0, output: 0 }
  }
};

function loadSettings() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function getSettings() {
  var saved = loadSettings();
  // Migration: old saves with apiKey default to 'custom', otherwise 'builtin'
  var mode;
  if (saved && saved.mode) {
    mode = saved.mode;
  } else if (saved && saved.apiKey) {
    mode = 'custom';
  } else {
    mode = 'builtin';
  }
  var interval = (saved && saved.reflectionIntervalMin) || 10;
  // Enforce minimum interval in builtin mode
  if (mode === 'builtin' && interval < BUILTIN_MIN_INTERVAL) {
    interval = BUILTIN_MIN_INTERVAL;
  }
  return {
    mode: mode,
    provider: (saved && saved.provider) || 'anthropic',
    apiKey: (saved && saved.apiKey) || '',
    model: (saved && saved.model) || '',
    reflectionIntervalMin: interval,
    totalInputTokens: (saved && saved.totalInputTokens) || 0,
    totalOutputTokens: (saved && saved.totalOutputTokens) || 0,
    reflectionCount: (saved && saved.reflectionCount) || 0
  };
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('LLM settings save error:', e);
  }
}

export function isConfigured() {
  var s = getSettings();
  if (s.mode === 'builtin') return true;
  return !!(s.apiKey && s.provider && PROVIDERS[s.provider]);
}

export function estimateCost() {
  var s = getSettings();
  var provider;
  if (s.mode === 'builtin') {
    provider = PROVIDERS[BUILTIN_PROVIDER];
  } else {
    provider = PROVIDERS[s.provider];
  }
  if (!provider) return { cost: 0, reflections: 0 };
  var inputCost = (s.totalInputTokens / 1000000) * provider.costPerMillion.input;
  var outputCost = (s.totalOutputTokens / 1000000) * provider.costPerMillion.output;
  return {
    cost: inputCost + outputCost,
    reflections: s.reflectionCount,
    inputTokens: s.totalInputTokens,
    outputTokens: s.totalOutputTokens
  };
}

export async function callLLM(systemPrompt, userMessage) {
  var settings = getSettings();
  var provider, endpoint, headers, body;

  if (settings.mode === 'builtin') {
    provider = PROVIDERS[BUILTIN_PROVIDER];
    endpoint = BUILTIN_ENDPOINT;
    headers = { 'Content-Type': 'application/json' };
    body = provider.buildBody(BUILTIN_MODEL, systemPrompt, userMessage);
  } else {
    provider = PROVIDERS[settings.provider];
    if (!provider || !settings.apiKey) {
      return { text: null, usage: null, error: 'not configured' };
    }
    var model = settings.model || provider.defaultModel;
    endpoint = provider.endpoint;
    headers = provider.buildHeaders(settings.apiKey);
    body = provider.buildBody(model, systemPrompt, userMessage);
  }

  if (!provider) {
    return { text: null, usage: null, error: 'not configured' };
  }
  var controller = new AbortController();
  var timeout = setTimeout(function() { controller.abort(); }, 30000);

  try {
    var resp = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      var errText = '';
      try { errText = await resp.text(); } catch (e) { /* ignore */ }
      return { text: null, usage: null, error: 'HTTP ' + resp.status + ': ' + errText.slice(0, 200) };
    }

    var json = await resp.json();
    var result = provider.extractResponse(json);

    // Track usage
    if (result.usage) {
      settings.totalInputTokens += result.usage.input;
      settings.totalOutputTokens += result.usage.output;
      settings.reflectionCount += 1;
      saveSettings(settings);
    }

    return { text: result.text, usage: result.usage, error: null };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { text: null, usage: null, error: 'timeout (30s)' };
    }
    return { text: null, usage: null, error: err.message || 'network error' };
  }
}
