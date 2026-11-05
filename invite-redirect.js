// Route Supabase invitation and password recovery callbacks to the auth page.
// Run synchronously before the local reporting prototype initializes.
// Never log, inspect, or send auth tokens to another origin.
(function () {
  'use strict';
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  const keys = ['access_token', 'refresh_token', 'code', 'token_hash', 'error', 'error_code', 'error_description'];
  const callback = keys.some(key => query.has(key) || fragment.has(key));
  const kind = fragment.get('type') || query.get('type');
  if (callback || kind === 'invite' || kind === 'recovery') {
    location.replace('login.html' + location.search + location.hash);
  }
})();
