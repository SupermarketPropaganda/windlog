import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { NavLogSummary, Waypoint } from '../types';
import { OfflineTileLayer } from './OfflineTileLayer';
import { OfflineChartModal } from './OfflineChartModal';
import { AIRSPACES, Airspace } from '../data/airspace-data';
import {
  checkLegAirspaceConflict,
  getAirspaceClearanceAdvisory,
} from '../engine/airspace-engine';

export type MapLayerType = 'dark' | 'satellite' | 'terrain' | 'street';
export type AirspaceFilterType = 'ALL' | 'CTR' | 'TMA' | 'SPECIAL' | 'ATZ';
export type AirspaceAltitudeFilter = 'ALL' | 'VFR_LOW' | 'VFR_MID' | 'ROUTE';

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
 * Calculates geographic centroid of a polygon.
 */
function getPolygonCentroid(polygon: [number, number][]): [number, number] {
  let sumLat = 0;
  let sumLon = 0;
  const count = polygon.length;
  for (let i = 0; i < count; i++) {
    sumLat += polygon[i][0];
    sumLon += polygon[i][1];
  }
  return [sumLat / count, sumLon / count];
}

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
  const [airspaceFilter, setAirspaceFilter] = useState<AirspaceFilterType>('ALL');
  const [altitudeFilter, setAltitudeFilter] = useState<AirspaceAltitudeFilter>('ALL');
  const [showSectorLabels, setShowSectorLabels] = useState<boolean>(true);
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

  // Determine route altitude range for altitude filtering
  const routeAltRange = useMemo(() => {
    if (!navLog || navLog.legs.length === 0) return { min: 0, max: 20000 };
    const alts = navLog.legs.map((l) => l.altitude);
    return {
      min: Math.min(...alts),
      max: Math.max(...alts),
    };
  }, [navLog]);

  // Render Airspace Polygons and Sector Badges
  useEffect(() => {
    const airspaceGroup = airspaceLayerGroupRef.current;
    if (!airspaceGroup) return;

    airspaceGroup.clearLayers();
    if (!showAirspaces) return;

    AIRSPACES.forEach((as: Airspace) => {
      // 1. Type Filter
      if (airspaceFilter === 'CTR' && as.type !== 'CTR') return;
      if (airspaceFilter === 'TMA' && as.type !== 'TMA') return;
      if (
        airspaceFilter === 'SPECIAL' &&
        as.type !== 'RESTRICTED' &&
        as.type !== 'PROHIBITED' &&
        as.type !== 'DANGER'
      )
        return;
      if (airspaceFilter === 'ATZ' && as.type !== 'ATZ') return;

      // 2. Altitude Filter
      if (altitudeFilter === 'VFR_LOW' && as.lowerLimitFt > 3500) return;
      if (altitudeFilter === 'VFR_MID' && as.lowerLimitFt > 6500) return;
      if (altitudeFilter === 'ROUTE') {
        const matchesRoute =
          as.lowerLimitFt <= routeAltRange.max + 1000 &&
          as.upperLimitFt >= routeAltRange.min - 1000;
        if (!matchesRoute) return;
      }

      const isSpecial =
        as.type === 'RESTRICTED' || as.type === 'PROHIBITED' || as.type === 'DANGER';

      // Color scheme according to ICAO aeronautical standards
      let strokeColor = '#0ea5e9'; // Cyan for CTR / Class D
      let fillColor = '#0ea5e9';
      let fillOpacity = 0.12;
      let dashArray: string | undefined = undefined;

      if (as.type === 'TMA') {
        strokeColor = '#a855f7'; // Purple / Magenta for TMA / Class C
        fillColor = '#a855f7';
        fillOpacity = 0.10;
      } else if (as.type === 'ATZ') {
        strokeColor = '#14b8a6'; // Teal for uncontrolled ATZ
        fillColor = '#14b8a6';
        fillOpacity = 0.08;
      } else if (as.type === 'RESTRICTED' || as.type === 'PROHIBITED') {
        strokeColor = '#ef4444'; // Red for Restricted / Prohibited
        fillColor = '#ef4444';
        fillOpacity = 0.22;
        dashArray = '5, 5';
      } else if (as.type === 'DANGER') {
        strokeColor = '#f59e0b'; // Amber / Orange for Danger Areas
        fillColor = '#f59e0b';
        fillOpacity = 0.15;
        dashArray = '4, 4';
      }

      // Check if current route has any leg conflict with this airspace
      let conflictSummary = '';
      let hasPenetration = false;

      if (navLog && navLog.legs.length > 0) {
        for (let i = 0; i < navLog.legs.length; i++) {
          const c = checkLegAirspaceConflict(navLog.legs[i], i, as);
          if (c) {
            if (c.status === 'PENETRATING') {
              hasPenetration = true;
              conflictSummary = `<div class="airspace-popup-alert alert-pen">⚠️ Leg ${i + 1} (${c.legFrom}→${c.legTo}) enters at ${c.legAltitudeFt.toLocaleString()} ft!</div>`;
              break;
            } else if (c.status === 'CLIPPING') {
              conflictSummary = `<div class="airspace-popup-alert alert-clip">⚡ Leg ${i + 1} clears within ${c.verticalClearanceFt} ft</div>`;
            }
          }
        }
      }

      if (hasPenetration) {
        fillColor = isSpecial ? '#ef4444' : '#f97316';
        fillOpacity = 0.30;
      }

      const polygon = L.polygon(as.polygon, {
        color: strokeColor,
        fillColor: fillColor,
        fillOpacity: fillOpacity,
        weight: isSpecial || hasPenetration ? 2.5 : 1.5,
        dashArray,
      }).addTo(airspaceGroup);

      const advisory = getAirspaceClearanceAdvisory(
        as,
        navLog && navLog.legs[0] ? navLog.legs[0].altitude : 0
      );

      const popupContent = `
        <div class="airspace-popup">
          <div class="airspace-popup-header">
            <strong>${as.name}</strong>
            <span class="badge-${as.type.toLowerCase()}">${as.type} · Class ${as.classification}</span>
          </div>
          <div class="airspace-popup-limits">
            <span>Limits:</span> <strong>${as.lowerLimitLabel} — ${as.upperLimitLabel}</strong>
          </div>
          ${
            as.frequency
              ? `<div class="airspace-popup-freq"><span>ATC Contact:</span> <strong>${as.frequency}</strong></div>`
              : ''
          }
          <div class="airspace-popup-advisory">
            <span class="advisory-title">${advisory.actionTitle}:</span>
            <span class="advisory-text">${advisory.actionDetail}</span>
          </div>
          ${as.remarks ? `<div class="airspace-popup-remarks"><em>${as.remarks}</em></div>` : ''}
          ${conflictSummary}
        </div>
      `;

      polygon.bindPopup(popupContent);

      // Centroid label for prominent airspaces
      if (showSectorLabels && as.polygon.length >= 3) {
        const center = getPolygonCentroid(as.polygon);
        const labelIcon = L.divIcon({
          className: 'airspace-map-label-wrapper',
          html: `<div class="airspace-center-badge badge-${as.type.toLowerCase()}">
                   <span class="badge-id">${as.id.replace('_', ' ')}</span>
                   <span class="badge-limits">${as.lowerLimitLabel}/${as.upperLimitLabel}</span>
                 </div>`,
          iconSize: [80, 24],
          iconAnchor: [40, 12],
        });

        L.marker(center, { icon: labelIcon, interactive: false }).addTo(airspaceGroup);
      }
    });
  }, [
    showAirspaces,
    airspaceFilter,
    altitudeFilter,
    showSectorLabels,
    navLog,
    routeAltRange,
  ]);

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
      {/* Primary Map Layer & Airspace Controls Bar */}
      <div className="map-layer-bar">
        {/* Base Layer Switcher */}
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

        {/* Airspace Type Filters */}
        <div className="map-layer-section">
          <span className="map-layer-title">Airspaces:</span>
          <div className="map-layer-buttons">
            <button
              type="button"
              className={`layer-btn ${showAirspaces ? 'active' : ''}`}
              onClick={() => setShowAirspaces(!showAirspaces)}
              title="Toggle all aeronautical airspaces"
            >
              {showAirspaces ? '✓ Airspaces' : 'Airspaces'}
            </button>
            {showAirspaces && (
              <>
                <button
                  type="button"
                  className={`layer-btn ${airspaceFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setAirspaceFilter('ALL')}
                >
                  All Types
                </button>
                <button
                  type="button"
                  className={`layer-btn ${airspaceFilter === 'CTR' ? 'active' : ''}`}
                  onClick={() => setAirspaceFilter('CTR')}
                  title="Filter to Control Zones only"
                >
                  CTR
                </button>
                <button
                  type="button"
                  className={`layer-btn ${airspaceFilter === 'TMA' ? 'active' : ''}`}
                  onClick={() => setAirspaceFilter('TMA')}
                  title="Filter to Terminal Control Areas only"
                >
                  TMA
                </button>
                <button
                  type="button"
                  className={`layer-btn ${airspaceFilter === 'SPECIAL' ? 'active' : ''}`}
                  onClick={() => setAirspaceFilter('SPECIAL')}
                  title="Filter to Restricted, Danger & Prohibited areas"
                >
                  LP-R/D/P
                </button>
                <button
                  type="button"
                  className={`layer-btn ${airspaceFilter === 'ATZ' ? 'active' : ''}`}
                  onClick={() => setAirspaceFilter('ATZ')}
                  title="Filter to Aerodrome Traffic Zones"
                >
                  ATZ
                </button>
              </>
            )}
          </div>
        </div>

        {/* 3D Altitude Slicing & Offline Tool */}
        {showAirspaces && (
          <div className="map-layer-section">
            <span className="map-layer-title">Altitude Filter:</span>
            <div className="map-layer-buttons">
              <button
                type="button"
                className={`layer-btn ${altitudeFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setAltitudeFilter('ALL')}
                title="Show all vertical levels"
              >
                All Alts
              </button>
              <button
                type="button"
                className={`layer-btn ${altitudeFilter === 'VFR_LOW' ? 'active' : ''}`}
                onClick={() => setAltitudeFilter('VFR_LOW')}
                title="Only airspaces with floors below 3,500 ft (Low-level VFR)"
              >
                &lt; 3.5k VFR
              </button>
              <button
                type="button"
                className={`layer-btn ${altitudeFilter === 'VFR_MID' ? 'active' : ''}`}
                onClick={() => setAltitudeFilter('VFR_MID')}
                title="Airspaces with floors below 6,500 ft"
              >
                &lt; 6.5k
              </button>
              <button
                type="button"
                className={`layer-btn ${altitudeFilter === 'ROUTE' ? 'active' : ''}`}
                onClick={() => setAltitudeFilter('ROUTE')}
                title="Filter to sectors affecting route cruise altitude ±1,000 ft"
              >
                Route ±1k
              </button>
              <button
                type="button"
                className={`layer-btn ${showSectorLabels ? 'active' : ''}`}
                onClick={() => setShowSectorLabels(!showSectorLabels)}
                title="Toggle sector floor/ceiling labels"
              >
                🏷️ Labels
              </button>
            </div>
          </div>
        )}

        <div className="map-layer-section">
          <div className="map-layer-buttons">
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
