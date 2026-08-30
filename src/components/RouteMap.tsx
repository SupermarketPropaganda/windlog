import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { NavLogSummary, Waypoint } from '../types';

export type MapLayerType = 'dark' | 'satellite' | 'terrain' | 'street';

export interface RouteMapProps {
  navLog: NavLogSummary | null;
  waypoints: Waypoint[];
  activeLegIndex: number | null;
  onSelectLeg: (idx: number) => void;
}

const TILE_LAYERS: Record<
  MapLayerType,
  { url: string; attribution: string; maxZoom: number; subdomains?: string }
> = {
  dark: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, HERE, Garmin, USGS',
    maxZoom: 16,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  terrain: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, DeLorme, TomTom, USGS',
    maxZoom: 19,
  },
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 19,
    subdomains: 'abc',
  },
};

/**
 * Creates custom HTML marker icon for airports and VRPs without fixed-width box artifacts.
 */
function createWaypointIcon(wp: Waypoint, isFirst: boolean, isLast: boolean): L.DivIcon {
  let badgeClass = 'wpt-marker-vrp';
  let symbol = '◆';

  if (wp.type === 'airport') {
    badgeClass = 'wpt-marker-airport';
    symbol = '✈';
  } else if (wp.isCustom || wp.type === 'custom') {
    badgeClass = 'wpt-marker-custom';
    symbol = '★';
  }

  if (isFirst) {
    badgeClass += ' is-dep';
  } else if (isLast) {
    badgeClass += ' is-dest';
  }

  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `<div class="wpt-pin ${badgeClass}">
             <span class="wpt-symbol">${symbol}</span>
             <span class="wpt-label">${wp.identifier}</span>
           </div>`,
    iconSize: undefined,
    iconAnchor: undefined,
  });
}

/**
 * Creates custom wind arrow icon for leg midpoints.
 */
function createWindIcon(windDir: number, windSpeed: number): L.DivIcon {
  // Arrow points in direction wind is blowing TO (windDir + 180)
  const blowToAngle = (windDir + 180) % 360;

  return L.divIcon({
    className: 'custom-wind-marker',
    html: `<div class="map-wind-pill" title="Wind: ${windDir.toString().padStart(3, '0')}° / ${windSpeed} kt">
             <div class="wind-arrow-rotate" style="transform: rotate(${blowToAngle}deg)">↑</div>
             <span class="wind-spd-text">${windSpeed}kt</span>
           </div>`,
    iconSize: undefined,
    iconAnchor: undefined,
  });
}

export const RouteMap: React.FC<RouteMapProps> = ({
  navLog,
  waypoints,
  activeLegIndex,
  onSelectLeg,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [activeLayer, setActiveLayer] = useState<MapLayerType>('dark');

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([39.5, -8.5], 7);

      const cfg = TILE_LAYERS[activeLayer];
      const tile = L.tileLayer(cfg.url, {
        maxZoom: cfg.maxZoom,
        subdomains: cfg.subdomains || 'abc',
        attribution: cfg.attribution,
      }).addTo(map);

      tileLayerRef.current = tile;

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      mapInstanceRef.current = map;
    }

    return () => {
      // Clean up map instance on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, []);

  // Switch Tile Layer on user selection
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const cfg = TILE_LAYERS[activeLayer];
    const newTile = L.tileLayer(cfg.url, {
      maxZoom: cfg.maxZoom,
      subdomains: cfg.subdomains || 'abc',
      attribution: cfg.attribution,
    }).addTo(map);

    tileLayerRef.current = newTile;
  }, [activeLayer]);

  // Update Route Polylines and Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    if (!waypoints || waypoints.length === 0) {
      return;
    }

    const latLngs = waypoints.map((w) => L.latLng(w.latitude, w.longitude));

    // 1. Plot Waypoint Markers
    waypoints.forEach((wp, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === waypoints.length - 1;
      const icon = createWaypointIcon(wp, isFirst, isLast);

      L.marker([wp.latitude, wp.longitude], { icon })
        .bindPopup(
          `<div class="map-popup">
             <strong>${wp.identifier}</strong> — ${wp.name || wp.type.toUpperCase()}<br/>
             <span>${wp.latitude.toFixed(4)}°, ${wp.longitude.toFixed(4)}°</span>
             ${wp.elevation !== undefined && wp.elevation !== null ? `<br/><span>Elev: ${wp.elevation} ft</span>` : ''}
           </div>`
        )
        .addTo(layerGroup);
    });

    // 2. Plot Route Legs
    if (navLog && navLog.legs.length > 0) {
      navLog.legs.forEach((leg, idx) => {
        const isActive = activeLegIndex === idx;
        const fromCoord: [number, number] = [leg.from.latitude, leg.from.longitude];
        const toCoord: [number, number] = [leg.to.latitude, leg.to.longitude];

        // Leg Polyline
        const polyline = L.polyline([fromCoord, toCoord], {
          color: isActive ? '#38bdf8' : '#3b82f6',
          weight: isActive ? 5 : 3.5,
          opacity: isActive ? 1.0 : 0.85,
          dashArray: isActive ? undefined : '6, 6',
        }).addTo(layerGroup);

        polyline.on('click', () => onSelectLeg(idx));

        // Midpoint Wind & Heading Label
        const midLat = (leg.from.latitude + leg.to.latitude) / 2;
        const midLon = (leg.from.longitude + leg.to.longitude) / 2;

        if (leg.wind && leg.wind.speed > 0) {
          const windMarker = L.marker([midLat, midLon], {
            icon: createWindIcon(leg.wind.direction, leg.wind.speed),
          }).addTo(layerGroup);
          windMarker.on('click', () => onSelectLeg(idx));
        }
      });
    } else if (latLngs.length > 1) {
      // Basic connecting line if navlog not calculated yet
      L.polyline(latLngs, {
        color: '#3b82f6',
        weight: 3,
        dashArray: '5, 5',
      }).addTo(layerGroup);
    }

    // Auto-fit map bounds
    if (latLngs.length === 1) {
      map.setView(latLngs[0], 10);
    } else if (latLngs.length > 1) {
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [waypoints, navLog, activeLegIndex, onSelectLeg]);

  return (
    <div className="route-map-container">
      {/* Map Layer Switcher Header */}
      <div className="map-layer-bar">
        <span className="map-layer-title">Map View:</span>
        <div className="map-layer-buttons">
          <button
            type="button"
            className={`layer-btn ${activeLayer === 'dark' ? 'active' : ''}`}
            onClick={() => setActiveLayer('dark')}
          >
            🌙 Dark Tactical
          </button>
          <button
            type="button"
            className={`layer-btn ${activeLayer === 'satellite' ? 'active' : ''}`}
            onClick={() => setActiveLayer('satellite')}
          >
            🛰️ Satellite
          </button>
          <button
            type="button"
            className={`layer-btn ${activeLayer === 'terrain' ? 'active' : ''}`}
            onClick={() => setActiveLayer('terrain')}
          >
            ⛰️ Terrain
          </button>
          <button
            type="button"
            className={`layer-btn ${activeLayer === 'street' ? 'active' : ''}`}
            onClick={() => setActiveLayer('street')}
          >
            🗺️ Street
          </button>
        </div>
      </div>

      <div ref={mapContainerRef} className="route-map-leaflet" />
    </div>
  );
};
