window.__firebaseReady = new Promise(function(resolve) {
  var check = function() {
    if (window.firebase && window.firebase.initializeApp) resolve();
    else setTimeout(check, 50);
  };
  check();
});
