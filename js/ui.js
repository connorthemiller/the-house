// UI -- Info panel, emoji picker, HUD

import { CELL } from './renderer.js';

const PICKER_ITEMS = [
  { category: 'food', emoji: '\ud83c\udf4e', name: 'Apple', type: 'food', affordances: ['eat'], consumable: true, comfortValue: 0.3 },
  { category: 'food', emoji: '\ud83d\udc1f', name: 'Fish', type: 'food', affordances: ['eat'], consumable: true, comfortValue: 0.4 },
  { category: 'food', emoji: '\ud83e\udd5b', name: 'Milk', type: 'food', affordances: ['drink'], consumable: true, comfortValue: 0.3 },
  { category: 'toy', emoji: '\ud83e\uddf6', name: 'Yarn', type: 'toy', affordances: ['play', 'carry'], consumable: false, comfortValue: 0.2 },
  { category: 'toy', emoji: '\ud83e\ude80', name: 'Top', type: 'toy', affordances: ['play', 'bat'], consumable: false, comfortValue: 0.2 },
  { category: 'toy', emoji: '\ud83d\udd14', name: 'Bell', type: 'toy', affordances: ['play', 'noise'], consumable: false, comfortValue: 0.1 },
  { category: 'comfort', emoji: '\ud83e\uddf8', name: 'Teddy', type: 'comfort', affordances: ['cuddle', 'carry'], consumable: false, comfortValue: 0.6 },
  { category: 'comfort', emoji: '\ud83e\udeb4', name: 'Plant', type: 'comfort', affordances: ['smell', 'explore'], consumable: false, comfortValue: 0.4 },
  { category: 'comfort', emoji: '\ud83d\udd6f\ufe0f', name: 'Candle', type: 'comfort', affordances: ['light', 'warm'], consumable: false, comfortValue: 0.5 }
];

class UI {
  constructor(bus, world, renderer) {
    this.bus = bus;
    this.world = world;
    this.renderer = renderer;
    this.creature = null;
    this.overlay = document.getElementById('ui-overlay');
    this.hud = document.getElementById('hud');
    this.navContainer = document.getElementById('room-nav');
    this.navLabel = document.getElementById('nav-label');
    this.navPrev = document.getElementById('nav-prev');
    this.navNext = document.getElementById('nav-next');
    this.activePanel = null;
    this._nextId = Date.now();

    this._onObjectTapped = this._onObjectTapped.bind(this);
    this._onEmptyTapped = this._onEmptyTapped.bind(this);
    this._onCreatureTapped = this._onCreatureTapped.bind(this);
    this._onDayNight = this._onDayNight.bind(this);
    this._onDocClick = this._onDocClick.bind(this);
    this._careCooldowns = {};
  }

  setCreature(creature) {
    this.creature = creature;
  }

  start() {
    this.bus.on('input:object-tapped', this._onObjectTapped);
    this.bus.on('input:empty-tapped', this._onEmptyTapped);
    this.bus.on('input:creature-tapped', this._onCreatureTapped);
    this.bus.on('daynight:changed', this._onDayNight);
    document.addEventListener('mousedown', this._onDocClick, true);

    if (this.navPrev) {
      this.navPrev.addEventListener('click', () => this._onNavPrev());
    }
    if (this.navNext) {
      this.navNext.addEventListener('click', () => this._onNavNext());
    }

    this._setupCareBar();
    this._updateNav();
  }

  stop() {
    this.bus.off('input:object-tapped', this._onObjectTapped);
    this.bus.off('input:empty-tapped', this._onEmptyTapped);
    this.bus.off('input:creature-tapped', this._onCreatureTapped);
    this.bus.off('daynight:changed', this._onDayNight);
    document.removeEventListener('mousedown', this._onDocClick, true);
  }

  _updateNav() {
    if (!this.navContainer) return;

    const isSingle = this.renderer.mode === 'single';
    this.navContainer.style.display = isSingle ? 'flex' : 'none';

    if (!isSingle) return;

    const rooms = this.world.getRoomOrder();
    const currentId = this.renderer.getCurrentRoom();
    const idx = rooms.indexOf(currentId);
    const room = this.world.getRoom(currentId);

    if (this.navLabel) {
      this.navLabel.textContent = room ? room.name : '';
    }
    if (this.navPrev) {
      this.navPrev.disabled = idx <= 0;
    }
    if (this.navNext) {
      this.navNext.disabled = idx >= rooms.length - 1;
    }
  }

  _onNavPrev() {
    const rooms = this.world.getRoomOrder();
    const idx = rooms.indexOf(this.renderer.getCurrentRoom());
    if (idx <= 0) return;
    this.bus.emit('nav:room-changed', {
      roomId: rooms[idx - 1],
      roomIndex: idx - 1,
      totalRooms: rooms.length
    });
  }

  _onNavNext() {
    const rooms = this.world.getRoomOrder();
    const idx = rooms.indexOf(this.renderer.getCurrentRoom());
    if (idx >= rooms.length - 1) return;
    this.bus.emit('nav:room-changed', {
      roomId: rooms[idx + 1],
      roomIndex: idx + 1,
      totalRooms: rooms.length
    });
  }

  _dismissPanel() {
    if (this.activePanel) {
      this.activePanel.remove();
      this.activePanel = null;
    }
  }

  _onDocClick(e) {
    if (this.activePanel && !this.activePanel.contains(e.target)) {
      // Let the canvas click through so input.js handles it
      // But dismiss the panel
      this._dismissPanel();
    }
  }

  _cellToScreen(roomId, col, row) {
    const rp = this.renderer.getRoomPixelPos(roomId);
    if (!rp) return { x: 0, y: 0 };
    const canvasRect = this.renderer.canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.renderer.canvas.width;
    const scaleY = canvasRect.height / this.renderer.canvas.height;
    return {
      x: canvasRect.left + (rp.x + col * CELL + CELL / 2) * scaleX,
      y: canvasRect.top + (rp.y + row * CELL + CELL) * scaleY
    };
  }

  _onObjectTapped(data) {
    this._dismissPanel();
    const { object, roomId, col, row } = data;
    const pos = this._cellToScreen(roomId, col, row);

    const panel = document.createElement('div');
    panel.className = 'info-panel';
    panel.innerHTML = `
      <div class="info-emoji">${object.isDayNightWindow ? '(window)' : object.emoji}</div>
      <div class="info-name">${object.name}</div>
      <div class="info-type">${object.type}</div>
      <div class="info-row"><span>affordances:</span> ${object.affordances.join(', ')}</div>
      <div class="info-row"><span>comfort:</span> ${object.comfortValue}</div>
      ${object.userPlaced ? '<div class="info-row info-action" data-action="remove">[ remove ]</div>' : ''}
    `;
    panel.style.left = pos.x + 'px';
    panel.style.top = pos.y + 'px';

    // Remove button for user-placed objects
    const removeBtn = panel.querySelector('[data-action="remove"]');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.world.removeObject(object.id);
        this._dismissPanel();
      });
    }

    this.overlay.appendChild(panel);
    this.activePanel = panel;

    // Keep panel in viewport
    requestAnimationFrame(() => {
      const r = panel.getBoundingClientRect();
      if (r.right > window.innerWidth) {
        panel.style.left = (pos.x - r.width) + 'px';
      }
      if (r.bottom > window.innerHeight) {
        panel.style.top = (pos.y - r.height - CELL) + 'px';
      }
    });
  }

  _onCreatureTapped(data) {
    this._dismissPanel();
    var c = data.creature;
    if (!c) return;

    var hungerPct = Math.round(c.drives.hunger * 100);
    var curiosityPct = Math.round(c.drives.curiosity * 100);
    var comfortPct = Math.round(c.drives.comfort * 100);
    var energyPct = Math.round(c.drives.energy * 100);
    var actionText = c.currentAction ? c.currentAction.action.replace(/_/g, ' ') : 'idle';
    var moodText = c.mood || 'okay';

    var overlay = document.createElement('div');
    overlay.className = 'creature-modal-overlay';

    overlay.innerHTML =
      '<div class="creature-modal">' +
        '<div class="creature-modal-header">' +
          '<span class="creature-modal-emoji">' + c.emoji + '</span>' +
          '<div>' +
            '<div class="creature-modal-name">' + c.name +
              '<span class="creature-modal-rename" data-action="rename">rename</span>' +
            '</div>' +
            '<div class="creature-modal-species">' + c.species + '</div>' +
          '</div>' +
        '</div>' +
        '<hr class="creature-modal-divider">' +
        '<div class="creature-modal-row">' +
          '<span class="creature-modal-row-label">mood</span>' +
          '<span class="creature-modal-row-value" data-field="mood">' + moodText + '</span>' +
        '</div>' +
        '<div class="creature-modal-row">' +
          '<span class="creature-modal-row-label">action</span>' +
          '<span class="creature-modal-row-value" data-field="action">' + actionText + '</span>' +
        '</div>' +
        this._personalitySection(c) +
        '<hr class="creature-modal-divider">' +
        '<div data-field="drives">' +
          this._driveBar('hunger', hungerPct, '#c66') +
          this._driveBar('curiosity', curiosityPct, '#6ac') +
          this._driveBar('comfort', comfortPct, '#a6c') +
          this._driveBar('energy', energyPct, '#ca6') +
        '</div>' +
        this._favoritesSection(c) +
        '<div class="creature-modal-hint">drag to move</div>' +
      '</div>';

    var self = this;

    // Click overlay background to dismiss
    overlay.addEventListener('mousedown', function(e) {
      if (e.target === overlay) {
        self._dismissPanel();
      }
    });

    // Stop clicks inside modal from dismissing
    var box = overlay.querySelector('.creature-modal');
    box.addEventListener('mousedown', function(e) { e.stopPropagation(); });

    // Rename
    var renameBtn = overlay.querySelector('[data-action="rename"]');
    renameBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      self._dismissPanel();
      var modal = document.getElementById('naming-modal');
      var input = document.getElementById('naming-input');
      var btn = document.getElementById('naming-confirm');
      var emojiEl = document.getElementById('modal-emoji');

      emojiEl.textContent = c.emoji;
      input.value = c.name;
      modal.style.display = 'flex';
      input.focus();
      input.select();

      function confirm() {
        var name = input.value.trim();
        if (!name) return;
        c.name = name;
        modal.style.display = 'none';
        btn.removeEventListener('click', confirm);
        input.removeEventListener('keydown', onKey);
        self.bus.emit('creature:renamed', { name: name });
      }
      function onKey(ev) {
        if (ev.key === 'Enter') confirm();
      }
      btn.addEventListener('click', confirm);
      input.addEventListener('keydown', onKey);
    });

    document.body.appendChild(overlay);
    this.activePanel = overlay;
  }

  _personalitySection(creature) {
    if (!creature._getPersonalityTraits) return '';
    var traits = creature._getPersonalityTraits();
    var text = traits.length > 0 ? traits.join(', ') : 'developing...';
    return '<div class="creature-modal-row creature-modal-personality">' +
      '<span class="creature-modal-row-label">personality</span>' +
      '<span class="creature-modal-row-value">' + text + '</span>' +
    '</div>';
  }

  _favoritesSection(creature) {
    if (!creature.memory) return '';
    var favs = [];
    var ids = Object.keys(creature.memory);
    for (var i = 0; i < ids.length; i++) {
      var entry = creature.memory[ids[i]];
      if (entry.valence > 0.2 && entry.interactions > 2) {
        favs.push(entry);
      }
    }
    if (favs.length === 0) return '';
    // Sort by valence descending, take top 3
    favs.sort(function(a, b) { return b.valence - a.valence; });
    favs = favs.slice(0, 3);
    var html = '<hr class="creature-modal-divider">' +
      '<div class="creature-modal-fav-label">favorites</div>' +
      '<div class="creature-modal-fav">';
    for (var i = 0; i < favs.length; i++) {
      html += '<span class="creature-modal-fav-item">' +
        favs[i].emoji + ' ' + favs[i].name + '</span>';
    }
    html += '</div>';
    return html;
  }

  _driveBar(label, pct, color) {
    return '<div class="drive-row">' +
      '<span class="drive-label">' + label + '</span>' +
      '<div class="drive-track"><div class="drive-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<span class="drive-pct" style="color:#555;width:30px;text-align:right;flex-shrink:0">' + pct + '%</span>' +
    '</div>';
  }

  _setupCareBar() {
    var self = this;
    var btns = document.querySelectorAll('.care-main-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function() {
        var action = this.dataset.care;
        if (!self.creature) return;
        var now = Date.now();
        if (self._careCooldowns[action] && now - self._careCooldowns[action] < 1000) return;
        self._careCooldowns[action] = now;
        self.creature.receiveCare(action);
      });
    }
  }

  updateDrives() {
    if (!this.creature) return;
    var drives = this.creature.drives;
    var keys = ['hunger', 'curiosity', 'comfort', 'energy'];
    for (var i = 0; i < keys.length; i++) {
      var el = document.querySelector('.dhud-fill[data-drive="' + keys[i] + '"]');
      if (el) {
        el.style.width = Math.round(drives[keys[i]] * 100) + '%';
      }
    }
  }

  _onEmptyTapped(data) {
    this._dismissPanel();
    const { roomId, col, row } = data;

    // Don't open picker on creature's cell
    if (this.creature && this.creature.room === roomId &&
        this.creature.col === col && this.creature.row === row) {
      return;
    }
    const pos = this._cellToScreen(roomId, col, row);

    const panel = document.createElement('div');
    panel.className = 'emoji-picker';

    let html = '<div class="picker-title">drop an item</div><div class="picker-grid">';
    for (const item of PICKER_ITEMS) {
      html += `<div class="picker-cell" data-idx="${PICKER_ITEMS.indexOf(item)}" title="${item.name}">${item.emoji}</div>`;
    }
    html += '</div>';
    panel.innerHTML = html;
    panel.style.left = pos.x + 'px';
    panel.style.top = pos.y + 'px';

    panel.addEventListener('click', (e) => {
      const cell = e.target.closest('.picker-cell');
      if (!cell) return;
      e.stopPropagation();

      const idx = parseInt(cell.dataset.idx);
      const template = PICKER_ITEMS[idx];
      const id = `user_${this._nextId++}`;

      this.world.addObject({
        id,
        emoji: template.emoji,
        name: template.name,
        room: roomId,
        col,
        row,
        type: template.type,
        affordances: [...template.affordances],
        moveable: true,
        carryable: true,
        consumable: template.consumable,
        comfortValue: template.comfortValue,
        novelty: 1.0,
        userPlaced: true
      });

      this._dismissPanel();
    });

    this.overlay.appendChild(panel);
    this.activePanel = panel;

    // Keep panel in viewport
    requestAnimationFrame(() => {
      const r = panel.getBoundingClientRect();
      if (r.right > window.innerWidth) {
        panel.style.left = (pos.x - r.width) + 'px';
      }
      if (r.bottom > window.innerHeight) {
        panel.style.top = (pos.y - r.height - CELL) + 'px';
      }
    });
  }

  _onDayNight(data) {
    if (this.hud) {
      this.hud.textContent = `${data.windowEmoji} ${data.phase}`;
    }
  }
}

export default UI;
