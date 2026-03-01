// Activity log -- color-coded event panel

function esc(text) {
  var d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

var MAX_ENTRIES = 100;

var COLORS = {
  action:      '#b8a',
  mood:        '#6cc',
  memory:      '#c8a',
  care:        '#6cc',
  environment: '#68c',
  creature:    '#cc8',
  social:      '#8c6'
};

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function timeStr() {
  var d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

class ActivityLog {
  constructor(bus) {
    this.bus = bus;
    this.entries = [];
    this.visible = false;

    // DOM
    this.toggleBtn = document.getElementById('log-toggle');
    this.panel = document.getElementById('log-panel');
    this.closeBtn = document.getElementById('log-close');
    this.list = document.getElementById('log-list');

    // Bind handlers
    this._onAction = this._onAction.bind(this);
    this._onMood = this._onMood.bind(this);
    this._onMemory = this._onMemory.bind(this);
    this._onCare = this._onCare.bind(this);
    this._onEnvironment = this._onEnvironment.bind(this);
    this._onRoomChanged = this._onRoomChanged.bind(this);
    this._onPickedUp = this._onPickedUp.bind(this);
    this._onDropped = this._onDropped.bind(this);
    this._onFriendInteraction = this._onFriendInteraction.bind(this);
  }

  start() {
    // Toggle panel
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this._toggle());
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this._toggle());
    }

    // Subscribe to events
    this.bus.on('creature:action-started', this._onAction);
    this.bus.on('creature:mood-changed', this._onMood);
    this.bus.on('creature:memory-updated', this._onMemory);
    this.bus.on('creature:cared', this._onCare);
    this.bus.on('daynight:changed', this._onEnvironment);
    this.bus.on('creature:room-changed', this._onRoomChanged);
    this.bus.on('creature:picked-up', this._onPickedUp);
    this.bus.on('creature:dropped', this._onDropped);
    this.bus.on('creature:friend-interaction', this._onFriendInteraction);
  }

  _toggle() {
    this.visible = !this.visible;
    if (this.panel) {
      this.panel.style.display = this.visible ? 'flex' : 'none';
    }
  }

  _addEntry(type, text) {
    var entry = { timestamp: timeStr(), type: type, text: text, color: COLORS[type] || '#888' };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
      // Remove first DOM child
      if (this.list && this.list.firstChild) {
        this.list.removeChild(this.list.firstChild);
      }
    }
    this._renderEntry(entry);
  }

  _renderEntry(entry) {
    if (!this.list) return;
    var el = document.createElement('div');
    el.className = 'log-entry';
    el.innerHTML = '<span class="log-time">' + esc(entry.timestamp) + '</span>' +
      '<span class="log-dot" style="background:' + entry.color + '"></span>' +
      '<span class="log-text">' + esc(entry.text) + '</span>';
    this.list.appendChild(el);
    // Auto-scroll to bottom
    this.list.scrollTop = this.list.scrollHeight;
  }

  // Event handlers
  _onAction(data) {
    var action = data.action.replace(/_/g, ' ');
    var target = data.target && data.target.name ? ' -> ' + data.target.name : '';
    this._addEntry('action', action + target);
  }

  _onMood(data) {
    this._addEntry('mood', data.prev + ' -> ' + data.next);
  }

  _onMemory(data) {
    var name = data.entry.emoji + ' ' + data.entry.name;
    this._addEntry('memory', name + ' (x' + data.entry.interactions + ')');
  }

  _onCare(data) {
    this._addEntry('care', 'cared: ' + data.action + ' (-' + Math.round(data.amount * 100) + '% ' + data.driveAffected + ')');
  }

  _onEnvironment(data) {
    this._addEntry('environment', data.phase + ' ' + data.windowEmoji);
  }

  _onRoomChanged(data) {
    this._addEntry('creature', 'moved to ' + data.room);
  }

  _onPickedUp() {
    this._addEntry('creature', 'picked up');
  }

  _onDropped(data) {
    this._addEntry('creature', 'dropped in ' + data.room);
  }

  _onFriendInteraction(data) {
    var action = data.action.replace(/_/g, ' ');
    this._addEntry('social', action + ' with ' + data.entry.name);
  }
}

export default ActivityLog;
