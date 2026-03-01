// Settings panel -- LLM configuration UI

import { PROVIDERS, getSettings, saveSettings, isConfigured, callLLM, estimateCost } from './llm.js';

class Settings {
  constructor() {
    this.modal = document.getElementById('settings-modal');
    this.toggleBtn = document.getElementById('settings-btn');
  }

  start() {
    if (!this.toggleBtn || !this.modal) return;

    var self = this;
    this.toggleBtn.addEventListener('click', function() {
      self._open();
    });
  }

  _open() {
    this._render();
    this.modal.style.display = 'flex';
  }

  _close() {
    this.modal.style.display = 'none';
  }

  _render() {
    var settings = getSettings();
    var cost = estimateCost();
    var modal = this.modal;
    var self = this;

    var box = modal.querySelector('.settings-box');
    if (!box) return;

    var isBuiltin = settings.mode === 'builtin';
    var defaultModel = PROVIDERS[settings.provider] ? PROVIDERS[settings.provider].defaultModel : '';
    var sliderMin = isBuiltin ? 15 : 5;
    var sliderVal = Math.max(settings.reflectionIntervalMin, sliderMin);

    // -- Build HTML --
    var html =
      '<div class="modal-label">settings</div>' +
      // Mode toggle
      '<div class="settings-section">' +
        '<div class="settings-toggle-row settings-mode-row">' +
          '<button class="settings-toggle settings-mode-toggle' + (isBuiltin ? ' active' : '') + '" data-mode="builtin">built-in (free)</button>' +
          '<button class="settings-toggle settings-mode-toggle' + (!isBuiltin ? ' active' : '') + '" data-mode="custom">use your own key</button>' +
        '</div>' +
      '</div>';

    // Builtin explanation
    html +=
      '<div class="settings-section settings-builtin-info"' + (!isBuiltin ? ' style="display:none"' : '') + '>' +
        '<div class="settings-explain">' +
          'Your creature reflects using a free built-in model. No setup needed.' +
        '</div>' +
      '</div>';

    // Custom section (provider, key, model, test)
    html +=
      '<div class="settings-custom-section"' + (isBuiltin ? ' style="display:none"' : '') + '>' +
        '<div class="settings-section">' +
          '<div class="settings-label">provider</div>' +
          '<div class="settings-toggle-row">' +
            '<button class="settings-toggle settings-provider-toggle' + (settings.provider === 'anthropic' ? ' active' : '') + '" data-provider="anthropic">Anthropic</button>' +
            '<button class="settings-toggle settings-provider-toggle' + (settings.provider === 'openai' ? ' active' : '') + '" data-provider="openai">OpenAI</button>' +
            '<button class="settings-toggle settings-provider-toggle' + (settings.provider === 'groq' ? ' active' : '') + '" data-provider="groq">Groq</button>' +
          '</div>' +
        '</div>' +
        '<div class="settings-section">' +
          '<div class="settings-label">API key</div>' +
          '<div class="settings-key-row">' +
            '<input type="password" class="modal-input settings-key" value="' + this._escAttr(settings.apiKey) + '" placeholder="paste your key">' +
            '<button class="settings-eye" data-visible="false">show</button>' +
          '</div>' +
        '</div>' +
        '<div class="settings-section">' +
          '<div class="settings-label">model <span class="settings-hint">(blank = default: ' + this._esc(defaultModel) + ')</span></div>' +
          '<input type="text" class="modal-input settings-model" value="' + this._escAttr(settings.model) + '" placeholder="' + this._escAttr(defaultModel) + '">' +
        '</div>' +
        '<div class="settings-section">' +
          '<button class="modal-btn settings-test-btn">test connection</button>' +
          '<span class="settings-test-result"></span>' +
        '</div>' +
      '</div>';

    // Interval slider (always shown)
    html +=
      '<div class="settings-section">' +
        '<div class="settings-label">reflection interval</div>' +
        '<div class="settings-slider-row">' +
          '<input type="range" class="settings-slider" min="' + sliderMin + '" max="30" step="1" value="' + sliderVal + '">' +
          '<span class="settings-slider-val">' + sliderVal + ' min</span>' +
        '</div>' +
      '</div>';

    // Usage (always shown)
    html +=
      '<div class="settings-section settings-usage">' +
        '<div class="settings-label">usage</div>' +
        '<div class="settings-usage-text">' +
          cost.reflections + ' reflections -- ~' +
          (cost.inputTokens + cost.outputTokens) + ' tokens (~$' + cost.cost.toFixed(4) + ')' +
        '</div>' +
      '</div>';

    // Explanation
    html +=
      '<div class="settings-section settings-explain">' +
        'The reflective layer gives your creature an inner voice. ' +
        'It periodically reflects on recent experiences, forming associations ' +
        'and interests. Your creature works fine without it.' +
      '</div>';

    // Actions
    html +=
      '<div class="settings-actions">' +
        '<button class="modal-btn settings-save-btn">save</button>' +
        '<button class="modal-btn settings-close-btn">close</button>' +
      '</div>';

    box.innerHTML = html;

    // -- Wire up events --

    // Mode toggles
    var modeBtns = box.querySelectorAll('.settings-mode-toggle');
    var builtinInfo = box.querySelector('.settings-builtin-info');
    var customSection = box.querySelector('.settings-custom-section');
    var slider = box.querySelector('.settings-slider');
    var sliderValEl = box.querySelector('.settings-slider-val');

    for (var i = 0; i < modeBtns.length; i++) {
      modeBtns[i].addEventListener('click', function() {
        for (var j = 0; j < modeBtns.length; j++) {
          modeBtns[j].classList.remove('active');
        }
        this.classList.add('active');
        var builtin = this.dataset.mode === 'builtin';
        builtinInfo.style.display = builtin ? '' : 'none';
        customSection.style.display = builtin ? 'none' : '';
        // Adjust slider min
        var newMin = builtin ? 15 : 5;
        slider.min = newMin;
        if (parseInt(slider.value) < newMin) {
          slider.value = newMin;
          sliderValEl.textContent = newMin + ' min';
        }
      });
    }

    // Provider toggles
    var providerBtns = box.querySelectorAll('.settings-provider-toggle');
    for (var i = 0; i < providerBtns.length; i++) {
      providerBtns[i].addEventListener('click', function() {
        for (var j = 0; j < providerBtns.length; j++) {
          providerBtns[j].classList.remove('active');
        }
        this.classList.add('active');
        var p = PROVIDERS[this.dataset.provider];
        var modelInput = box.querySelector('.settings-model');
        if (p && modelInput) {
          modelInput.placeholder = p.defaultModel;
          var hint = box.querySelector('.settings-hint');
          if (hint) hint.textContent = '(blank = default: ' + p.defaultModel + ')';
        }
      });
    }

    // Eye toggle
    var eyeBtn = box.querySelector('.settings-eye');
    var keyInput = box.querySelector('.settings-key');
    if (eyeBtn && keyInput) {
      eyeBtn.addEventListener('click', function() {
        var vis = this.dataset.visible === 'true';
        keyInput.type = vis ? 'password' : 'text';
        this.dataset.visible = vis ? 'false' : 'true';
        this.textContent = vis ? 'show' : 'hide';
      });
    }

    // Slider
    if (slider && sliderValEl) {
      slider.addEventListener('input', function() {
        sliderValEl.textContent = this.value + ' min';
      });
    }

    // Test button
    var testBtn = box.querySelector('.settings-test-btn');
    var testResult = box.querySelector('.settings-test-result');
    if (testBtn) {
      testBtn.addEventListener('click', async function() {
        testResult.textContent = 'testing...';
        testResult.style.color = '#888';

        // Temporarily save to test with custom settings
        var tempSettings = getSettings();
        tempSettings.mode = 'custom';
        var activeProvider = box.querySelector('.settings-provider-toggle.active');
        tempSettings.provider = activeProvider ? activeProvider.dataset.provider : tempSettings.provider;
        tempSettings.apiKey = keyInput ? keyInput.value.trim() : '';
        var modelInput = box.querySelector('.settings-model');
        tempSettings.model = modelInput ? modelInput.value.trim() : '';
        saveSettings(tempSettings);

        var result = await callLLM('Reply with just the word "ok".', 'Test');

        if (result.error) {
          testResult.textContent = 'failed: ' + result.error.slice(0, 50);
          testResult.style.color = '#c66';
        } else {
          testResult.textContent = 'connected!';
          testResult.style.color = '#6a8';
        }
      });
    }

    // Save
    var saveBtn = box.querySelector('.settings-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var s = getSettings();
        var activeMode = box.querySelector('.settings-mode-toggle.active');
        s.mode = activeMode ? activeMode.dataset.mode : 'builtin';

        if (s.mode === 'custom') {
          var activeProvider = box.querySelector('.settings-provider-toggle.active');
          s.provider = activeProvider ? activeProvider.dataset.provider : s.provider;
          s.apiKey = keyInput ? keyInput.value.trim() : '';
          var modelInput = box.querySelector('.settings-model');
          s.model = modelInput ? modelInput.value.trim() : '';
        }

        var sl = box.querySelector('.settings-slider');
        s.reflectionIntervalMin = sl ? parseInt(sl.value) : 10;
        saveSettings(s);
        self._close();
      });
    }

    // Close
    var closeBtn = box.querySelector('.settings-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        self._close();
      });
    }

    // Overlay click to close
    modal.onclick = function(e) {
      if (e.target === modal) self._close();
    };
  }

  _esc(text) {
    var d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  _escAttr(text) {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

export default Settings;
