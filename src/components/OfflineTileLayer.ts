import L from 'leaflet';
import { getCachedTileBlob, setCachedTileBlob } from '../data/tile-cache';

export interface OfflineTileLayerOptions extends L.TileLayerOptions {
  layerKey: string;
}

/**
 * Offline-first Leaflet TileLayer that loads cached tiles from IndexedDB
 * and lazily caches online tiles when connected.
 */
export class OfflineTileLayer extends L.TileLayer {
  private layerKey: string;

  constructor(urlTemplate: string, options: OfflineTileLayerOptions) {
    super(urlTemplate, options);
    this.layerKey = options.layerKey || 'default';
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const img = document.createElement('img');
    img.alt = '';
    img.setAttribute('role', 'presentation');

    const { z, x, y } = coords;
    const layer = this.layerKey;

    let isDone = false;
    const safeDone = (error?: Error) => {
      if (!isDone) {
        isDone = true;
        done(error, img);
      }
    };

    L.DomEvent.on(img, 'load', () => safeDone());
    L.DomEvent.on(img, 'error', () => {
      img.src =
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="%230f172a" stroke="%231e293b"/><text x="128" y="124" fill="%23475569" font-family="monospace" font-size="11" text-anchor="middle">OFFLINE</text><text x="128" y="142" fill="%23334155" font-family="monospace" font-size="9" text-anchor="middle">Z' +
        z +
        ' X' +
        x +
        ' Y' +
        y +
        '</text></svg>';
      safeDone();
    });

    // 1. Try local IndexedDB offline cache first
    getCachedTileBlob(layer, z, x, y)
      .then((blob) => {
        if (blob && blob.size > 0) {
          img.src = URL.createObjectURL(blob);
          return;
        }

        // 2. Not in cache: get network URL from Leaflet
        const tileUrl = this.getTileUrl(coords);

        fetch(tileUrl)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.blob();
          })
          .then((networkBlob) => {
            if (
              !networkBlob ||
              networkBlob.size === 0 ||
              (networkBlob.type &&
                (networkBlob.type.includes('text/html') || networkBlob.type.includes('application/json')))
            ) {
              throw new Error('Invalid or corrupted tile blob');
            }
            img.src = URL.createObjectURL(networkBlob);
            // Lazily cache for future offline flights
            setCachedTileBlob(layer, z, x, y, networkBlob).catch(() => {});
          })
          .catch(() => {
            // Network failure or offline: render placeholder tile
            img.src =
              'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="%230f172a" stroke="%231e293b"/><text x="128" y="124" fill="%23475569" font-family="monospace" font-size="11" text-anchor="middle">OFFLINE</text><text x="128" y="142" fill="%23334155" font-family="monospace" font-size="9" text-anchor="middle">Z' +
              z +
              ' X' +
              x +
              ' Y' +
              y +
              '</text></svg>';
          });
      })
      .catch(() => {
        const tileUrl = this.getTileUrl(coords);
        img.src = tileUrl;
      });

    return img;
  }
}
