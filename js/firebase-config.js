// Firebase config + initialization
// Connor: paste your firebaseConfig object from the Firebase console below.

const firebaseConfig = {
  apiKey: "AIzaSyBIzl_R0kaEqgVk1g3-MxZVZ0YSLJDaW7M",
  authDomain: "lobster-house-fe2e5.firebaseapp.com",
  databaseURL: "https://lobster-house-fe2e5-default-rtdb.firebaseio.com",
  projectId: "lobster-house-fe2e5",
  storageBucket: "lobster-house-fe2e5.firebasestorage.app",
  messagingSenderId: "468579007029",
  appId: "1:468579007029:web:b0aca66710c653f3c20f7c",
  measurementId: "G-QD89F7KHQ4"
};

var _app = null;
var _db = null;
var _firebaseAvailable = false;
var _initPromise = null;

// Check if config has been filled in
function _isConfigured() {
  return firebaseConfig.apiKey && firebaseConfig.databaseURL;
}

// Initialize Firebase with a timeout
// Returns true if available, false if not
async function initFirebase(timeoutMs) {
  if (timeoutMs === undefined) timeoutMs = 5000;

  if (_initPromise) return _initPromise;

  _initPromise = new Promise(async function(resolve) {
    if (!_isConfigured()) {
      console.warn('Firebase config not set -- using offline mode');
      _firebaseAvailable = false;
      window.__firebaseAvailable = false;
      resolve(false);
      return;
    }

    var resolved = false;
    function resolveOnce(val) {
      if (resolved) return;
      resolved = true;
      resolve(val);
    }

    var timer = setTimeout(function() {
      console.warn('Firebase init timed out -- using offline mode');
      _firebaseAvailable = false;
      window.__firebaseAvailable = false;
      resolveOnce(false);
    }, timeoutMs);

    try {
      var appMod = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js');
      var dbMod = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js');

      _app = appMod.initializeApp(firebaseConfig);
      _db = dbMod.getDatabase(_app);

      // Test connectivity with .info/connected
      var connRef = dbMod.ref(_db, '.info/connected');
      await new Promise(function(connResolve) {
        var unsub = dbMod.onValue(connRef, function(snap) {
          unsub();
          connResolve();
        });
      });

      clearTimeout(timer);
      // SDK loaded and got initial connection state -- mark available
      _firebaseAvailable = true;
      window.__firebaseAvailable = true;
      resolveOnce(true);
    } catch (err) {
      clearTimeout(timer);
      console.warn('Firebase init failed:', err);
      _firebaseAvailable = false;
      window.__firebaseAvailable = false;
      resolveOnce(false);
    }
  });

  return _initPromise;
}

function getDb() {
  return _db;
}

function isFirebaseAvailable() {
  return _firebaseAvailable;
}

export { initFirebase, getDb, isFirebaseAvailable };
