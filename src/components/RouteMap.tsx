import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { NavLogSummary, Waypoint } from '../types';
import { OfflineTileLayer } from './OfflineTileLayer';
import { OfflineChartModal } from './OfflineChartModal';
import { AIRSPACES, Airspace } from '../data/airspace-data';
import { checkLegAirspaceConflict } from '../engine/airspace-engine';

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
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const airspaceLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [activeLayer, setActiveLayer] = useState<MapLayerType>('dark');
  const [showAirspaces, setShowAirspaces] = useState<boolean>(true);
  const [showSpecialZones, setShowSpecialZones] = useState<boolean>(true);
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState<boolean>(false);

  // Initialize Leaflet Map with Offline-Capable Tile Layer
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([39.5, -8.5], 7);

      const cfg = TILE_LAYERS[activeLayer];
      const tile = new OfflineTileLayer(cfg.url, {
        layerKey: activeLayer,
        maxZoom: cfg.maxZoom,
        subdomains: cfg.subdomains || 'abc',
        attribution: cfg.attribution,
      }).addTo(map);

      tileLayerRef.current = tile;

      const airspaceGroup = L.layerGroup().addTo(map);
      airspaceLayerGroupRef.current = airspaceGroup;

      const routeGroup = L.layerGroup().addTo(map);
      routeLayerGroupRef.current = routeGroup;

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        routeLayerGroupRef.current = null;
        airspaceLayerGroupRef.current = null;
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
    const newTile = new OfflineTileLayer(cfg.url, {
      layerKey: activeLayer,
      maxZoom: cfg.maxZoom,
      subdomains: cfg.subdomains || 'abc',
      attribution: cfg.attribution,
    }).addTo(map);

    tileLayerRef.current = newTile;
  }, [activeLayer]);

  // Render Airspace Polygons
  useEffect(() => {
    const airspaceGroup = airspaceLayerGroupRef.current;
    if (!airspaceGroup) return;

    airspaceGroup.clearLayers();

    AIRSPACES.forEach((as: Airspace) => {
      const isControlled = as.type === 'CTR' || as.type === 'TMA' || as.type === 'ATZ';
      const isSpecial = as.type === 'RESTRICTED' || as.type === 'PROHIBITED' || as.type === 'DANGER';

      if (isControlled && !showAirspaces) return;
      if (isSpecial && !showSpecialZones) return;

      // Color scheme according to ICAO aeronautical standards
      let strokeColor = '#0ea5e9'; // Cyan for CTR / Class D
      let fillColor = '#0ea5e9';
      let fillOpacity = 0.12;
      let dashArray: string | undefined = undefined;

      if (as.type === 'TMA') {
        strokeColor = '#ec4899'; // Magenta / Pink for TMA / Class C
        fillColor = '#ec4899';
        fillOpacity = 0.10;
      } else if (as.type === 'ATZ') {
        strokeColor = '#14b8a6'; // Teal for uncontrolled ATZ
        fillColor = '#14b8a6';
        fillOpacity = 0.08;
      } else if (as.type === 'RESTRICTED' || as.type === 'PROHIBITED') {
        strokeColor = '#ef4444'; // Red for Restricted / Prohibited
        fillColor = '#ef4444';
        fillOpacity = 0.20;
        dashArray = '5, 5';
      } else if (as.type === 'DANGER') {
        strokeColor = '#f97316'; // Orange for Danger Areas
        fillColor = '#f97316';
        fillOpacity = 0.14;
        dashArray = '4, 4';
      }

      // Check if current route has any leg conflict with this airspace
      let conflictSummary = '';
      if (navLog && navLog.legs.length > 0) {
        for (let i = 0; i < navLog.legs.length; i++) {
          const c = checkLegAirspaceConflict(navLog.legs[i], i, as);
          if (c) {
            if (c.status === 'PENETRATING') {
              conflictSummary = `<div class="airspace-popup-alert alert-pen">⚠️ Leg ${i + 1} (${c.legFrom}→${c.legTo}) enters at ${c.legAltitudeFt} ft!</div>`;
              break;
            } else if (c.status === 'CLIPPING') {
              conflictSummary = `<div class="airspace-popup-alert alert-clip">⚡ Leg ${i + 1} clears within ${c.verticalClearanceFt} ft</div>`;
            }
          }
        }
      }

      const polygon = L.polygon(as.polygon, {
        color: strokeColor,
        fillColor: fillColor,
        fillOpacity: fillOpacity,
        weight: isSpecial ? 2 : 1.5,
        dashArray,
      }).addTo(airspaceGroup);

      const popupContent = `
        <div class="airspace-popup">
          <div class="airspace-popup-header">
            <strong>${as.name}</strong>
            <span class="badge-${as.type.toLowerCase()}">${as.type} · Class ${as.classification}</span>
          </div>
          <div class="airspace-popup-limits">
            <span>Limits:</span> <strong>${as.lowerLimitLabel} — ${as.upperLimitLabel}</strong>
          </div>
          ${as.frequency ? `<div class="airspace-popup-freq"><span>ATC:</span> <strong>${as.frequency}</strong></div>` : ''}
          ${as.remarks ? `<div class="airspace-popup-remarks"><em>${as.remarks}</em></div>` : ''}
          ${conflictSummary}
        </div>
      `;

      polygon.bindPopup(popupContent);
    });
  }, [showAirspaces, showSpecialZones, navLog]);

  // Update Route Polylines and Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routeGroup = routeLayerGroupRef.current;
    if (!map || !routeGroup) return;

    routeGroup.clearLayers();

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
        .addTo(routeGroup);
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
        }).addTo(routeGroup);

        polyline.on('click', () => onSelectLeg(idx));

        // Midpoint Wind & Heading Label
        const midLat = (leg.from.latitude + leg.to.latitude) / 2;
        const midLon = (leg.from.longitude + leg.to.longitude) / 2;

        if (leg.wind && leg.wind.speed > 0) {
          const windMarker = L.marker([midLat, midLon], {
            icon: createWindIcon(leg.wind.direction, leg.wind.speed),
          }).addTo(routeGroup);
          windMarker.on('click', () => onSelectLeg(idx));
        }
      });
    } else if (latLngs.length > 1) {
      // Basic connecting line if navlog not calculated yet
      L.polyline(latLngs, {
        color: '#3b82f6',
        weight: 3,
        dashArray: '5, 5',
      }).addTo(routeGroup);
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
      {/* Map Control Bar */}
      <div className="map-layer-bar">
        <div className="map-layer-section">
          <span className="map-layer-title">Base:</span>
          <div className="map-layer-buttons">
            <button
              type="button"
              className={`layer-btn ${activeLayer === 'dark' ? 'active' : ''}`}
              onClick={() => setActiveLayer('dark')}
              title="Dark tactical night & cockpit mode"
            >
              🌙 Dark
            </button>
            <button
              type="button"
              className={`layer-btn ${activeLayer === 'satellite' ? 'active' : ''}`}
              onClick={() => setActiveLayer('satellite')}
              title="High-resolution aerial satellite imagery"
            >
              🛰️ Satellite
            </button>
            <button
              type="button"
              className={`layer-btn ${activeLayer === 'terrain' ? 'active' : ''}`}
              onClick={() => setActiveLayer('terrain')}
              title="Topographic relief contours"
            >
              ⛰️ Terrain
            </button>
            <button
              type="button"
              className={`layer-btn ${activeLayer === 'street' ? 'active' : ''}`}
              onClick={() => setActiveLayer('street')}
              title="VFR aeronautical landmarks & roads"
            >
              🗺️ Street
            </button>
          </div>
        </div>

        {/* Aeronautical Overlays & Offline Controls */}
        <div className="map-layer-section">
          <span className="map-layer-title">Aviation:</span>
          <div className="map-layer-buttons">
            <button
              type="button"
              className={`layer-btn ${showAirspaces ? 'active' : ''}`}
              onClick={() => setShowAirspaces(!showAirspaces)}
              title="Toggle CTR & TMA controlled airspace polygons"
            >
              ✈️ Airspaces
            </button>
            <button
              type="button"
              className={`layer-btn ${showSpecialZones ? 'active' : ''}`}
              onClick={() => setShowSpecialZones(!showSpecialZones)}
              title="Toggle Restricted, Danger & Prohibited zones"
            >
              ⚠️ Special Use
            </button>
            <button
              type="button"
              className="layer-btn offline-cache-trigger-btn"
              onClick={() => setIsOfflineModalOpen(true)}
              title="Download offline chart regions for in-flight cockpit use"
            >
              💾 Offline Charts
            </button>
          </div>
        </div>
      </div>

      <div ref={mapContainerRef} className="route-map-leaflet" />

      {/* Offline Chart Pack Downloader Modal */}
      <OfflineChartModal
        isOpen={isOfflineModalOpen}
        onClose={() => setIsOfflineModalOpen(false)}
        waypoints={waypoints}
        currentLayer={activeLayer}
        tileUrlTemplate={TILE_LAYERS[activeLayer].url}
      />
    </div>
  );
};
