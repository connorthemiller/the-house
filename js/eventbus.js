// EventBus -- Pub/sub (carried from CONSTITUTION)
// Category-based, error-isolated, synchronous

class EventBus {
  constructor() {
    this.subscribers = new Map();
  }

  on(category, callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }
    if (!this.subscribers.has(category)) {
      this.subscribers.set(category, new Set());
    }
    this.subscribers.get(category).add(callback);
  }

  off(category, callback) {
    if (!this.subscribers.has(category)) return;
    this.subscribers.get(category).delete(callback);
    if (this.subscribers.get(category).size === 0) {
      this.subscribers.delete(category);
    }
  }

  emit(category, data) {
    if (!this.subscribers.has(category)) return;
    const callbacks = Array.from(this.subscribers.get(category));
    callbacks.forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error(`EventBus error in '${category}':`, err);
      }
    });
  }
}

export default EventBus;
