const CACHE_NAME = 'pagerrys-pos-v2';
const urlsToCache = [
  '/',
  '/styles.css',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Only cache resources that exist
        return Promise.allSettled(
          urlsToCache.map(url => {
            return fetch(url).then(response => {
              if (response.ok) {
                return cache.put(url, response);
              } else {
                console.log('Failed to cache:', url);
                return Promise.resolve();
              }
            }).catch(error => {
              console.log('Error caching:', url, error);
              return Promise.resolve();
            });
          })
        );
      })
  );
  self.skipWaiting();
});

// Minimal transparent PNG (1x1)
const TRANSPARENT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Yp6iGkAAAAASUVORK5CYII=';
function pngResponse() {
  const binary = atob(TRANSPARENT_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
}

// Fetch event - robust handling with icon fallbacks
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isIcon = url.pathname === '/icons/icon-192.png' || url.pathname === '/icons/icon-512.png' || url.pathname === '/icons/favicon-32.png';
  if (isIcon) {
    event.respondWith(pngResponse());
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then(cached => {
        if (cached) return cached;
        // Fallback to homepage for navigation requests
        if (event.request.mode === 'navigate') return caches.match('/');
        return new Response('Offline', { status: 0, statusText: 'Offline' });
      });
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Background sync for offline actions
self.addEventListener('sync', event => {});

// Push notification handler
self.addEventListener('push', event => {});

// Notification click handler
self.addEventListener('notificationclick', event => {});

// Message handler for communication with main app
self.addEventListener('message', event => {});

// Function to sync pending changes when online
async function syncPendingChanges() {}

// Helper function to get pending changes (implementation depends on your storage)
async function getPendingChanges() {
  // This would typically read from IndexedDB or localStorage
  // For now, return empty array as placeholder
  return [];
}

// Helper function to remove a pending change after successful sync
async function removePendingChange(changeId) {
  // This would typically remove from IndexedDB or localStorage
  // For now, just log as placeholder
  console.log('Removed pending change:', changeId);
}

// Periodic sync for background updates
self.addEventListener('periodicsync', event => {
  if (event.tag === 'periodic-sync') {
    event.waitUntil(syncPendingChanges());
  }
});

// Network status handling
self.addEventListener('online', () => {
  console.log('Service Worker: Online');
  // Trigger sync when coming back online
  self.registration.sync.register('background-sync-pending-changes');
});

self.addEventListener('offline', () => {
  console.log('Service Worker: Offline');
});

// Cache cleanup on storage pressure
self.addEventListener('storage', event => {
  if (event.isTrusted && event.key === 'storage') {
    // Check if storage is running low and clean up if needed
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(estimate => {
        const usagePercentage = (estimate.usage / estimate.quota) * 100;
        if (usagePercentage > 80) {
          console.log('Storage usage is high, cleaning up old cache');
          cleanupOldCache();
        }
      });
    }
  }
});

// Function to clean up old cache entries
async function cleanupOldCache() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    
    // Remove old entries (older than 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const dateHeader = response.headers.get('date');
        if (dateHeader) {
          const responseDate = new Date(dateHeader).getTime();
          if (responseDate < thirtyDaysAgo) {
            await cache.delete(request);
            console.log('Removed old cache entry:', request);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up cache:', error);
  }
}

// Handle fetch errors with fallback strategies
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .catch(error => {
        console.error('Fetch failed:', error);
        
        // For Supabase requests, return offline response
        if (event.request.url.includes('supabase')) {
          return new Response(JSON.stringify({ 
            error: 'Network error - working offline',
            offline: true,
            timestamp: new Date().toISOString()
          }), {
            status: 0,
            statusText: 'Offline',
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // For other requests, try to serve from cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // If no cached response, return offline page
            return new Response(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Offline - Pa Gerry's POS</title>
                  <style>
                    body { 
                      font-family: Arial, sans-serif; 
                      display: flex; 
                      justify-content: center; 
                      align-items: center; 
                      height: 100vh; 
                      margin: 0; 
                      background: #f5f5f5;
                    }
                    .offline-container { 
                      text-align: center; 
                      padding: 2rem;
                      background: white;
                      border-radius: 8px;
                      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    }
                    .offline-icon { 
                      font-size: 4rem; 
                      color: #e67e22; 
                      margin-bottom: 1rem;
                    }
                    h1 { color: #333; margin-bottom: 1rem; }
                    p { color: #666; margin-bottom: 1.5rem; }
                    .retry-btn {
                      background: #e67e22;
                      color: white;
                      border: none;
                      padding: 0.75rem 1.5rem;
                      border-radius: 4px;
                      cursor: pointer;
                      font-size: 1rem;
                    }
                    .retry-btn:hover { background: #d35400; }
                  </style>
                </head>
                <body>
                  <div class="offline-container">
                    <div class="offline-icon">📱</div>
                    <h1>You're Offline</h1>
                    <p>Please check your internet connection and try again.</p>
                    <button class="retry-btn" onclick="window.location.reload()">Retry</button>
                  </div>
                </body>
              </html>
            `, {
              status: 200,
              headers: { 'Content-Type': 'text/html' }
            });
          });
      })
  );
});