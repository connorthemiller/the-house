// Canvas renderer -- rooms, walls, doorways, objects, lighting

const CELL = 48;
const WALL_COLOR = '#0d0d0d';
const BG_COLOR = '#0a0a0a';
const LABEL_COLOR = '#666';
const LABEL_FONT = '11px monospace';
const EMOJI_FONT = '32px serif';

class Renderer {
  constructor(canvas, world, daynight) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.daynight = daynight;
    this.roomLayout = null; // computed positions
    this.mode = 'panorama'; // 'panorama' or 'single'
    this.currentRoomId = null; // active room in single mode
    this.creature = null;
    this.dragObject = null; // { emoji, x, y } when dragging an object
  }

  setCreature(creature) {
    this.creature = creature;
  }

  init() {
    const rooms = this.world.getRoomOrder();
    this.currentRoomId = rooms[0] || null;

    // Pick initial mode based on viewport width
    this.mode = window.innerWidth < 600 ? 'single' : 'panorama';

    this.roomLayout = this._computeLayout();
    this.canvas.width = this.roomLayout.totalWidth;
    this.canvas.height = this.roomLayout.totalHeight;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.roomLayout = this._computeLayout();
    this.canvas.width = this.roomLayout.totalWidth;
    this.canvas.height = this.roomLayout.totalHeight;
  }

  setCurrentRoom(roomId) {
    if (roomId === this.currentRoomId) return;
    this.currentRoomId = roomId;
    if (this.mode === 'single') {
      this.roomLayout = this._computeLayout();
      this.canvas.width = this.roomLayout.totalWidth;
      this.canvas.height = this.roomLayout.totalHeight;
    }
  }

  getCurrentRoom() {
    return this.currentRoomId;
  }

  // Compute pixel offsets for each room on the canvas
  _computeLayout() {
    if (this.mode === 'single') {
      return this._computeSingleLayout();
    }
    return this._computePanoramaLayout();
  }

  _computePanoramaLayout() {
    const rooms = this.world.getRoomOrder();
    const layout = {};
    let x = CELL; // start 1 cell in for left wall

    for (const roomId of rooms) {
      const room = this.world.getRoom(roomId);
      layout[roomId] = {
        x: x,
        y: CELL * 2, // top wall + label row
        cols: room.cols,
        rows: room.rows
      };
      x += room.cols * CELL + CELL; // room width + wall gap
    }

    const totalWidth = x;
    const totalHeight = CELL * 2 + rooms.reduce((max, id) => {
      const r = this.world.getRoom(id);
      return Math.max(max, r.rows);
    }, 0) * CELL + CELL; // bottom wall

    return { rooms: layout, totalWidth, totalHeight };
  }

  _computeSingleLayout() {
    const roomId = this.currentRoomId;
    const room = this.world.getRoom(roomId);
    if (!room) return { rooms: {}, totalWidth: 0, totalHeight: 0 };

    const layout = {};
    layout[roomId] = {
      x: CELL,
      y: CELL * 2,
      cols: room.cols,
      rows: room.rows
    };

    const totalWidth = (room.cols + 2) * CELL;
    const totalHeight = CELL * 2 + room.rows * CELL + CELL;

    return { rooms: layout, totalWidth, totalHeight };
  }

  // Get room and cell from pixel coordinates
  hitTest(px, py) {
    for (const [roomId, pos] of Object.entries(this.roomLayout.rooms)) {
      const col = Math.floor((px - pos.x) / CELL);
      const row = Math.floor((py - pos.y) / CELL);
      if (col >= 0 && col < pos.cols && row >= 0 && row < pos.rows) {
        return { roomId, col, row };
      }
    }

    // Check if click is on a doorway
    for (const dw of this.world.getDoorways()) {
      const fromPos = this.roomLayout.rooms[dw.from];
      const toPos = this.roomLayout.rooms[dw.to];
      if (!fromPos || !toPos) continue;

      // Doorway is in the wall between rooms
      const wallX = fromPos.x + fromPos.cols * CELL;
      const wallY = fromPos.y + dw.fromRow * CELL;
      if (px >= wallX && px < wallX + CELL && py >= wallY && py < wallY + CELL) {
        return { roomId: null, col: null, row: null, isDoorway: true };
      }
    }

    return null;
  }

  getRoomPixelPos(roomId) {
    return this.roomLayout.rooms[roomId] || null;
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const brightness = this.daynight.brightness;

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Draw walls (fill the entire canvas area with wall color, then carve out rooms)
    ctx.fillStyle = WALL_COLOR;
    ctx.fillRect(0, CELL, w, h - CELL);

    // Only draw rooms that are in the current layout
    const visibleRooms = Object.keys(this.roomLayout.rooms);

    for (const roomId of visibleRooms) {
      this._drawRoom(roomId, brightness);
    }

    if (this.mode === 'panorama') {
      this._drawDoorways(brightness);
    }

    for (const roomId of visibleRooms) {
      this._drawObjects(roomId);
    }

    this._drawCreature();
    this._drawDragObject();

    for (const roomId of visibleRooms) {
      this._drawLabel(roomId);
    }
  }

  _drawRoom(roomId, brightness) {
    const ctx = this.ctx;
    const room = this.world.getRoom(roomId);
    const pos = this.roomLayout.rooms[roomId];

    const color = this._dimColor(room.color, brightness);
    ctx.fillStyle = color;
    ctx.fillRect(pos.x, pos.y, pos.cols * CELL, pos.rows * CELL);
  }

  _drawDoorways(brightness) {
    const ctx = this.ctx;
    for (const dw of this.world.getDoorways()) {
      const fromRoom = this.world.getRoom(dw.from);
      const toRoom = this.world.getRoom(dw.to);
      const fromPos = this.roomLayout.rooms[dw.from];
      const toPos = this.roomLayout.rooms[dw.to];

      if (!fromPos || !toPos) continue;

      // The wall gap is between the two rooms
      const wallX = fromPos.x + fromPos.cols * CELL;
      const wallY = fromPos.y + dw.fromRow * CELL;

      // Blend the two room colors for the doorway
      const blendedColor = this._dimColor(
        this._blendColors(fromRoom.color, toRoom.color),
        brightness
      );
      ctx.fillStyle = blendedColor;
      ctx.fillRect(wallX, wallY, CELL, CELL);
    }
  }


  _drawObjects(roomId) {
    const ctx = this.ctx;
    const pos = this.roomLayout.rooms[roomId];
    const objects = this.world.getObjectsInRoom(roomId);

    ctx.font = EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const obj of objects) {
      // If this is a day/night window, use the daynight emoji
      const emoji = obj.isDayNightWindow
        ? this.daynight.windowEmoji
        : obj.emoji;

      const cx = pos.x + obj.col * CELL + CELL / 2;
      const cy = pos.y + obj.row * CELL + CELL / 2;
      ctx.fillText(emoji, cx, cy);
    }
  }

  _drawLabel(roomId) {
    const ctx = this.ctx;
    const room = this.world.getRoom(roomId);
    const pos = this.roomLayout.rooms[roomId];

    ctx.font = LABEL_FONT;
    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const cx = pos.x + (pos.cols * CELL) / 2;
    ctx.fillText(room.name, cx, pos.y - 4);
  }

  _drawCreature() {
    if (!this.creature) return;
    var c = this.creature;
    var ctx = this.ctx;

    // Dragging -- draw at pixel position
    if (c.dragging && c._dragPixel) {
      var dx = c._dragPixel.x;
      var dy = c._dragPixel.y;
      ctx.font = EMOJI_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.emoji, dx, dy);

      // Name below
      ctx.font = '10px monospace';
      ctx.fillStyle = '#888';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(c.name, dx, dy + CELL / 2 + 2);
      return;
    }

    // Normal grid position
    var pos = this.roomLayout.rooms[c.room];
    if (!pos) return;

    var cx = pos.x + c.col * CELL + CELL / 2;
    var cy = pos.y + c.row * CELL + CELL / 2;

    // Creature emoji
    ctx.font = EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.emoji, cx, cy);

    // Name label below
    ctx.font = '10px monospace';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(c.name, cx, pos.y + c.row * CELL + CELL + 1);

    // Speech bubble
    if (c.speech && c.speech.text && Date.now() < c.speech.expiresAt) {
      this._drawSpeechBubble(cx, pos.y + c.row * CELL - 2, c.speech.text);
    }
  }

  _drawSpeechBubble(cx, bottomY, text) {
    var ctx = this.ctx;
    ctx.font = '11px monospace';
    var metrics = ctx.measureText(text);
    var tw = metrics.width;
    var pad = 6;
    var bw = tw + pad * 2;
    var bh = 18;
    var bx = cx - bw / 2;
    var by = bottomY - bh - 4;

    // Background
    ctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bx, by, bw, bh, 4);
    } else {
      ctx.rect(bx, by, bw, bh);
    }
    ctx.fill();

    // Border
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ddd';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, by + bh / 2);
  }

  _drawDragObject() {
    if (!this.dragObject) return;
    var ctx = this.ctx;
    ctx.font = EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.dragObject.emoji, this.dragObject.x, this.dragObject.y);
  }

  // Dim a hex color by brightness factor (0-1)
  _dimColor(hex, brightness) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const dr = Math.round(r * brightness);
    const dg = Math.round(g * brightness);
    const db = Math.round(b * brightness);
    return `rgb(${dr},${dg},${db})`;
  }

  // Simple average blend of two hex colors
  _blendColors(hex1, hex2) {
    const r1 = parseInt(hex1.slice(1, 3), 16);
    const g1 = parseInt(hex1.slice(3, 5), 16);
    const b1 = parseInt(hex1.slice(5, 7), 16);
    const r2 = parseInt(hex2.slice(1, 3), 16);
    const g2 = parseInt(hex2.slice(3, 5), 16);
    const b2 = parseInt(hex2.slice(5, 7), 16);
    const r = Math.round((r1 + r2) / 2);
    const g = Math.round((g1 + g2) / 2);
    const b = Math.round((b1 + b2) / 2);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
}

export { CELL };
export default Renderer;
