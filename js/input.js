// Click/tap handling -- pixel-to-grid conversion, hit detection, drag, swipe nav

import { CELL } from './renderer.js';

class Input {
  constructor(canvas, renderer, world, bus) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.world = world;
    this.bus = bus;
    this.creature = null;

    // Drag state (shared between mouse and touch)
    this._pendingDrag = null;   // { type: 'creature'|'object', startX, startY, obj?, roomId?, col?, row? }
    this._activeDrag = null;    // 'creature' | 'object' | null
    this._dragObject = null;    // { id, emoji, origRoom, origCol, origRow, objData }
    this._mouseDownHit = null;

    // Touch state
    this._touchStartX = 0;
    this._touchStartY = 0;

    // Bind handlers
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
  }

  setCreature(creature) {
    this.creature = creature;
  }

  start() {
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this._onTouchEnd, { passive: false });
  }

  stop() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchmove', this._onTouchMove);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
  }

  _canvasCoords(clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var scaleX = this.canvas.width / rect.width;
    var scaleY = this.canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  _isCreatureAt(hit) {
    if (!this.creature || !hit || !hit.roomId) return false;
    return this.creature.room === hit.roomId &&
      this.creature.col === hit.col &&
      this.creature.row === hit.row;
  }

  // --- Mouse handlers ---

  _onMouseDown(e) {
    var coords = this._canvasCoords(e.clientX, e.clientY);
    var hit = this.renderer.hitTest(coords.x, coords.y);

    this._pendingDrag = null;
    this._mouseDownHit = null;

    if (hit && hit.roomId) {
      // Check creature
      if (this.creature && !this.creature.dragging && this._isCreatureAt(hit)) {
        this._pendingDrag = {
          type: 'creature', startX: e.clientX, startY: e.clientY
        };
        return;
      }

      // Check draggable object
      var obj = this.world.getObjectAt(hit.roomId, hit.col, hit.row);
      if (obj && obj.userPlaced) {
        this._pendingDrag = {
          type: 'object', startX: e.clientX, startY: e.clientY,
          obj: obj, roomId: hit.roomId, col: hit.col, row: hit.row
        };
        return;
      }
    }

    this._mouseDownHit = hit;
  }

  _onMouseMove(e) {
    // Active creature drag
    if (this._activeDrag === 'creature' && this.creature) {
      var coords = this._canvasCoords(e.clientX, e.clientY);
      this.creature._dragPixel = { x: coords.x, y: coords.y };
      this.bus.emit('creature:dragging', { x: coords.x, y: coords.y });
      return;
    }

    // Active object drag
    if (this._activeDrag === 'object' && this._dragObject) {
      var coords = this._canvasCoords(e.clientX, e.clientY);
      this.renderer.dragObject = { emoji: this._dragObject.emoji, x: coords.x, y: coords.y };
      this.bus.emit('object:dragging', { x: coords.x, y: coords.y });
      return;
    }

    // Check pending drag threshold
    if (this._pendingDrag) {
      var dx = e.clientX - this._pendingDrag.startX;
      var dy = e.clientY - this._pendingDrag.startY;
      if (Math.abs(dx) + Math.abs(dy) >= 5) {
        this._startDrag(e.clientX, e.clientY);
      }
    }
  }

  _onMouseUp(e) {
    // Creature drag drop
    if (this._activeDrag === 'creature' && this.creature) {
      var coords = this._canvasCoords(e.clientX, e.clientY);
      var hit = this.renderer.hitTest(coords.x, coords.y);
      this._activeDrag = null;
      this._pendingDrag = null;
      this._dropCreature(hit, coords);
      return;
    }

    // Object drag drop
    if (this._activeDrag === 'object' && this._dragObject) {
      var coords = this._canvasCoords(e.clientX, e.clientY);
      var hit = this.renderer.hitTest(coords.x, coords.y);
      this._activeDrag = null;
      this._pendingDrag = null;
      this._dropObject(hit);
      return;
    }

    // Pending drag that never exceeded threshold -> click
    if (this._pendingDrag) {
      var pd = this._pendingDrag;
      this._pendingDrag = null;
      if (pd.type === 'creature') {
        this._handleClick({ roomId: this.creature.room, col: this.creature.col, row: this.creature.row });
      } else if (pd.type === 'object') {
        this._handleClick({ roomId: pd.roomId, col: pd.col, row: pd.row });
      }
      return;
    }

    // Regular click
    if (this._mouseDownHit) {
      this._handleClick(this._mouseDownHit);
      this._mouseDownHit = null;
    }
  }

  // --- Touch handlers ---

  _onTouchStart(e) {
    if (e.touches.length !== 1) return;

    var touch = e.touches[0];
    this._touchStartX = touch.clientX;
    this._touchStartY = touch.clientY;

    var coords = this._canvasCoords(touch.clientX, touch.clientY);
    var hit = this.renderer.hitTest(coords.x, coords.y);

    this._pendingDrag = null;

    if (hit && hit.roomId) {
      if (this.creature && !this.creature.dragging && this._isCreatureAt(hit)) {
        e.preventDefault();
        this._pendingDrag = {
          type: 'creature', startX: touch.clientX, startY: touch.clientY
        };
        return;
      }

      var obj = this.world.getObjectAt(hit.roomId, hit.col, hit.row);
      if (obj && obj.userPlaced) {
        e.preventDefault();
        this._pendingDrag = {
          type: 'object', startX: touch.clientX, startY: touch.clientY,
          obj: obj, roomId: hit.roomId, col: hit.col, row: hit.row
        };
        return;
      }
    }
  }

  _onTouchMove(e) {
    // Active creature drag
    if (this._activeDrag === 'creature' && this.creature) {
      e.preventDefault();
      var touch = e.touches[0];
      var coords = this._canvasCoords(touch.clientX, touch.clientY);
      this.creature._dragPixel = { x: coords.x, y: coords.y };
      this.bus.emit('creature:dragging', { x: coords.x, y: coords.y });
      return;
    }

    // Active object drag
    if (this._activeDrag === 'object' && this._dragObject) {
      e.preventDefault();
      var touch = e.touches[0];
      var coords = this._canvasCoords(touch.clientX, touch.clientY);
      this.renderer.dragObject = { emoji: this._dragObject.emoji, x: coords.x, y: coords.y };
      this.bus.emit('object:dragging', { x: coords.x, y: coords.y });
      return;
    }

    // Check pending drag threshold
    if (this._pendingDrag) {
      var touch = e.touches[0];
      var dx = touch.clientX - this._pendingDrag.startX;
      var dy = touch.clientY - this._pendingDrag.startY;
      if (Math.abs(dx) + Math.abs(dy) >= 5) {
        e.preventDefault();
        this._startDrag(touch.clientX, touch.clientY);
      }
    }
  }

  _onTouchEnd(e) {
    // Creature drag drop
    if (this._activeDrag === 'creature' && this.creature) {
      e.preventDefault();
      var touch = e.changedTouches[0];
      var coords = this._canvasCoords(touch.clientX, touch.clientY);
      var hit = this.renderer.hitTest(coords.x, coords.y);
      this._activeDrag = null;
      this._pendingDrag = null;
      this._dropCreature(hit, coords);
      return;
    }

    // Object drag drop
    if (this._activeDrag === 'object' && this._dragObject) {
      e.preventDefault();
      var touch = e.changedTouches[0];
      var coords = this._canvasCoords(touch.clientX, touch.clientY);
      var hit = this.renderer.hitTest(coords.x, coords.y);
      this._activeDrag = null;
      this._pendingDrag = null;
      this._dropObject(hit);
      return;
    }

    // Pending drag that didn't exceed threshold -> click
    if (this._pendingDrag) {
      var pd = this._pendingDrag;
      this._pendingDrag = null;
      if (pd.type === 'creature') {
        this._handleClick({ roomId: this.creature.room, col: this.creature.col, row: this.creature.row });
      } else if (pd.type === 'object') {
        this._handleClick({ roomId: pd.roomId, col: pd.col, row: pd.row });
      }
      return;
    }

    if (e.changedTouches.length !== 1) return;
    var dx = e.changedTouches[0].clientX - this._touchStartX;
    var dy = e.changedTouches[0].clientY - this._touchStartY;

    // Swipe navigation (single-room mode only)
    if (this.renderer.mode === 'single' &&
        Math.abs(dy) <= Math.abs(dx) && Math.abs(dx) >= 50) {
      var rooms = this.world.getRoomOrder();
      var idx = rooms.indexOf(this.renderer.getCurrentRoom());
      if (idx !== -1) {
        var newIdx = dx < 0 ? idx + 1 : idx - 1;
        if (newIdx >= 0 && newIdx < rooms.length) {
          this.bus.emit('nav:room-changed', {
            roomId: rooms[newIdx],
            roomIndex: newIdx,
            totalRooms: rooms.length
          });
          return;
        }
      }
    }

    // Tap (short distance) -- treat as click
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      var touch = e.changedTouches[0];
      var coords = this._canvasCoords(touch.clientX, touch.clientY);
      var hit = this.renderer.hitTest(coords.x, coords.y);
      if (hit) this._handleClick(hit);
    }
  }

  // --- Shared logic ---

  _startDrag(clientX, clientY) {
    var coords = this._canvasCoords(clientX, clientY);
    var pd = this._pendingDrag;
    if (!pd) return;

    if (pd.type === 'creature') {
      this._activeDrag = 'creature';
      this.creature.pickup();
      this.creature._dragPixel = { x: coords.x, y: coords.y };
      this.bus.emit('creature:dragging', { x: coords.x, y: coords.y });
    } else if (pd.type === 'object') {
      this._dragObject = {
        id: pd.obj.id,
        emoji: pd.obj.emoji,
        origRoom: pd.roomId,
        origCol: pd.col,
        origRow: pd.row,
        objData: pd.obj
      };
      this.world.removeObject(pd.obj.id);
      this._activeDrag = 'object';
      this.renderer.dragObject = { emoji: pd.obj.emoji, x: coords.x, y: coords.y };
      this.bus.emit('object:dragging', { x: coords.x, y: coords.y });
    }
    this._pendingDrag = null;
  }

  _dropCreature(hit, coords) {
    if (!this.creature) return;

    // Valid drop: empty cell in a room
    if (hit && hit.roomId && this.world.cellIsEmpty(hit.roomId, hit.col, hit.row)) {
      this.creature.drop(hit.roomId, hit.col, hit.row);
      return;
    }

    // In single-room mode, check if dropped off left/right edge -> adjacent room
    if (this.renderer.mode === 'single' && coords) {
      var edgeDrop = this._resolveEdgeDrop(coords);
      if (edgeDrop) {
        this.creature.drop(edgeDrop.roomId, edgeDrop.col, edgeDrop.row);
        this.bus.emit('nav:room-changed', {
          roomId: edgeDrop.roomId,
          roomIndex: this.world.getRoomOrder().indexOf(edgeDrop.roomId),
          totalRooms: this.world.getRoomOrder().length
        });
        return;
      }
    }

    // Invalid drop -- return to original position
    this.creature.drop(this.creature.room, this.creature.col, this.creature.row);
  }

  _dropObject(hit) {
    var dobj = this._dragObject;
    if (!dobj) return;

    var data = dobj.objData;

    // Valid drop: empty cell, no creature on it
    if (hit && hit.roomId && this.world.cellIsEmpty(hit.roomId, hit.col, hit.row)) {
      var creatureOnCell = this.creature &&
        this.creature.room === hit.roomId &&
        this.creature.col === hit.col &&
        this.creature.row === hit.row;
      if (!creatureOnCell) {
        data.room = hit.roomId;
        data.col = hit.col;
        data.row = hit.row;
        this.world.addObject(data);
        this.renderer.dragObject = null;
        this._dragObject = null;
        return;
      }
    }

    // Invalid drop -- return to original
    data.room = dobj.origRoom;
    data.col = dobj.origCol;
    data.row = dobj.origRow;
    this.world.addObject(data);
    this.renderer.dragObject = null;
    this._dragObject = null;
  }

  _resolveEdgeDrop(coords) {
    var currentRoomId = this.renderer.getCurrentRoom();
    var pos = this.renderer.getRoomPixelPos(currentRoomId);
    if (!pos) return null;

    var rooms = this.world.getRoomOrder();
    var idx = rooms.indexOf(currentRoomId);
    var doorways = this.world.getDoorways();
    var targetRoomId = null;
    var dw = null;

    if (coords.x < pos.x) {
      // Dropped left -- find room to the left
      if (idx <= 0) return null;
      for (var i = 0; i < doorways.length; i++) {
        if (doorways[i].to === currentRoomId) { dw = doorways[i]; break; }
      }
      if (!dw) return null;
      targetRoomId = dw.from;
      var col = dw.fromCol;
      var row = dw.fromRow;
    } else if (coords.x > pos.x + pos.cols * CELL) {
      // Dropped right -- find room to the right
      if (idx >= rooms.length - 1) return null;
      for (var i = 0; i < doorways.length; i++) {
        if (doorways[i].from === currentRoomId) { dw = doorways[i]; break; }
      }
      if (!dw) return null;
      targetRoomId = dw.to;
      var col = dw.toCol;
      var row = dw.toRow;
    } else {
      return null;
    }

    // Check if the doorway cell is free
    if (this.world.cellIsEmpty(targetRoomId, col, row)) {
      return { roomId: targetRoomId, col: col, row: row };
    }

    // Try cells adjacent to the doorway entry
    var room = this.world.getRoom(targetRoomId);
    var tries = [[col, row - 1], [col, row + 1]];
    for (var i = 0; i < tries.length; i++) {
      var tc = tries[i][0];
      var tr = tries[i][1];
      if (tc >= 0 && tc < room.cols && tr >= 0 && tr < room.rows &&
          this.world.cellIsEmpty(targetRoomId, tc, tr)) {
        return { roomId: targetRoomId, col: tc, row: tr };
      }
    }

    return null;
  }

  _handleClick(hit) {
    if (!hit || !hit.roomId) return;

    // Creature tap check
    if (this._isCreatureAt(hit)) {
      this.bus.emit('input:creature-tapped', {
        creature: this.creature,
        roomId: hit.roomId,
        col: hit.col,
        row: hit.row
      });
      return;
    }

    var obj = this.world.getObjectAt(hit.roomId, hit.col, hit.row);
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
