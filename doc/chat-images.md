# Chat image delivery

Admin image outputs keep both the durable authenticated original URL and their bounded raster preview. The shared chat presentation passes previews through attachment hydration, thumbnails and the gallery. Thumbnails prefer the small preview already present in the message; opening or downloading requests the original. A preview failure falls back to the original URL, and a gallery original failure can fall back to the saved preview.

The private Admin file route verifies the signed-in owner before accessing storage. Backblaze primary storage inherits the local storage interface, but files in its local uploads directory are disposable caches. On a cache miss the route must call the storage backend to restore the durable object before sending a FileResponse. Warm caches stream directly from disk. Missing durable objects remain 404, and private response headers and document sandboxing remain in effect.

The shared image component shows a loading state, handles one alternate source, then offers a manual retry rather than leaving a browser broken-image icon or repeatedly fetching in the background. Thumbnail controls open the gallery for retry, avoiding nested buttons. It is also used for Markdown and task/case attachment images. External URLs can still fail when their source is unavailable; the component does not fabricate replacement images or proxy arbitrary addresses.

Regression checks cover cache restoration, warm-cache streaming, ownership, missing objects, preview validation, source hydration, gallery behavior, and fallback/manual retry. Live checks use the affected saved conversation and verify image decoding and original download integrity after removing a disposable cache copy.
