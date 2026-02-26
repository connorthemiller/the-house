// Click/tap handling -- pixel-to-grid conversion, hit detection, swipe nav

class Input {
  constructor(canvas, renderer, world, bus) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.world = world;
    this.bus = bus;
    this._onClick = this._onClick.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._touchStartX = 0;
    this._touchStartY = 0;
  }

  start() {
    this.canvas.addEventListener('click', this._onClick);
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: true });
    this.canvas.addEventListener('touchend', this._onTouchEnd, { passive: true });
  }

  stop() {
    this.canvas.removeEventListener('click', this._onClick);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
  }

  _onTouchStart(e) {
    if (e.touches.length !== 1) return;
    this._touchStartX = e.touches[0].clientX;
    this._touchStartY = e.touches[0].clientY;
  }

  _onTouchEnd(e) {
    if (this.renderer.mode !== 'single') return;
    if (e.changedTouches.length !== 1) return;

    const dx = e.changedTouches[0].clientX - this._touchStartX;
    const dy = e.changedTouches[0].clientY - this._touchStartY;

    // Ignore vertical swipes
    if (Math.abs(dy) > Math.abs(dx)) return;
    // Require minimum horizontal distance
    if (Math.abs(dx) < 50) return;

    const rooms = this.world.getRoomOrder();
    const idx = rooms.indexOf(this.renderer.getCurrentRoom());
    if (idx === -1) return;

    // Swipe left = next room, swipe right = prev room
    const newIdx = dx < 0 ? idx + 1 : idx - 1;
    if (newIdx < 0 || newIdx >= rooms.length) return;

    this.bus.emit('nav:room-changed', {
      roomId: rooms[newIdx],
      roomIndex: newIdx,
      totalRooms: rooms.length
    });
  }

  _onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    const hit = this.renderer.hitTest(px, py);
    if (!hit || !hit.roomId) return; // wall or outside

    const obj = this.world.getObjectAt(hit.roomId, hit.col, hit.row);
    if (obj) {
      this.bus.emit('input:object-tapped', {
        object: obj,
        roomId: hit.roomId,
        col: hit.col,
        row: hit.row
      });
    } else {
      this.bus.emit('input:empty-tapped', {
        roomId: hit.roomId,
        col: hit.col,
        row: hit.row
      });
    }
  }
}

export default Input;
