import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { NavLogSummary, Waypoint } from '../types';
import { OfflineTileLayer } from './OfflineTileLayer';
import { OfflineChartModal } from './OfflineChartModal';
import { AIRSPACES, Airspace } from '../data/airspace-data';
import {
  checkLegAirspaceConflict,
  getAirspaceClearanceAdvisory,
  isPointInPolygon,
  isAirspaceOnRoute,
  getAirspaceRouteStatus,
} from '../engine/airspace-engine';

export type MapLayerType = 'dark' | 'satellite' | 'terrain' | 'street';
export type AirspaceFilterType = 'ALL' | 'CTR' | 'TMA' | 'SPECIAL' | 'ATZ';

export interface RouteMapProps {
  navLog: NavLogSummary | null;
  waypoints: Waypoint[];
  activeLegIndex: number | null;
  onSelectLeg: (idx: number) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: (fullscreen: boolean) => void;
  showAirspaces?: boolean;
  onToggleShowAirspaces?: (show: boolean) => void;
  airspaceFilter?: AirspaceFilterType;
  onAirspaceFilterChange?: (filter: AirspaceFilterType) => void;
  showSectorLabels?: boolean;
  onToggleSectorLabels?: (show: boolean) => void;
  onlyRouteAirspaces?: boolean;
  onToggleOnlyRouteAirspaces?: (onlyRoute: boolean) => void;
  isVisible?: boolean;
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
 * Computes approximate 2D surface area of polygon in degree space
 * to properly order smaller airspaces on top of larger encompassing TMAs.
 */
function computePolygonApproxArea(polygon: [number, number][]): number {
  if (!polygon || polygon.length < 3) return 0;
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n - 1; i++) {
    area += polygon[i][1] * polygon[i + 1][0] - polygon[i + 1][1] * polygon[i][0];
  }
  return Math.abs(area) / 2;
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
  isFullscreen: externalIsFullscreen,
  onToggleFullscreen,
  showAirspaces: externalShowAirspaces,
  onToggleShowAirspaces,
  airspaceFilter: externalAirspaceFilter,
  onAirspaceFilterChange,
  showSectorLabels: externalShowSectorLabels,
  onToggleSectorLabels,
  onlyRouteAirspaces: externalOnlyRouteAirspaces,
  onToggleOnlyRouteAirspaces,
  isVisible = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const airspaceLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [internalFullscreen, setInternalFullscreen] = useState<boolean>(false);
  const isFullscreen = externalIsFullscreen !== undefined ? externalIsFullscreen : internalFullscreen;

  const toggleFullscreen = () => {
    const next = !isFullscreen;
    if (onToggleFullscreen) {
      onToggleFullscreen(next);
    } else {
      setInternalFullscreen(next);
    }
  };

  // Keyboard shortcut: Esc to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // When fullscreen state changes or tab visibility changes, invalidate map size so Leaflet recalculates viewport
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapInstanceRef.current && isVisible) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [isFullscreen, isVisible]);

  const [activeLayer, setActiveLayer] = useState<MapLayerType>('dark');

  const [internalShowAirspaces, setInternalShowAirspaces] = useState<boolean>(true);
  const showAirspaces = externalShowAirspaces !== undefined ? externalShowAirspaces : internalShowAirspaces;
  const setShowAirspaces = onToggleShowAirspaces || setInternalShowAirspaces;

  const [internalAirspaceFilter, setInternalAirspaceFilter] = useState<AirspaceFilterType>('ALL');
  const airspaceFilter = externalAirspaceFilter !== undefined ? externalAirspaceFilter : internalAirspaceFilter;
  const setAirspaceFilter = onAirspaceFilterChange || setInternalAirspaceFilter;

  const [internalShowSectorLabels, setInternalShowSectorLabels] = useState<boolean>(true);
  const showSectorLabels = externalShowSectorLabels !== undefined ? externalShowSectorLabels : internalShowSectorLabels;
  const setShowSectorLabels = onToggleSectorLabels || setInternalShowSectorLabels;

  const [internalOnlyRouteAirspaces, setInternalOnlyRouteAirspaces] = useState<boolean>(false);
  const onlyRouteAirspaces = externalOnlyRouteAirspaces !== undefined ? externalOnlyRouteAirspaces : internalOnlyRouteAirspaces;
  const setOnlyRouteAirspaces = onToggleOnlyRouteAirspaces || setInternalOnlyRouteAirspaces;

  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState<boolean>(false);
  const [isAirspaceDropdownOpen, setIsAirspaceDropdownOpen] = useState<boolean>(false);
  const airspaceDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        airspaceDropdownRef.current &&
        !airspaceDropdownRef.current.contains(e.target as Node)
      ) {
        setIsAirspaceDropdownOpen(false);
      }
    };
    if (isAirspaceDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAirspaceDropdownOpen]);
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

  // Render Airspace Polygons and Sector Badges
  useEffect(() => {
    const map = mapInstanceRef.current;
    const airspaceGroup = airspaceLayerGroupRef.current;
    if (!airspaceGroup || !map) return;

    airspaceGroup.clearLayers();
    if (!showAirspaces) return;

    // 1. Filter airspaces according to active filters
    const filteredAirspaces = AIRSPACES.filter((as: Airspace) => {
      // If user enabled "Route Airspaces Only", filter strictly to airspaces along the route corridor
      if (onlyRouteAirspaces) {
        if (!navLog || !navLog.legs || navLog.legs.length === 0) return false;
        if (!isAirspaceOnRoute(as, navLog.legs)) return false;
      }

      if (airspaceFilter === 'CTR' && as.type !== 'CTR') return false;
      if (airspaceFilter === 'TMA' && as.type !== 'TMA') return false;
      if (
        airspaceFilter === 'SPECIAL' &&
        as.type !== 'RESTRICTED' &&
        as.type !== 'PROHIBITED' &&
        as.type !== 'DANGER'
      )
        return false;
      if (airspaceFilter === 'ATZ' && as.type !== 'ATZ') return false;

      return true;
    });

    // 2. Sort by polygon area DESCENDING:
    // Largest encompassing TMAs are added first (at bottom of SVG DOM stack),
    // and smaller CTRs/Prohibited zones are added last (rendered on top!)
    const sortedAirspaces = [...filteredAirspaces].sort((a, b) => {
      const areaA = computePolygonApproxArea(a.polygon);
      const areaB = computePolygonApproxArea(b.polygon);
      return areaB - areaA;
    });

    // 3. Multi-sector Airspace Column Inspector:
    // When clicking any point inside overlapping airspaces, displays ALL matching
    // sectors ordered from surface (SFC) up to high altitude, eliminating large-area click traps.
    const openAirspaceColumnPopup = (latlng: L.LatLng) => {
      const clickedCoord: [number, number] = [latlng.lat, latlng.lng];
      const matched = filteredAirspaces.filter((as) =>
        isPointInPolygon(clickedCoord, as.polygon)
      );

      if (matched.length === 0) return;

      // Sort matching sectors by lowerLimitFt ascending (SFC first -> Flight Levels)
      matched.sort((a, b) => a.lowerLimitFt - b.lowerLimitFt || a.upperLimitFt - b.upperLimitFt);

      const sectorsHtml = matched
        .map((as, idx) => {
          const advisory = getAirspaceClearanceAdvisory(
            as,
            navLog && navLog.legs[0] ? navLog.legs[0].altitude : 0
          );

          let conflictHtml = '';
          if (navLog && navLog.legs.length > 0) {
            for (let i = 0; i < navLog.legs.length; i++) {
              const c = checkLegAirspaceConflict(navLog.legs[i], i, as);
              if (c) {
                if (c.status === 'PENETRATING') {
                  conflictHtml = `<div class="airspace-popup-alert alert-pen">⚠️ Leg ${i + 1} (${c.legFrom}→${c.legTo}) enters at ${c.legAltitudeFt.toLocaleString()} ft!</div>`;
                  break;
                } else if (c.status === 'CLIPPING') {
                  conflictHtml = `<div class="airspace-popup-alert alert-clip">⚡ Leg ${i + 1} clears within ${c.verticalClearanceFt} ft</div>`;
                }
              }
            }
          }

          return `
            <div class="column-sector-card card-${as.type.toLowerCase()}">
              <div class="sector-card-top">
                <span class="sector-order-num">#${idx + 1}</span>
                <strong class="sector-name">${as.name}</strong>
                <span class="sector-badge badge-${as.type.toLowerCase()}">${as.type} · Cl ${as.classification}</span>
              </div>
              <div class="sector-limits-row">
                <span>Vertical Limits:</span>
                <strong>${as.lowerLimitLabel} — ${as.upperLimitLabel}</strong>
              </div>
              ${
                as.frequency
                  ? `<div class="sector-freq-row"><span>ATC Contact:</span> <strong>${as.frequency}</strong></div>`
                  : ''
              }
              <div class="sector-advisory-row">
                <span class="advisory-title">${advisory.actionTitle}:</span>
                <span class="advisory-text">${advisory.actionDetail}</span>
              </div>
              ${as.remarks ? `<div class="sector-remarks"><em>${as.remarks}</em></div>` : ''}
              ${conflictHtml}
            </div>
          `;
        })
        .join('');

      const popupContent = `
        <div class="airspace-column-popup">
          <div class="column-popup-header">
            <div class="column-popup-title">
              <span class="column-icon">📍</span>
              <strong>Airspace Column (${matched.length} Sector${matched.length === 1 ? '' : 's'})</strong>
            </div>
            <span class="column-coords">${latlng.lat.toFixed(3)}°N, ${Math.abs(latlng.lng).toFixed(3)}°W</span>
          </div>
          <div class="column-sectors-scroll">
            ${sectorsHtml}
          </div>
        </div>
      `;

      L.popup({
        maxWidth: 380,
        minWidth: 280,
        className: 'custom-airspace-leaflet-popup',
        autoPan: true,
      })
        .setLatLng(latlng)
        .setContent(popupContent)
        .openOn(map);
    };

    // Render sorted polygons
    sortedAirspaces.forEach((as: Airspace) => {
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

      // Route conflict and vertical column evaluation
      const routeStatus =
        navLog && navLog.legs.length > 0 ? getAirspaceRouteStatus(as, navLog.legs) : null;

      const hasPenetration = routeStatus?.status === 'PENETRATING';
      const hasClipping = routeStatus?.status === 'CLIPPING';
      const isOverheadOrBelow =
        routeStatus?.status === 'ABOVE' || routeStatus?.status === 'BELOW';

      let weight = isSpecial ? 2 : 1.5;

      if (hasPenetration) {
        strokeColor = isSpecial ? '#ef4444' : '#f97316';
        fillColor = isSpecial ? '#ef4444' : '#f97316';
        fillOpacity = 0.30;
        weight = 2.5;
        dashArray = undefined;
      } else if (hasClipping) {
        strokeColor = '#eab308';
        fillColor = '#eab308';
        fillOpacity = 0.18;
        weight = 2;
        dashArray = '5, 4';
      } else if (onlyRouteAirspaces && isOverheadOrBelow) {
        fillOpacity = 0.05;
        weight = 1.2;
        dashArray = '4, 4';
      }

      const polygon = L.polygon(as.polygon, {
        color: strokeColor,
        fillColor: fillColor,
        fillOpacity: fillOpacity,
        weight,
        dashArray,
      }).addTo(airspaceGroup);

      polygon.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        openAirspaceColumnPopup(e.latlng);
      });

      // Centroid label for prominent airspaces
      if (showSectorLabels && as.polygon.length >= 3) {
        const center = getPolygonCentroid(as.polygon);
        let statusTag = '';
        if (onlyRouteAirspaces && routeStatus) {
          if (hasPenetration) statusTag = ' · ⚠️ IN';
          else if (hasClipping) statusTag = ' · ⚡ CLIP';
          else if (routeStatus.status === 'ABOVE') statusTag = ' · ↕ OVR';
          else if (routeStatus.status === 'BELOW') statusTag = ' · ↕ BLW';
        }

        const labelIcon = L.divIcon({
          className: 'airspace-map-label-wrapper',
          html: `<div class="airspace-center-badge badge-${as.type.toLowerCase()}">
                   <span class="badge-id">${as.id.replace('_', ' ')}</span>
                   <span class="badge-limits">${as.lowerLimitLabel}/${as.upperLimitLabel}${statusTag}</span>
                 </div>`,
          iconSize: [80, 24],
          iconAnchor: [40, 12],
        });

        L.marker(center, { icon: labelIcon, interactive: false }).addTo(airspaceGroup);
      }
    });

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      openAirspaceColumnPopup(e.latlng);
    };
    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [
    showAirspaces,
    airspaceFilter,
    showSectorLabels,
    onlyRouteAirspaces,
    navLog,
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
    <div className={`route-map-container ${isFullscreen ? 'is-fullscreen' : ''}`}>
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

        {/* Airspace Dropdown Menu */}
        <div className="map-layer-section airspace-dropdown-section" ref={airspaceDropdownRef}>
          <span className="map-layer-title">Airspaces:</span>
          <div className="airspace-dropdown-container">
            <button
              type="button"
              className={`layer-btn airspace-trigger-btn ${showAirspaces ? 'active' : ''} ${isAirspaceDropdownOpen ? 'open' : ''}`}
              onClick={() => setIsAirspaceDropdownOpen((prev) => !prev)}
              title="Filter and configure airspace display"
            >
              <span className="airspace-trigger-icon">{showAirspaces ? '🛡️' : '⚪'}</span>
              <span className="airspace-trigger-label">
                {!showAirspaces
                  ? 'Off'
                  : onlyRouteAirspaces
                  ? `Route · ${airspaceFilter === 'ALL' ? 'All' : airspaceFilter}`
                  : airspaceFilter === 'ALL'
                  ? 'All Airspaces'
                  : airspaceFilter}
              </span>
              <span className="airspace-trigger-arrow">{isAirspaceDropdownOpen ? '▲' : '▼'}</span>
            </button>

            {isAirspaceDropdownOpen && (
              <div className="airspace-dropdown-menu">
                <div className="airspace-menu-section-title">DISPLAY MODE</div>
                <button
                  type="button"
                  className={`airspace-menu-item ${!showAirspaces ? 'selected' : ''}`}
                  onClick={() => {
                    setShowAirspaces(false);
                    setIsAirspaceDropdownOpen(false);
                  }}
                >
                  <span className="airspace-item-indicator">{!showAirspaces ? '●' : '○'}</span>
                  <span className="airspace-item-text">Off / Hidden</span>
                </button>
                <button
                  type="button"
                  className={`airspace-menu-item ${showAirspaces && !onlyRouteAirspaces ? 'selected' : ''}`}
                  onClick={() => {
                    setShowAirspaces(true);
                    setOnlyRouteAirspaces(false);
                  }}
                >
                  <span className="airspace-item-indicator">{showAirspaces && !onlyRouteAirspaces ? '●' : '○'}</span>
                  <span className="airspace-item-text">All Regional Airspaces</span>
                </button>
                <button
                  type="button"
                  className={`airspace-menu-item ${showAirspaces && onlyRouteAirspaces ? 'selected' : ''}`}
                  onClick={() => {
                    setShowAirspaces(true);
                    setOnlyRouteAirspaces(true);
                  }}
                  title={
                    navLog && navLog.legs.length > 0
                      ? 'Only display airspaces intersected by current route'
                      : 'Requires an active route'
                  }
                >
                  <span className="airspace-item-indicator">{showAirspaces && onlyRouteAirspaces ? '●' : '○'}</span>
                  <span className="airspace-item-text">✈ Route Intersecting Only</span>
                </button>

                {showAirspaces && (
                  <>
                    <div className="airspace-menu-divider" />
                    <div className="airspace-menu-section-title">TYPE FILTER</div>
                    <button
                      type="button"
                      className={`airspace-menu-item ${airspaceFilter === 'ALL' ? 'selected' : ''}`}
                      onClick={() => setAirspaceFilter('ALL')}
                    >
                      <span className="airspace-item-check">{airspaceFilter === 'ALL' ? '✓' : ''}</span>
                      <span className="airspace-item-text">All Types (CTR, TMA, R/D/P, ATZ)</span>
                    </button>
                    <button
                      type="button"
                      className={`airspace-menu-item ${airspaceFilter === 'CTR' ? 'selected' : ''}`}
                      onClick={() => setAirspaceFilter('CTR')}
                    >
                      <span className="airspace-item-check">{airspaceFilter === 'CTR' ? '✓' : ''}</span>
                      <span className="airspace-item-text">CTR · Control Zones</span>
                    </button>
                    <button
                      type="button"
                      className={`airspace-menu-item ${airspaceFilter === 'TMA' ? 'selected' : ''}`}
                      onClick={() => setAirspaceFilter('TMA')}
                    >
                      <span className="airspace-item-check">{airspaceFilter === 'TMA' ? '✓' : ''}</span>
                      <span className="airspace-item-text">TMA · Terminal Control Areas</span>
                    </button>
                    <button
                      type="button"
                      className={`airspace-menu-item ${airspaceFilter === 'SPECIAL' ? 'selected' : ''}`}
                      onClick={() => setAirspaceFilter('SPECIAL')}
                    >
                      <span className="airspace-item-check">{airspaceFilter === 'SPECIAL' ? '✓' : ''}</span>
                      <span className="airspace-item-text">LP-R/D/P · Restricted / Danger</span>
                    </button>
                    <button
                      type="button"
                      className={`airspace-menu-item ${airspaceFilter === 'ATZ' ? 'selected' : ''}`}
                      onClick={() => setAirspaceFilter('ATZ')}
                    >
                      <span className="airspace-item-check">{airspaceFilter === 'ATZ' ? '✓' : ''}</span>
                      <span className="airspace-item-text">ATZ · Aerodrome Traffic Zones</span>
                    </button>

                    <div className="airspace-menu-divider" />
                    <div className="airspace-menu-section-title">ANNOTATIONS</div>
                    <label className="airspace-menu-checkbox-item">
                      <input
                        type="checkbox"
                        checked={showSectorLabels}
                        onChange={(e) => setShowSectorLabels(e.target.checked)}
                      />
                      <span>🏷️ Floor &amp; Ceiling Labels</span>
                    </label>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

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
            {!isFullscreen && (
              <button
                type="button"
                className="layer-btn fullscreen-toggle-btn"
                onClick={toggleFullscreen}
                title="Expand map to full screen"
              >
                ⛶ Fullscreen
              </button>
            )}
          </div>
        </div>
      </div>

      <div ref={mapContainerRef} className="route-map-leaflet" />

      {/* Floating Exit Fullscreen Button in Fullscreen mode */}
      {isFullscreen && (
        <button
          type="button"
          className="fullscreen-floating-exit-btn"
          onClick={toggleFullscreen}
          title="Exit full screen (Esc)"
        >
          ✕ Exit Fullscreen (Esc)
        </button>
      )}

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
