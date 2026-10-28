import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { NavLogSummary, Waypoint } from '../types';
import { OfflineTileLayer } from '../components/OfflineTileLayer';
import { OfflineChartModal } from '../components/OfflineChartModal';
import { AIRSPACES, Airspace } from '../data/airspace-data';
import { findAirportRunways } from '../data/airport-runways';
import {
  getAirspaceClearanceAdvisory,
  isPointInPolygon,
  isAirspaceOnRoute,
  getAirspaceRouteStatus,
} from '../engine/airspace-engine';
import { greatCircleDistance, initialBearing } from '../engine/coordinate-math';
import { magneticDeclination } from '../engine/wmm2025';
import { destinationPoint } from './inflight-nav';
import { queryAirspacesAtCoordinate } from './spatial-airspace-index';
import {
  BreadcrumbPoint,
  DirectToState,
  InFlightNavSolution,
  OwnshipTelemetry,
} from './types-plus';
import { TrafficTarget } from './traffic-service';
import { TrafficCircuitGeometry } from './engine/circuit-pattern';

export type MapLayerType = 'hybrid' | 'terrain' | 'street' | 'satellite' | 'dark';
export type AirspaceFilterType = 'ALL' | 'CTR' | 'TMA' | 'SPECIAL' | 'ATZ';
export type MapOrientationMode = 'north-up' | 'track-up';

export interface PlusRouteMapProps {
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
  alternateAirport?: Waypoint | null;

  // ─── GustLog Plus In-Flight Props ───
  isFlightModeActive: boolean;
  ownship: OwnshipTelemetry;
  navSolution: InFlightNavSolution;
  breadcrumbs: BreadcrumbPoint[];
  directToState: DirectToState | null;
  onActivateDirectTo: (target: Waypoint, routeIndex: number | null) => void;
  onInsertWaypointInLeg?: (legIndex: number, lat: number, lon: number) => void;
  isMapClickPlacementMode: boolean;
  onMapPlaceOwnship: (lat: number, lon: number) => void;
  focusHazardRequest?: { lat: number; lon: number; airspaceId?: string; nonce: number } | null;
  trafficTargets?: TrafficTarget[];
  activeCircuitPattern?: TrafficCircuitGeometry | null;
}

const HILLSHADE_RELIEF_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}';

const TILE_LAYERS: Record<
  MapLayerType,
  {
    url: string;
    attribution: string;
    maxZoom: number;
    subdomains?: string;
    overlayHillshade?: boolean;
  }
> = {
  hybrid: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, USGS, HERE, Garmin, OpenStreetMap (Terrain + Street Hybrid)',
    maxZoom: 19,
    overlayHillshade: true,
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap (CC-BY-SA), OpenStreetMap contributors, SRTM',
    maxZoom: 17,
    subdomains: 'abc',
  },
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 19,
    subdomains: 'abc',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  dark: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, HERE, Garmin, USGS',
    maxZoom: 16,
  },
};

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

function computePolygonApproxArea(polygon: [number, number][]): number {
  if (!polygon || polygon.length < 3) return 0;
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n - 1; i++) {
    area += polygon[i][1] * polygon[i + 1][0] - polygon[i + 1][1] * polygon[i][0];
  }
  return Math.abs(area) / 2;
}

function projectTuple(
  lat: number,
  lon: number,
  bearingTrueDeg: number,
  distanceNm: number
): [number, number] {
  const pt = destinationPoint(lat, lon, bearingTrueDeg, distanceNm);
  return [pt.latitude, pt.longitude];
}

/**
 * Computes a 70% look-ahead camera center offset along the aircraft's ground track
 * so Ownship sits in the lower-back portion of the viewport and 70% of the screen
 * displays the airspace and terrain ahead.
 */
function computeLookAheadCameraCenter(
  lat: number,
  lon: number,
  trueTrackDeg: number,
  zoom: number
): [number, number] {
  // Approximate look-ahead offset in NM scaled by zoom level
  const baseLookAheadNm = 1.6 * Math.pow(2, 12 - Math.min(15, Math.max(7, zoom)));
  const clampedNm = Math.max(0.25, Math.min(18, baseLookAheadNm));
  return projectTuple(lat, lon, trueTrackDeg, clampedNm);
}

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
    html: `<div class="wpt-pin ${badgeClass} plus-counter-rotatable">
             <span class="wpt-symbol">${symbol}</span>
             <span class="wpt-label">${wp.identifier}</span>
           </div>`,
    iconSize: undefined,
    iconAnchor: undefined,
  });
}

function createWindIcon(windDir: number, windSpeed: number): L.DivIcon {
  const blowToAngle = (windDir + 180) % 360;
  return L.divIcon({
    className: 'custom-wind-marker',
    html: `<div class="map-wind-pill plus-counter-rotatable" title="Wind: ${windDir.toString().padStart(3, '0')}° / ${windSpeed} kt">
             <div class="wind-arrow-rotate" style="transform: rotate(${blowToAngle}deg)">↑</div>
             <span class="wind-spd-text">${windSpeed}kt</span>
           </div>`,
    iconSize: undefined,
    iconAnchor: undefined,
  });
}

function createClimbMarkerIcon(type: 'TOC' | 'TOD', distNm: number, altFt: number): L.DivIcon {
  const isToc = type === 'TOC';
  const color = isToc ? '#38bdf8' : '#c2a667';
  const arrow = isToc ? '▲' : '▼';
  return L.divIcon({
    className: 'custom-climb-marker',
    html: `<div class="map-climb-badge plus-counter-rotatable ${isToc ? 'is-toc' : 'is-tod'}" title="${type} at ${distNm.toFixed(1)} NM (${altFt.toLocaleString()} ft MSL)" style="border: 1.5px solid ${color}; background: rgba(15, 23, 42, 0.92); color: ${color}; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: bold; font-family: monospace; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.5); white-space: nowrap;">
             <span>${arrow} ${type}</span>
             <span style="opacity: 0.85;">${distNm.toFixed(1)}NM</span>
           </div>`,
    iconSize: undefined,
    iconAnchor: [35, 12],
  });
}

function createAlternateMarkerIcon(wp: Waypoint): L.DivIcon {
  return L.divIcon({
    className: 'custom-alternate-marker',
    html: `<div class="wpt-pin wpt-marker-airport is-alt plus-counter-rotatable" style="border: 2px solid #f59e0b; background: rgba(39, 33, 21, 0.95); color: #fde047; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 0 10px rgba(245, 158, 11, 0.4);">
             <span style="color: #f59e0b;">✈</span>
             <span>ALT: ${wp.identifier}</span>
           </div>`,
    iconSize: undefined,
    iconAnchor: undefined,
  });
}

function formatEteShort(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins >= 60) {
    return `${Math.floor(mins / 60)}h${(mins % 60).toString().padStart(2, '0')}m`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Creates the directional Moving Map Ownship SVG Icon with live altitude, GS, and vertical trend tag.
 */
function createOwnshipIcon(ownship: OwnshipTelemetry): L.DivIcon {
  const altStr =
    ownship.altitudeMslFt !== null
      ? `${ownship.altitudeMslFt.toLocaleString()} FT`
      : '--- FT';
  const vsArrow =
    ownship.verticalSpeedFpm > 75
      ? `▲+${ownship.verticalSpeedFpm}`
      : ownship.verticalSpeedFpm < -75
      ? `▼${ownship.verticalSpeedFpm}`
      : '';

  return L.divIcon({
    className: 'plus-ownship-leaflet-icon',
    html: `
      <div class="plus-ownship-wrap">
        <div class="plus-ownship-rotator" style="transform: rotate(${ownship.trueTrackDeg}deg)">
          <svg width="42" height="42" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="21" cy="21" r="18" fill="rgba(14, 165, 233, 0.16)" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="3 2" />
            <path d="M21 4 L24.2 16.5 L36 21.5 L36 24.2 L24.2 21.8 L23.5 31.5 L28.5 35 L28.5 37 L21 35.2 L13.5 37 L13.5 35 L18.5 31.5 L17.8 21.8 L6 24.2 L6 21.5 L17.8 16.5 Z" fill="#38bdf8" stroke="#090d16" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="plus-ownship-telemetry-tag plus-counter-rotatable">
          <span class="own-tag-alt">${altStr}</span>
          <span class="own-tag-gs">${ownship.groundSpeedKt}KT</span>
          ${vsArrow ? `<span class="own-tag-vs">${vsArrow}</span>` : ''}
        </div>
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function createTrafficMarkerIcon(t: TrafficTarget): L.DivIcon {
  const isThreat = t.isThreat;
  const isCaution = t.isCaution && !isThreat;
  const relAltStr =
    t.relativeAltFt !== null
      ? t.relativeAltFt >= 0
        ? `+${Math.round(t.relativeAltFt / 100).toString().padStart(2, '0')}`
        : `-${Math.abs(Math.round(t.relativeAltFt / 100)).toString().padStart(2, '0')}`
      : '';
  const vsArrow = t.verticalSpeedFpm > 300 ? '▲' : t.verticalSpeedFpm < -300 ? '▼' : '';
  const markerClass = isThreat ? 'traffic-threat' : isCaution ? 'traffic-caution' : 'traffic-normal';
  const color = isThreat ? '#ef4444' : isCaution ? '#f59e0b' : '#06b6d4';

  return L.divIcon({
    className: 'plus-traffic-leaflet-icon',
    html: `
      <div class="plus-traffic-wrap ${markerClass}" title="${t.callsign} · ${t.altitudeFt ?? '---'} FT · ${t.groundSpeedKt} KT">
        <div class="traffic-rotator" style="transform: rotate(${t.trackDeg}deg)">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            ${
              isThreat
                ? `<circle cx="14" cy="14" r="10" stroke="#ef4444" stroke-width="2.5" fill="rgba(239, 68, 68, 0.25)" class="pulse-ring"/>`
                : `<path d="M14 3 L22 23 L14 18 L6 23 Z" fill="${color}" stroke="#0b1120" stroke-width="1.5" />`
            }
          </svg>
        </div>
        <div class="traffic-tag plus-counter-rotatable">
          <span class="traffic-callsign">${t.callsign}</span>
          ${relAltStr ? `<span class="traffic-relalt">${relAltStr}${vsArrow}</span>` : ''}
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

export const PlusRouteMap: React.FC<PlusRouteMapProps> = ({
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
  alternateAirport,
  isFlightModeActive,
  ownship,
  navSolution,
  breadcrumbs,
  directToState,
  onActivateDirectTo,
  onInsertWaypointInLeg,
  isMapClickPlacementMode,
  onMapPlaceOwnship,
  focusHazardRequest,
  trafficTargets = [],
  activeCircuitPattern = null,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const hillshadeLayerRef = useRef<L.TileLayer | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const airspaceLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const inflightLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const dynamicCalloutsGroupRef = useRef<L.LayerGroup | null>(null);
  const inspectorLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const trafficLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const circuitLayerGroupRef = useRef<L.LayerGroup | null>(null);

  // Persistent Leaflet vector/marker refs for zero-GC 1 Hz telemetry mutation
  const persistentInflightRef = useRef<{
    breadcrumbCasing: L.Polyline | null;
    breadcrumbLine: L.Polyline | null;
    courseCasing: L.Polyline | null;
    courseLine: L.Polyline | null;
    offTrackCasing: L.Polyline | null;
    offTrackLine: L.Polyline | null;
    offTrackBadge: L.Marker | null;
    trackVectorCasing: L.Polyline | null;
    trackVectorLine: L.Polyline | null;
    bananaCasing: L.Polyline | null;
    bananaLine: L.Polyline | null;
    bananaBadge: L.Marker | null;
    glideCasing: L.Polygon | null;
    glidePolygon: L.Polygon | null;
    glideBadge: L.Marker | null;
    ring25: L.Circle | null;
    ring50: L.Circle | null;
    ring100: L.Circle | null;
    ringLabel25: L.Marker | null;
    ringLabel50: L.Marker | null;
    ringLabel100: L.Marker | null;
    accuracyCircle: L.Circle | null;
    ownshipMarker: L.Marker | null;
  }>({
    breadcrumbCasing: null,
    breadcrumbLine: null,
    courseCasing: null,
    courseLine: null,
    offTrackCasing: null,
    offTrackLine: null,
    offTrackBadge: null,
    trackVectorCasing: null,
    trackVectorLine: null,
    bananaCasing: null,
    bananaLine: null,
    bananaBadge: null,
    glideCasing: null,
    glidePolygon: null,
    glideBadge: null,
    ring25: null,
    ring50: null,
    ring100: null,
    ringLabel25: null,
    ringLabel50: null,
    ringLabel100: null,
    accuracyCircle: null,
    ownshipMarker: null,
  });

  const [internalFullscreen, setInternalFullscreen] = useState<boolean>(false);
  const isFullscreen =
    externalIsFullscreen !== undefined ? externalIsFullscreen : internalFullscreen;

  const [followOwnship, setFollowOwnship] = useState<boolean>(true);
  const [mapOrientation, setMapOrientation] = useState<MapOrientationMode>('north-up');
  const [showNextPointBadgesOnMap, setShowNextPointBadgesOnMap] = useState<boolean>(false);
  const [showRunwayFeathers, setShowRunwayFeathers] = useState<boolean>(true);
  const [showRangeRings, setShowRangeRings] = useState<boolean>(true);
  const [showGlideRing, setShowGlideRing] = useState<boolean>(true);
  const [currentZoom, setCurrentZoom] = useState<number>(12);
  const [isLayersPopoverOpen, setIsLayersPopoverOpen] = useState<boolean>(false);
  const [isPointInspectorMode, setIsPointInspectorMode] = useState<boolean>(false);
  const [inspectedPoint, setInspectedPoint] = useState<{ lat: number; lon: number } | null>(
    null
  );

  const layersPopoverRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticPanRef = useRef<boolean>(false);
  const prevOwnshipCoordRef = useRef<[number, number] | null>(null);

  const toggleFullscreen = () => {
    const next = !isFullscreen;
    if (onToggleFullscreen) {
      onToggleFullscreen(next);
    } else {
      setInternalFullscreen(next);
    }
  };

  useEffect(() => {
    if (isFullscreen) {
      document.body.classList.add('map-fullscreen');
    } else {
      document.body.classList.remove('map-fullscreen');
    }
    return () => {
      document.body.classList.remove('map-fullscreen');
    };
  }, [isFullscreen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inspectedPoint) setInspectedPoint(null);
        if (isPointInspectorMode) setIsPointInspectorMode(false);
        if (isLayersPopoverOpen) setIsLayersPopoverOpen(false);
        if (isFullscreen) toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, inspectedPoint, isPointInspectorMode, isLayersPopoverOpen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapInstanceRef.current && isVisible) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [isFullscreen, isVisible]);

  // Default to VFR Hybrid (Terrain Relief + Street/Road/Town network)
  const [activeLayer, setActiveLayer] = useState<MapLayerType>('hybrid');

  const [internalShowAirspaces, setInternalShowAirspaces] = useState<boolean>(true);
  const showAirspaces =
    externalShowAirspaces !== undefined
      ? externalShowAirspaces
      : internalShowAirspaces;
  const setShowAirspaces = onToggleShowAirspaces || setInternalShowAirspaces;

  const [internalAirspaceFilter, setInternalAirspaceFilter] =
    useState<AirspaceFilterType>('ALL');
  const airspaceFilter =
    externalAirspaceFilter !== undefined
      ? externalAirspaceFilter
      : internalAirspaceFilter;
  const setAirspaceFilter = onAirspaceFilterChange || setInternalAirspaceFilter;

  const [internalShowSectorLabels, setInternalShowSectorLabels] =
    useState<boolean>(true);
  const showSectorLabels =
    externalShowSectorLabels !== undefined
      ? externalShowSectorLabels
      : internalShowSectorLabels;
  const setShowSectorLabels =
    onToggleSectorLabels || setInternalShowSectorLabels;

  const [internalOnlyRouteAirspaces, setInternalOnlyRouteAirspaces] =
    useState<boolean>(false);
  const onlyRouteAirspaces =
    externalOnlyRouteAirspaces !== undefined
      ? externalOnlyRouteAirspaces
      : internalOnlyRouteAirspaces;
  const setOnlyRouteAirspaces =
    onToggleOnlyRouteAirspaces || setInternalOnlyRouteAirspaces;

  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState<boolean>(false);
  const [isAirspaceDropdownOpen, setIsAirspaceDropdownOpen] =
    useState<boolean>(false);
  const airspaceDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        airspaceDropdownRef.current &&
        !airspaceDropdownRef.current.contains(e.target as Node)
      ) {
        setIsAirspaceDropdownOpen(false);
      }
      if (
        layersPopoverRef.current &&
        !layersPopoverRef.current.contains(e.target as Node)
      ) {
        setIsLayersPopoverOpen(false);
      }
    };
    if (isAirspaceDropdownOpen || isLayersPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAirspaceDropdownOpen, isLayersPopoverOpen]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const canvasRenderer = L.canvas({ padding: 0.5 });
      canvasRendererRef.current = canvasRenderer;

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
        attributionControl: true,
        preferCanvas: true,
      }).setView([ownship.latitude || 38.725, ownship.longitude || -9.355], 12);

      // Place native +/- zoom control at bottom-left so top cockpit HUD bars never block it
      L.control.zoom({ position: 'bottomleft' }).addTo(map);

      const cfg = TILE_LAYERS[activeLayer];
      const tile = new OfflineTileLayer(cfg.url, {
        layerKey: activeLayer,
        maxZoom: cfg.maxZoom,
        subdomains: cfg.subdomains || 'abc',
        attribution: cfg.attribution,
      }).addTo(map);
      tileLayerRef.current = tile;

      if (cfg.overlayHillshade) {
        const hs = new OfflineTileLayer(HILLSHADE_RELIEF_URL, {
          layerKey: 'hillshade-relief',
          maxZoom: 16,
          opacity: 0.34,
          className: 'plus-hillshade-overlay-tile',
        }).addTo(map);
        hillshadeLayerRef.current = hs;
      }

      const airspaceGroup = L.layerGroup().addTo(map);
      airspaceLayerGroupRef.current = airspaceGroup;

      const routeGroup = L.layerGroup().addTo(map);
      routeLayerGroupRef.current = routeGroup;

      const inflightGroup = L.layerGroup().addTo(map);
      inflightLayerGroupRef.current = inflightGroup;

      const calloutsGroup = L.layerGroup().addTo(map);
      dynamicCalloutsGroupRef.current = calloutsGroup;

      const inspectorGroup = L.layerGroup().addTo(map);
      inspectorLayerGroupRef.current = inspectorGroup;

      const trafficGroup = L.layerGroup().addTo(map);
      trafficLayerGroupRef.current = trafficGroup;

      const circuitGroup = L.layerGroup().addTo(map);
      circuitLayerGroupRef.current = circuitGroup;

      // Detect manual user drag so we pause auto-follow until pilot taps Re-Center
      map.on('dragstart', () => {
        if (!isProgrammaticPanRef.current) {
          setFollowOwnship(false);
        }
      });

      map.on('zoomend', () => {
        setCurrentZoom(map.getZoom());
      });

      // Right-click anywhere on map to inspect coordinate & stacked airspaces
      map.on('contextmenu', (e: L.LeafletMouseEvent) => {
        setInspectedPoint({ lat: e.latlng.lat, lon: e.latlng.lng });
      });

      mapInstanceRef.current = map;
    }

    const el = mapContainerRef.current;
    let resizeObs: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => {
        mapInstanceRef.current?.invalidateSize();
      });
      resizeObs.observe(el);
    }

    return () => {
      resizeObs?.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        hillshadeLayerRef.current = null;
        canvasRendererRef.current = null;
        routeLayerGroupRef.current = null;
        airspaceLayerGroupRef.current = null;
        inflightLayerGroupRef.current = null;
        dynamicCalloutsGroupRef.current = null;
        inspectorLayerGroupRef.current = null;
        trafficLayerGroupRef.current = null;
        circuitLayerGroupRef.current = null;
      }
    };
  }, []);

  // Switch Tile Layer (supporting Hybrid Terrain + Street Hillshade overlay)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }
    if (hillshadeLayerRef.current) {
      map.removeLayer(hillshadeLayerRef.current);
      hillshadeLayerRef.current = null;
    }

    const cfg = TILE_LAYERS[activeLayer];
    const newTile = new OfflineTileLayer(cfg.url, {
      layerKey: activeLayer,
      maxZoom: cfg.maxZoom,
      subdomains: cfg.subdomains || 'abc',
      attribution: cfg.attribution,
    }).addTo(map);
    tileLayerRef.current = newTile;

    if (cfg.overlayHillshade) {
      const hs = new OfflineTileLayer(HILLSHADE_RELIEF_URL, {
        layerKey: 'hillshade-relief',
        maxZoom: 16,
        opacity: 0.34,
        className: 'plus-hillshade-overlay-tile',
      }).addTo(map);
      hillshadeLayerRef.current = hs;
    }
  }, [activeLayer]);

  // Pan to hazard when pilot clicks "View on Map" in Look-Ahead Alert Banner
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !focusHazardRequest) return;
    setFollowOwnship(false);
    isProgrammaticPanRef.current = true;
    map.setView([focusHazardRequest.lat, focusHazardRequest.lon], Math.max(map.getZoom(), 10), {
      animate: true,
    });
    setTimeout(() => {
      isProgrammaticPanRef.current = false;
    }, 400);
  }, [focusHazardRequest]);

  // Auto-follow ownship with 70% Forward Look-Ahead Offset when Flight Mode & Follow Ownship are active
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isFlightModeActive || !followOwnship) return;
    const prev = prevOwnshipCoordRef.current;
    prevOwnshipCoordRef.current = [ownship.latitude, ownship.longitude];
    if (!prev) return;
    if (
      Math.abs(prev[0] - ownship.latitude) < 1e-6 &&
      Math.abs(prev[1] - ownship.longitude) < 1e-6
    ) {
      return;
    }
    isProgrammaticPanRef.current = true;
    const targetCenter = computeLookAheadCameraCenter(
      ownship.latitude,
      ownship.longitude,
      ownship.trueTrackDeg,
      map.getZoom()
    );
    map.panTo(targetCenter, { animate: false });
    const t = setTimeout(() => {
      isProgrammaticPanRef.current = false;
    }, 150);
    return () => clearTimeout(t);
  }, [
    isFlightModeActive,
    followOwnship,
    ownship.latitude,
    ownship.longitude,
    ownship.trueTrackDeg,
  ]);

  // Render Airspaces + Highlight Threatened Look-Ahead Sectors + Smart Zoom Declutter
  const threatenedAirspaceIds = React.useMemo(() => {
    const set = new Set<string>();
    if (isFlightModeActive) {
      for (const a of navSolution.lookAheadAlerts) {
        if (a.airspaceId) set.add(a.airspaceId);
      }
    }
    return set;
  }, [isFlightModeActive, navSolution.lookAheadAlerts]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const airspaceGroup = airspaceLayerGroupRef.current;
    if (!airspaceGroup || !map) return;

    airspaceGroup.clearLayers();

    const handleUnifiedMapClick = (latlng: L.LatLng, shiftKey: boolean) => {
      if (isFlightModeActive && (isMapClickPlacementMode || shiftKey)) {
        onMapPlaceOwnship(latlng.lat, latlng.lng);
        return true;
      }
      if (isPointInspectorMode) {
        setInspectedPoint({ lat: latlng.lat, lon: latlng.lng });
        return true;
      }
      return false;
    };

    if (!showAirspaces) {
      const handleMapClickNoAirspace = (e: L.LeafletMouseEvent) => {
        handleUnifiedMapClick(e.latlng, e.originalEvent.shiftKey);
      };
      map.on('click', handleMapClickNoAirspace);
      return () => {
        map.off('click', handleMapClickNoAirspace);
      };
    }

    const filteredAirspaces = AIRSPACES.filter((as: Airspace) => {
      if (onlyRouteAirspaces) {
        if (threatenedAirspaceIds.has(as.id)) return true;
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

    const sortedAirspaces = [...filteredAirspaces].sort((a, b) => {
      const areaA = computePolygonApproxArea(a.polygon);
      const areaB = computePolygonApproxArea(b.polygon);
      return areaB - areaA;
    });

    const openAirspaceColumnPopup = (latlng: L.LatLng) => {
      const clickedCoord: [number, number] = [latlng.lat, latlng.lng];
      const matched = filteredAirspaces.filter((as) =>
        isPointInPolygon(clickedCoord, as.polygon)
      );

      if (matched.length === 0) return;

      matched.sort(
        (a, b) => a.lowerLimitFt - b.lowerLimitFt || a.upperLimitFt - b.upperLimitFt
      );

      const refAltFt = isFlightModeActive
        ? ownship.altitudeMslFt ?? 0
        : navLog && navLog.legs[0]
        ? navLog.legs[0].altitude
        : 0;

      const sectorsHtml = matched
        .map((as, idx) => {
          const advisory = getAirspaceClearanceAdvisory(as, refAltFt);
          let vfrReqBadge =
            '<span class="sector-vfr-badge badge-vfr-free">Class G · Open VFR</span>';
          if (as.type === 'RESTRICTED' || as.type === 'PROHIBITED') {
            vfrReqBadge =
              '<span class="sector-vfr-badge badge-vfr-clearance">Restricted · Clearance Mandatory</span>';
          } else if (as.type === 'DANGER') {
            vfrReqBadge =
              '<span class="sector-vfr-badge badge-vfr-listen">Danger Area · Extreme Caution</span>';
          } else if (as.classification === 'C' || as.classification === 'D') {
            vfrReqBadge = `<span class="sector-vfr-badge badge-vfr-clearance">Class ${as.classification} · Clearance Mandatory</span>`;
          } else if (as.type === 'ATZ') {
            vfrReqBadge =
              '<span class="sector-vfr-badge badge-vfr-listen">ATZ · Radio Call Required</span>';
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
              <div class="sector-vfr-req-box">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                  <span class="sector-vfr-req-title">Entry Status:</span>
                  ${vfrReqBadge}
                </div>
              </div>
              ${
                as.frequency
                  ? `<div class="sector-freq-row" style="display: flex; align-items: center; justify-content: space-between; margin-top: 2px;">
                       <span>ATC Contact:</span>
                       <span class="sector-atc-contact-btn">${as.frequency}</span>
                     </div>`
                  : ''
              }
              <div class="sector-advisory-row">
                <span class="advisory-title">${advisory.actionTitle}:</span>
                <span class="advisory-text">${advisory.actionDetail}</span>
              </div>
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

    sortedAirspaces.forEach((as: Airspace) => {
      const isSpecial =
        as.type === 'RESTRICTED' || as.type === 'PROHIBITED' || as.type === 'DANGER';
      const isLookAheadThreat = threatenedAirspaceIds.has(as.id);

      let strokeColor = '#0ea5e9';
      let fillColor = '#0ea5e9';
      let fillOpacity = 0.12;
      let dashArray: string | undefined = undefined;

      if (as.type === 'TMA') {
        strokeColor = '#a855f7';
        fillColor = '#a855f7';
        fillOpacity = 0.1;
      } else if (as.type === 'ATZ') {
        strokeColor = '#14b8a6';
        fillColor = '#14b8a6';
        fillOpacity = 0.08;
      } else if (as.type === 'RESTRICTED' || as.type === 'PROHIBITED') {
        strokeColor = '#ef4444';
        fillColor = '#ef4444';
        fillOpacity = 0.22;
        dashArray = '5, 5';
      } else if (as.type === 'DANGER') {
        strokeColor = '#f59e0b';
        fillColor = '#f59e0b';
        fillOpacity = 0.15;
        dashArray = '4, 4';
      }

      const routeStatus =
        navLog && navLog.legs.length > 0 ? getAirspaceRouteStatus(as, navLog.legs) : null;
      const hasPenetration = routeStatus?.status === 'PENETRATING';
      let weight = isSpecial ? 2 : 1.5;

      if (isLookAheadThreat) {
        strokeColor = isSpecial ? '#ef4444' : '#f97316';
        fillColor = isSpecial ? '#ef4444' : '#f97316';
        fillOpacity = 0.34;
        weight = 3;
        dashArray = undefined;
      } else if (hasPenetration) {
        strokeColor = isSpecial ? '#ef4444' : '#f97316';
        fillColor = isSpecial ? '#ef4444' : '#f97316';
        fillOpacity = 0.26;
        weight = 2.5;
      }

      const polygon = L.polygon(as.polygon, {
        color: strokeColor,
        fillColor,
        fillOpacity,
        weight,
        dashArray,
      }).addTo(airspaceGroup);

      polygon.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (handleUnifiedMapClick(e.latlng, e.originalEvent.shiftKey)) {
          return;
        }
        openAirspaceColumnPopup(e.latlng);
      });

      // Smart Zoom Declutter: show airspace badges when zoomed in (>= 9) or if threatened
      const shouldShowBadge =
        showSectorLabels &&
        as.polygon.length >= 3 &&
        (currentZoom >= 9 || isLookAheadThreat || hasPenetration);

      if (shouldShowBadge) {
        const center = getPolygonCentroid(as.polygon);
        const threatBadge = isLookAheadThreat ? ' · 🚨 AHEAD' : '';
        const labelIcon = L.divIcon({
          className: 'airspace-map-label-wrapper',
          html: `<div class="airspace-center-badge plus-counter-rotatable badge-${as.type.toLowerCase()}">
                   <span class="badge-id">${as.id.replace('_', ' ')}${threatBadge}</span>
                   <span class="badge-limits">${as.lowerLimitLabel}/${as.upperLimitLabel}</span>
                 </div>`,
          iconSize: [80, 24],
          iconAnchor: [40, 12],
        });

        L.marker(center, { icon: labelIcon, interactive: false }).addTo(airspaceGroup);
      }
    });

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (handleUnifiedMapClick(e.latlng, e.originalEvent.shiftKey)) {
        return;
      }
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
    isFlightModeActive,
    isMapClickPlacementMode,
    isPointInspectorMode,
    onMapPlaceOwnship,
    threatenedAirspaceIds,
    ownship.altitudeMslFt,
    currentZoom,
  ]);

  // Render Planned Route Polylines, Draggable Rubber-Band Leg Handles, & Runway 3 NM Approach Feathers
  const hasFitInitialRouteRef = useRef<string>('');

  useEffect(() => {
    const map = mapInstanceRef.current;
    const routeGroup = routeLayerGroupRef.current;
    if (!map || !routeGroup) return;

    routeGroup.clearLayers();
    if (!waypoints || waypoints.length === 0) return;

    const latLngs = waypoints.map((w) => L.latLng(w.latitude, w.longitude));

    // 0. Plot Extended Runway Centerlines & 3 NM Final Approach Feathers for Route + Alternate Airports
    if (showRunwayFeathers && currentZoom >= 10) {
      const airportWpts: Waypoint[] = waypoints.filter((w) => w.type === 'airport');
      if (
        alternateAirport &&
        !airportWpts.some((w) => w.identifier === alternateAirport.identifier)
      ) {
        airportWpts.push(alternateAirport);
      }

      airportWpts.forEach((ap) => {
        const rwyInfo = findAirportRunways(ap.identifier);
        if (!rwyInfo || !rwyInfo.runways || rwyInfo.runways.length === 0) return;
        const magVar = magneticDeclination(ap.latitude, ap.longitude, ap.elevation ?? 0);
        const processedPairs = new Set<string>();

        rwyInfo.runways.forEach((rwy) => {
          // Convert magnetic runway heading to true bearing
          const rwyTrueDeg = (rwy.heading + magVar + 360) % 360;
          // Inbound final approach track is rwyTrueDeg; extended centerline extends 3.0 NM outbound along reciprocal
          const reciprocalTrueDeg = (rwyTrueDeg + 180) % 360;
          const halfLenNm = ((rwy.lengthMeters ?? 1200) / 1852) * 0.5;
          const thresholdCoord = projectTuple(
            ap.latitude,
            ap.longitude,
            reciprocalTrueDeg,
            halfLenNm
          );
          const featherEndCoord = projectTuple(
            thresholdCoord[0],
            thresholdCoord[1],
            reciprocalTrueDeg,
            3.0
          );

          // Draw physical runway strip once per reciprocal pair
          const pairKey = [rwy.designator, rwy.reciprocalDesignator || ''].sort().join('-');
          if (!processedPairs.has(pairKey)) {
            processedPairs.add(pairKey);
            const oppThreshold = projectTuple(
              ap.latitude,
              ap.longitude,
              rwyTrueDeg,
              halfLenNm
            );
            L.polyline([thresholdCoord, oppThreshold], {
              color: '#0f172a',
              weight: 7,
              opacity: 0.95,
              interactive: false,
            }).addTo(routeGroup);
            L.polyline([thresholdCoord, oppThreshold], {
              color: '#f8fafc',
              weight: 3,
              opacity: 0.95,
              interactive: false,
            }).addTo(routeGroup);
          }

          // Extended 3 NM approach centerline with dark casing
          L.polyline([thresholdCoord, featherEndCoord], {
            color: '#060a12',
            weight: 4.2,
            opacity: 0.72,
            interactive: false,
          }).addTo(routeGroup);

          L.polyline([thresholdCoord, featherEndCoord], {
            color: '#38bdf8',
            weight: 2,
            opacity: 0.92,
            dashArray: '5, 5',
            interactive: false,
          }).addTo(routeGroup);

          // Approach Feather V-Chevron at 2.75 NM from threshold pointing inbound toward runway
          const chevronTip = projectTuple(
            thresholdCoord[0],
            thresholdCoord[1],
            reciprocalTrueDeg,
            2.45
          );
          const chevronLeft = projectTuple(
            chevronTip[0],
            chevronTip[1],
            (reciprocalTrueDeg - 22 + 360) % 360,
            0.42
          );
          const chevronRight = projectTuple(
            chevronTip[0],
            chevronTip[1],
            (reciprocalTrueDeg + 22) % 360,
            0.42
          );
          L.polyline([chevronLeft, chevronTip, chevronRight], {
            color: '#38bdf8',
            weight: 2.2,
            opacity: 0.92,
            interactive: false,
          }).addTo(routeGroup);

          // Runway Designator Pill at 3.2 NM out
          if (currentZoom >= 11) {
            const labelCoord = projectTuple(
              thresholdCoord[0],
              thresholdCoord[1],
              reciprocalTrueDeg,
              3.22
            );
            const rwyIcon = L.divIcon({
              className: 'plus-rwy-feather-label',
              html: `<div class="plus-rwy-threshold-pill plus-counter-rotatable" title="${ap.identifier} RWY ${rwy.designator} (${rwy.heading.toString().padStart(3, '0')}°M · 3 NM Final)">RWY ${rwy.designator}</div>`,
              iconSize: undefined,
              iconAnchor: [22, 10],
            });
            L.marker(labelCoord, { icon: rwyIcon, interactive: false }).addTo(routeGroup);
          }
        });
      });
    }

    // 1. Plot Waypoint Markers with Direct-To button
    waypoints.forEach((wp, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === waypoints.length - 1;
      const icon = createWaypointIcon(wp, isFirst, isLast);

      const marker = L.marker([wp.latitude, wp.longitude], { icon }).addTo(routeGroup);

      const popupEl = document.createElement('div');
      popupEl.className = 'map-popup';
      popupEl.innerHTML = `
        <strong>${wp.identifier}</strong> — ${wp.name || wp.type.toUpperCase()}<br/>
        <span>${wp.latitude.toFixed(4)}°, ${wp.longitude.toFixed(4)}°</span>
        ${wp.elevation !== undefined && wp.elevation !== null ? `<br/><span>Elev: ${wp.elevation} ft MSL</span>` : ''}
        <div style="margin-top: 8px;">
          <button type="button" class="plus-popup-dct-btn" style="background: #d946ef; color: #fff; border: none; border-radius: 4px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; width: 100%;">
            ⚡ Direct-To (${wp.identifier})
          </button>
        </div>
      `;
      const dctBtn = popupEl.querySelector('.plus-popup-dct-btn');
      if (dctBtn) {
        dctBtn.addEventListener('click', () => {
          onActivateDirectTo(wp, idx);
          marker.closePopup();
        });
      }

      marker.bindPopup(popupEl);
    });

    // 2. Plot Route Legs + Tactile "Rubber-Band" Midpoint Handles (⊕)
    if (navLog && navLog.legs.length > 0) {
      navLog.legs.forEach((leg, idx) => {
        const isActive = activeLegIndex === idx;
        const fromCoord: [number, number] = [leg.from.latitude, leg.from.longitude];
        const toCoord: [number, number] = [leg.to.latitude, leg.to.longitude];

        // Dark outer casing for daylight terrain/street contrast
        L.polyline([fromCoord, toCoord], {
          color: '#060a12',
          weight: isActive ? 8.5 : 6.5,
          opacity: isActive ? 0.82 : 0.65,
          interactive: false,
        }).addTo(routeGroup);

        const polyline = L.polyline([fromCoord, toCoord], {
          color: isActive ? '#38bdf8' : '#0284c7',
          weight: isActive ? 5 : 3.5,
          opacity: isActive ? 0.98 : 0.85,
          dashArray: isActive ? undefined : '6, 6',
        }).addTo(routeGroup);

        polyline.on('click', () => onSelectLeg(idx));

        const midLat = (leg.from.latitude + leg.to.latitude) / 2;
        const midLon = (leg.from.longitude + leg.to.longitude) / 2;

        // Draggable Rubber-Band Leg Handle (⊕)
        if (onInsertWaypointInLeg) {
          const rbIcon = L.divIcon({
            className: 'plus-rubberband-marker-wrap',
            html: `<div class="plus-rubberband-handle plus-counter-rotatable" title="Drag ⊕ to rubber-band this leg to an airport, VRP, or custom GPS point">⊕</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });

          const rbMarker = L.marker([midLat, midLon], {
            icon: rbIcon,
            draggable: true,
            zIndexOffset: 900,
          }).addTo(routeGroup);

          rbMarker.bindTooltip('Drag to reroute leg', { direction: 'top', offset: [0, -10] });

          let previewLine: L.Polyline | null = null;
          rbMarker.on('dragstart', () => {
            previewLine = L.polyline([fromCoord, [midLat, midLon], toCoord], {
              color: '#e879f9',
              weight: 3.5,
              dashArray: '6, 5',
              opacity: 0.95,
              interactive: false,
            }).addTo(routeGroup);
          });

          rbMarker.on('drag', (ev) => {
            const pos = (ev.target as L.Marker).getLatLng();
            previewLine?.setLatLngs([fromCoord, [pos.lat, pos.lng], toCoord]);
            const dFrom = greatCircleDistance(leg.from.latitude, leg.from.longitude, pos.lat, pos.lng);
            const brg = Math.round(initialBearing(leg.from.latitude, leg.from.longitude, pos.lat, pos.lng));
            rbMarker.setTooltipContent(`Reroute: ${brg}° / ${dFrom.toFixed(1)} NM`);
          });

          rbMarker.on('dragend', (ev) => {
            const pos = (ev.target as L.Marker).getLatLng();
            if (previewLine) {
              routeGroup.removeLayer(previewLine);
              previewLine = null;
            }
            onInsertWaypointInLeg(idx, pos.lat, pos.lng);
          });
        }

        if (leg.wind && leg.wind.speed > 0) {
          const windLat = leg.from.latitude * 0.65 + leg.to.latitude * 0.35;
          const windLon = leg.from.longitude * 0.65 + leg.to.longitude * 0.35;
          const windMarker = L.marker([windLat, windLon], {
            icon: createWindIcon(leg.wind.direction, leg.wind.speed),
          }).addTo(routeGroup);
          windMarker.on('click', () => onSelectLeg(idx));
        }
      });
    } else if (latLngs.length > 1) {
      L.polyline(latLngs, {
        color: '#060a12',
        weight: 6,
        opacity: 0.75,
        interactive: false,
      }).addTo(routeGroup);
      L.polyline(latLngs, {
        color: '#38bdf8',
        weight: 3.5,
        dashArray: '5, 5',
      }).addTo(routeGroup);
    }

    // 3. Plot TOC & TOD Markers
    if (navLog?.climbDescent?.tocCoordinate) {
      const tocCoord = navLog.climbDescent.tocCoordinate;
      L.marker([tocCoord.latitude, tocCoord.longitude], {
        icon: createClimbMarkerIcon(
          'TOC',
          navLog.climbDescent.tocDistanceNm,
          navLog.climbDescent.tocAltitudeFt
        ),
      }).addTo(routeGroup);
    }

    if (navLog?.climbDescent?.todCoordinate) {
      const todCoord = navLog.climbDescent.todCoordinate;
      const distFromDest = navLog.totalDistance - navLog.climbDescent.todDistanceNm;
      L.marker([todCoord.latitude, todCoord.longitude], {
        icon: createClimbMarkerIcon(
          'TOD',
          distFromDest,
          navLog.climbDescent.todAltitudeFt
        ),
      }).addTo(routeGroup);
    }

    // 4. Plot Alternate Aerodrome
    if (alternateAirport) {
      const altIcon = createAlternateMarkerIcon(alternateAirport);
      const altMarker = L.marker(
        [alternateAirport.latitude, alternateAirport.longitude],
        { icon: altIcon }
      ).addTo(routeGroup);

      const altPopup = document.createElement('div');
      altPopup.className = 'map-popup';
      altPopup.innerHTML = `
        <strong style="color: #f59e0b;">✈ ALTERNATE: ${alternateAirport.identifier}</strong><br/>
        <span>${alternateAirport.name}</span>
        <div style="margin-top: 8px;">
          <button type="button" class="plus-popup-dct-alt-btn" style="background: #f59e0b; color: #090d16; border: none; border-radius: 4px; padding: 4px 10px; font-size: 11px; font-weight: 800; cursor: pointer; width: 100%;">
            ⚡ Divert Direct-To ${alternateAirport.identifier}
          </button>
        </div>
      `;
      altPopup
        .querySelector('.plus-popup-dct-alt-btn')
        ?.addEventListener('click', () => {
          onActivateDirectTo(alternateAirport, null);
          altMarker.closePopup();
        });
      altMarker.bindPopup(altPopup);

      if (waypoints.length > 0) {
        const dest = waypoints[waypoints.length - 1];
        L.polyline(
          [
            [dest.latitude, dest.longitude],
            [alternateAirport.latitude, alternateAirport.longitude],
          ],
          {
            color: '#f59e0b',
            weight: 3,
            opacity: 0.85,
            dashArray: '6, 6',
          }
        ).addTo(routeGroup);
      }
    }

    // Frame map when route signature changes:
    // In Flight Mode, start zoomed-in close on the aircraft / departure fix (Zoom 12)
    const routeSignature = waypoints.map((w) => w.identifier).join('-');
    if (routeSignature && routeSignature !== hasFitInitialRouteRef.current) {
      hasFitInitialRouteRef.current = routeSignature;
      isProgrammaticPanRef.current = true;
      map.invalidateSize();

      if (isFlightModeActive) {
        const focusLat = waypoints[0]?.latitude ?? ownship.latitude;
        const focusLon = waypoints[0]?.longitude ?? ownship.longitude;
        setFollowOwnship(true);
        const camCenter = computeLookAheadCameraCenter(
          focusLat,
          focusLon,
          ownship.trueTrackDeg,
          12
        );
        map.setView(camCenter, 12, { animate: false });
      } else {
        const allPlotPoints = [...latLngs];
        if (alternateAirport) {
          allPlotPoints.push(
            L.latLng(alternateAirport.latitude, alternateAirport.longitude)
          );
        }
        if (allPlotPoints.length === 1) {
          map.setView(allPlotPoints[0], 11, { animate: false });
        } else if (allPlotPoints.length > 1) {
          map.fitBounds(L.latLngBounds(allPlotPoints), {
            paddingTopLeft: [60, 80],
            paddingBottomRight: [370, 80],
            maxZoom: 11,
            animate: false,
          });
        }
      }

      setTimeout(() => {
        isProgrammaticPanRef.current = false;
      }, 250);
    }
  }, [
    waypoints,
    navLog,
    activeLegIndex,
    onSelectLeg,
    alternateAirport,
    onActivateDirectTo,
    onInsertWaypointInLeg,
    isFlightModeActive,
    showRunwayFeathers,
    currentZoom,
  ]);

  // ─── Render Radial Point & Airspace Column Inspector Overlay ───
  useEffect(() => {
    const inspectorGroup = inspectorLayerGroupRef.current;
    if (!inspectorGroup) return;
    inspectorGroup.clearLayers();
    if (!inspectedPoint) return;

    const ownCoord: [number, number] = [ownship.latitude, ownship.longitude];
    const tgtCoord: [number, number] = [inspectedPoint.lat, inspectedPoint.lon];

    L.polyline([ownCoord, tgtCoord], {
      color: '#060a12',
      weight: 5,
      opacity: 0.85,
      interactive: false,
    }).addTo(inspectorGroup);

    L.polyline([ownCoord, tgtCoord], {
      color: '#fde047',
      weight: 2.5,
      dashArray: '6, 5',
      opacity: 0.98,
      interactive: false,
    }).addTo(inspectorGroup);

    const reticleIcon = L.divIcon({
      className: 'plus-inspector-reticle',
      html: `<div class="plus-reticle-pin plus-counter-rotatable">🎯</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    L.marker(tgtCoord, { icon: reticleIcon, interactive: false }).addTo(inspectorGroup);
  }, [inspectedPoint, ownship.latitude, ownship.longitude]);

  // ─── Render Real-Time ADS-B / FLARM Traffic Targets ───
  useEffect(() => {
    const group = trafficLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (!isFlightModeActive || !trafficTargets || trafficTargets.length === 0) {
      return;
    }

    trafficTargets.forEach((t) => {
      const icon = createTrafficMarkerIcon(t);
      const marker = L.marker([t.latitude, t.longitude], {
        icon,
        zIndexOffset: t.isThreat ? 1000 : 700,
      });

      const relSign = t.relativeAltFt !== null ? (t.relativeAltFt >= 0 ? '+' : '') : '';
      const popupHtml = `
        <div class="traffic-popup-card">
          <div class="traffic-popup-head ${t.isThreat ? 'is-threat' : ''}">
            <strong>✈️ ${t.callsign}</strong>
            <span class="traffic-popup-icao">${t.icaoAddress}</span>
          </div>
          <div class="traffic-popup-grid">
            <div class="t-cell"><small>DIST</small><strong>${t.distanceNm.toFixed(1)} NM</strong></div>
            <div class="t-cell"><small>BRG</small><strong>${t.bearingDeg}°</strong></div>
            <div class="t-cell"><small>ALT</small><strong>${t.altitudeFt !== null ? t.altitudeFt.toLocaleString() + ' FT' : '---'}</strong></div>
            <div class="t-cell"><small>REL</small><strong>${t.relativeAltFt !== null ? `${relSign}${t.relativeAltFt} FT` : '---'}</strong></div>
            <div class="t-cell"><small>GS</small><strong>${t.groundSpeedKt} KT</strong></div>
            <div class="t-cell"><small>TRK</small><strong>${t.trackDeg}°</strong></div>
            ${t.timeToCpaSec !== undefined ? `<div class="t-cell"><small>CPA</small><strong>${t.timeToCpaSec}s</strong></div>` : ''}
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { className: 'plus-traffic-popup-wrapper' });
      marker.addTo(group);
    });
  }, [trafficTargets, isFlightModeActive]);

  // ─── Render Visual Traffic Circuit / Pattern Overlay ───
  useEffect(() => {
    const group = circuitLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (!activeCircuitPattern) return;

    const {
      airportIcao,
      runwayDesignator,
      patternDirection,
      patternAltMslFt,
      patternAltAglFt,
      circuitCoordinates,
      downwindMidpoint,
      entryVectorCoordinates,
    } = activeCircuitPattern;

    // 1. Dark high-contrast casing polyline for circuit
    L.polyline(circuitCoordinates, {
      color: '#020617',
      weight: 6,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(group);

    // 2. Sky-blue dashed active circuit polyline
    L.polyline(circuitCoordinates, {
      color: '#38bdf8',
      weight: 3.5,
      dashArray: '8, 6',
      opacity: 1.0,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(group);

    // 3. 45° Downwind Entry Vector (casing + green dashed line)
    if (entryVectorCoordinates && entryVectorCoordinates.length === 2) {
      L.polyline(entryVectorCoordinates, {
        color: '#020617',
        weight: 6,
        opacity: 0.9,
      }).addTo(group);

      L.polyline(entryVectorCoordinates, {
        color: '#4ade80',
        weight: 3,
        dashArray: '5, 4',
        opacity: 1.0,
      }).addTo(group);

      const entryStart = entryVectorCoordinates[0];
      const entryBadgeIcon = L.divIcon({
        className: 'plus-circuit-entry-badge-wrap',
        html: `<div class="plus-circuit-entry-badge">45° ENTRY</div>`,
        iconSize: [84, 22],
        iconAnchor: [42, 11],
      });
      L.marker(entryStart, { icon: entryBadgeIcon, interactive: false }).addTo(group);
    }

    // 4. Downwind Midfield Altitude Badge
    const badgeHtml = `
      <div class="plus-circuit-badge">
        <div class="circuit-badge-head">${airportIcao ? airportIcao + ' ' : ''}RWY ${runwayDesignator} (${patternDirection} PATTERN)</div>
        <div class="circuit-badge-alt"><strong>${patternAltMslFt.toLocaleString()} FT</strong> <small>(${patternAltAglFt} FT AGL)</small></div>
      </div>
    `;
    const altBadgeIcon = L.divIcon({
      className: 'plus-circuit-badge-wrap',
      html: badgeHtml,
      iconSize: [180, 46],
      iconAnchor: [90, 23],
    });
    L.marker(downwindMidpoint, { icon: altBadgeIcon, interactive: false }).addTo(group);
  }, [activeCircuitPattern]);

  // ─── Render Real-Time In-Flight Layer via Persistent L.canvas() & In-Place Marker Mutation ───
  useEffect(() => {
    const map = mapInstanceRef.current;
    const inflightGroup = inflightLayerGroupRef.current;
    const calloutsGroup = dynamicCalloutsGroupRef.current;
    const renderer = canvasRendererRef.current ?? undefined;
    if (!map || !inflightGroup || !calloutsGroup) return;

    const p = persistentInflightRef.current;

    if (!isFlightModeActive) {
      inflightGroup.clearLayers();
      calloutsGroup.clearLayers();
      p.breadcrumbCasing = null;
      p.breadcrumbLine = null;
      p.courseCasing = null;
      p.courseLine = null;
      p.offTrackCasing = null;
      p.offTrackLine = null;
      p.offTrackBadge = null;
      p.trackVectorCasing = null;
      p.trackVectorLine = null;
      p.bananaCasing = null;
      p.bananaLine = null;
      p.bananaBadge = null;
      p.glideCasing = null;
      p.glidePolygon = null;
      p.glideBadge = null;
      p.ring25 = null;
      p.ring50 = null;
      p.ring100 = null;
      p.ringLabel25 = null;
      p.ringLabel50 = null;
      p.ringLabel100 = null;
      p.accuracyCircle = null;
      p.ownshipMarker = null;
      return;
    }

    const ownCoord: [number, number] = [ownship.latitude, ownship.longitude];

    // 0A. Concentric Distance Rings around Ownship (2.5 NM / 5.0 NM / 10.0 NM)
    if (showRangeRings) {
      const r25m = 2.5 * 1852;
      const r50m = 5.0 * 1852;
      const r100m = 10.0 * 1852;

      if (!p.ring25 || !p.ring50 || !p.ring100) {
        p.ring25 = L.circle(ownCoord, {
          renderer,
          radius: r25m,
          color: 'rgba(148, 163, 184, 0.55)',
          weight: 1.2,
          dashArray: '4, 6',
          fill: false,
          interactive: false,
        }).addTo(inflightGroup);
        p.ring50 = L.circle(ownCoord, {
          renderer,
          radius: r50m,
          color: 'rgba(148, 163, 184, 0.55)',
          weight: 1.2,
          dashArray: '4, 6',
          fill: false,
          interactive: false,
        }).addTo(inflightGroup);
        p.ring100 = L.circle(ownCoord, {
          renderer,
          radius: r100m,
          color: 'rgba(148, 163, 184, 0.45)',
          weight: 1.2,
          dashArray: '4, 6',
          fill: false,
          interactive: false,
        }).addTo(inflightGroup);
      } else {
        p.ring25.setLatLng(ownCoord);
        p.ring50.setLatLng(ownCoord);
        p.ring100.setLatLng(ownCoord);
      }

      const ringBrg = mapOrientation === 'track-up' ? ownship.trueTrackDeg : 0;
      const pos25 = projectTuple(ownCoord[0], ownCoord[1], ringBrg, 2.5);
      const pos50 = projectTuple(ownCoord[0], ownCoord[1], ringBrg, 5.0);
      const pos100 = projectTuple(ownCoord[0], ownCoord[1], ringBrg, 10.0);

      const makeRingLabel = (txt: string) =>
        L.divIcon({
          className: 'plus-range-ring-label',
          html: `<span class="plus-ring-tag plus-counter-rotatable">${txt}</span>`,
          iconSize: undefined,
          iconAnchor: [18, 8],
        });

      if (!p.ringLabel25) {
        p.ringLabel25 = L.marker(pos25, {
          icon: makeRingLabel('2.5 NM'),
          interactive: false,
        }).addTo(inflightGroup);
        p.ringLabel50 = L.marker(pos50, {
          icon: makeRingLabel('5 NM'),
          interactive: false,
        }).addTo(inflightGroup);
        p.ringLabel100 = L.marker(pos100, {
          icon: makeRingLabel('10 NM'),
          interactive: false,
        }).addTo(inflightGroup);
      } else {
        p.ringLabel25.setLatLng(pos25);
        p.ringLabel50?.setLatLng(pos50);
        p.ringLabel100?.setLatLng(pos100);
      }
    } else {
      if (p.ring25) {
        inflightGroup.removeLayer(p.ring25);
        p.ring25 = null;
      }
      if (p.ring50) {
        inflightGroup.removeLayer(p.ring50);
        p.ring50 = null;
      }
      if (p.ring100) {
        inflightGroup.removeLayer(p.ring100);
        p.ring100 = null;
      }
      if (p.ringLabel25) {
        inflightGroup.removeLayer(p.ringLabel25);
        p.ringLabel25 = null;
      }
      if (p.ringLabel50) {
        inflightGroup.removeLayer(p.ringLabel50);
        p.ringLabel50 = null;
      }
      if (p.ringLabel100) {
        inflightGroup.removeLayer(p.ringLabel100);
        p.ringLabel100 = null;
      }
    }

    // 0B. Wind- & Terrain-Adjusted Best-Glide Advisor Ring
    if (showGlideRing && navSolution.glideRangePolygon.length > 3) {
      const poly = navSolution.glideRangePolygon;
      if (!p.glideCasing || !p.glidePolygon) {
        p.glideCasing = L.polygon(poly, {
          renderer,
          color: '#060a12',
          weight: 4.5,
          opacity: 0.72,
          fill: false,
          interactive: false,
        }).addTo(inflightGroup);
        p.glidePolygon = L.polygon(poly, {
          renderer,
          color: '#fde047',
          weight: 2.2,
          dashArray: '7, 5',
          fillColor: '#fde047',
          fillOpacity: 0.05,
          interactive: false,
        }).addTo(inflightGroup);
      } else {
        p.glideCasing.setLatLngs(poly);
        p.glidePolygon.setLatLngs(poly);
      }

      const labelPt = poly[0];
      const glideIcon = L.divIcon({
        className: 'plus-glide-ring-label',
        html: `<div class="plus-glide-pill plus-counter-rotatable" title="Wind- & AGL-adjusted Best Glide Range">🪂 GLIDE ${navSolution.avgGlideDistanceNm.toFixed(1)} NM</div>`,
        iconSize: undefined,
        iconAnchor: [44, 10],
      });
      if (!p.glideBadge) {
        p.glideBadge = L.marker(labelPt, {
          icon: glideIcon,
          interactive: false,
        }).addTo(inflightGroup);
      } else {
        p.glideBadge.setLatLng(labelPt);
        p.glideBadge.setIcon(glideIcon);
      }
    } else {
      if (p.glideCasing) {
        inflightGroup.removeLayer(p.glideCasing);
        p.glideCasing = null;
      }
      if (p.glidePolygon) {
        inflightGroup.removeLayer(p.glidePolygon);
        p.glidePolygon = null;
      }
      if (p.glideBadge) {
        inflightGroup.removeLayer(p.glideBadge);
        p.glideBadge = null;
      }
    }

    // 1. Breadcrumbs Flight Trail (Persistent Canvas Polyline)
    if (breadcrumbs.length > 1) {
      const crumbLatLngs: [number, number][] = breadcrumbs.map((b) => [
        b.latitude,
        b.longitude,
      ]);
      if (!p.breadcrumbCasing || !p.breadcrumbLine) {
        p.breadcrumbCasing = L.polyline(crumbLatLngs, {
          renderer,
          color: '#060a12',
          weight: 6,
          opacity: 0.7,
          interactive: false,
        }).addTo(inflightGroup);
        p.breadcrumbLine = L.polyline(crumbLatLngs, {
          renderer,
          color: '#e879f9',
          weight: 3.5,
          opacity: 0.92,
          interactive: false,
        }).addTo(inflightGroup);
      } else {
        p.breadcrumbCasing.setLatLngs(crumbLatLngs);
        p.breadcrumbLine.setLatLngs(crumbLatLngs);
      }
    } else if (p.breadcrumbLine) {
      p.breadcrumbCasing?.setLatLngs([]);
      p.breadcrumbLine.setLatLngs([]);
    }

    // 2. Direct Course Vector from Ownship (PPOS) to Active Next Waypoint
    if (navSolution.nextPoints.length > 0) {
      const activeNext = navSolution.nextPoints[0];
      const nextCoord: [number, number] = [
        activeNext.waypoint.latitude,
        activeNext.waypoint.longitude,
      ];
      const courseColor = directToState ? '#d946ef' : '#10b981';
      const courseWeight = directToState ? 4.5 : 3.8;
      const courseDash = directToState ? '8, 6' : '5, 6';

      if (!p.courseCasing || !p.courseLine) {
        p.courseCasing = L.polyline([ownCoord, nextCoord], {
          renderer,
          color: '#060a12',
          weight: courseWeight + 3,
          opacity: 0.78,
          interactive: false,
        }).addTo(inflightGroup);
        p.courseLine = L.polyline([ownCoord, nextCoord], {
          renderer,
          color: courseColor,
          weight: courseWeight,
          opacity: 0.98,
          dashArray: courseDash,
          interactive: false,
        }).addTo(inflightGroup);
      } else {
        p.courseCasing.setLatLngs([ownCoord, nextCoord]);
        p.courseLine.setLatLngs([ownCoord, nextCoord]);
        p.courseLine.setStyle({
          color: courseColor,
          weight: courseWeight,
          dashArray: courseDash,
        });
      }
    } else if (p.courseLine) {
      p.courseCasing?.setLatLngs([]);
      p.courseLine.setLatLngs([]);
    }

    // 2B. Off-Track Perpendicular Deviation Line & Intercept Callout Pill (|XTE| >= 0.25 NM)
    const absXte = Math.abs(navSolution.crossTrackErrorNm);
    const activeNextWp = navSolution.nextPoints[0];
    if (
      !directToState &&
      absXte >= 0.25 &&
      navSolution.closestPointOnCourse &&
      activeNextWp
    ) {
      const closestPt = navSolution.closestPointOnCourse;
      const xteColor = absXte > 1.5 ? '#ef4444' : '#f59e0b';
      const sideChar = navSolution.crossTrackErrorNm > 0 ? 'R' : 'L';
      const intHdgStr =
        navSolution.interceptHeadingMagDeg !== null
          ? ` · INT ${Math.round(navSolution.interceptHeadingMagDeg)
              .toString()
              .padStart(3, '0')}°M`
          : '';

      if (!p.offTrackCasing || !p.offTrackLine) {
        p.offTrackCasing = L.polyline([ownCoord, closestPt], {
          renderer,
          color: '#060a12',
          weight: 5.5,
          opacity: 0.8,
          interactive: false,
        }).addTo(inflightGroup);
        p.offTrackLine = L.polyline([ownCoord, closestPt], {
          renderer,
          color: xteColor,
          weight: 3,
          opacity: 0.96,
          dashArray: '4, 5',
          interactive: false,
        }).addTo(inflightGroup);
      } else {
        p.offTrackCasing.setLatLngs([ownCoord, closestPt]);
        p.offTrackLine.setLatLngs([ownCoord, closestPt]);
        p.offTrackLine.setStyle({ color: xteColor });
      }

      const midLat = (ownCoord[0] + closestPt[0]) / 2;
      const midLon = (ownCoord[1] + closestPt[1]) / 2;
      const offTrackIcon = L.divIcon({
        className: 'plus-offtrack-map-badge',
        html: `
          <div class="plus-offtrack-pill plus-counter-rotatable ${absXte > 1.5 ? 'is-critical' : 'is-warn'}" title="Click to re-center course Direct-To ${activeNextWp.waypoint.identifier}">
            <span class="offtrack-pill-title">OFF TRACK ${absXte.toFixed(1)} NM ${sideChar}${intHdgStr}</span>
            <span class="offtrack-pill-dct">⚡ DCT ${activeNextWp.waypoint.identifier}</span>
          </div>
        `,
        iconSize: undefined,
        iconAnchor: [70, 14],
      });

      if (!p.offTrackBadge) {
        p.offTrackBadge = L.marker([midLat, midLon], {
          icon: offTrackIcon,
          zIndexOffset: 1500,
        }).addTo(inflightGroup);
      } else {
        p.offTrackBadge.setLatLng([midLat, midLon]);
        p.offTrackBadge.setIcon(offTrackIcon);
      }
      p.offTrackBadge.off('click');
      p.offTrackBadge.on('click', () => {
        onActivateDirectTo(activeNextWp.waypoint, activeNextWp.waypointIndex);
      });
    } else {
      p.offTrackCasing?.setLatLngs([]);
      p.offTrackLine?.setLatLngs([]);
      if (p.offTrackBadge) {
        inflightGroup.removeLayer(p.offTrackBadge);
        p.offTrackBadge = null;
      }
    }

    // 3. Projected Track Vector Line (Persistent Canvas Polyline with dark contrast casing)
    if (navSolution.trackVectorPoints.length > 0) {
      const tvCoords: [number, number][] = [ownCoord, navSolution.trackVectorEndCoord];
      if (!p.trackVectorCasing || !p.trackVectorLine) {
        p.trackVectorCasing = L.polyline(tvCoords, {
          renderer,
          color: '#060a12',
          weight: 6,
          opacity: 0.8,
          interactive: false,
        }).addTo(inflightGroup);
        p.trackVectorLine = L.polyline(tvCoords, {
          renderer,
          color: '#22d3ee',
          weight: 3.2,
          opacity: 0.98,
          interactive: false,
        }).addTo(inflightGroup);
      } else {
        p.trackVectorCasing.setLatLngs(tvCoords);
        p.trackVectorLine.setLatLngs(tvCoords);
      }
    } else if (p.trackVectorLine) {
      p.trackVectorCasing?.setLatLngs([]);
      p.trackVectorLine.setLatLngs([]);
    }

    // 4. ForeFlight "Green Banana" Altitude Range Capture Arc (Persistent Canvas Polyline)
    if (navSolution.altitudeCaptureArc) {
      const arc = navSolution.altitudeCaptureArc;
      if (!p.bananaCasing || !p.bananaLine) {
        p.bananaCasing = L.polyline(arc.arcCoords, {
          renderer,
          color: '#060a12',
          weight: 7.5,
          opacity: 0.82,
          interactive: false,
        }).addTo(inflightGroup);
        p.bananaLine = L.polyline(arc.arcCoords, {
          renderer,
          color: '#4ade80',
          weight: 4.5,
          opacity: 0.98,
          interactive: false,
        }).addTo(inflightGroup);
      } else {
        p.bananaCasing.setLatLngs(arc.arcCoords);
        p.bananaLine.setLatLngs(arc.arcCoords);
      }

      const bananaBadgeIcon = L.divIcon({
        className: 'plus-green-banana-label',
        html: `
          <div class="plus-banana-pill plus-counter-rotatable">
            🟢 ${arc.targetAltitudeFt.toLocaleString()} FT (${arc.distanceAheadNm.toFixed(1)} NM)
          </div>
        `,
        iconSize: undefined,
        iconAnchor: [55, -6],
      });
      if (!p.bananaBadge) {
        p.bananaBadge = L.marker([arc.centerLat, arc.centerLon], {
          icon: bananaBadgeIcon,
          interactive: false,
        }).addTo(inflightGroup);
      } else {
        p.bananaBadge.setLatLng([arc.centerLat, arc.centerLon]);
        p.bananaBadge.setIcon(bananaBadgeIcon);
      }
    } else {
      p.bananaCasing?.setLatLngs([]);
      p.bananaLine?.setLatLngs([]);
      if (p.bananaBadge) {
        inflightGroup.removeLayer(p.bananaBadge);
        p.bananaBadge = null;
      }
    }

    // 5. GPS Horizontal Accuracy Halo Circle (Persistent)
    if (ownship.horizontalAccuracyM > 8) {
      const haloColor =
        ownship.gpsQuality === 'HIGH'
          ? '#38bdf8'
          : ownship.gpsQuality === 'MARGINAL'
          ? '#f59e0b'
          : '#ef4444';
      if (!p.accuracyCircle) {
        p.accuracyCircle = L.circle(ownCoord, {
          renderer,
          radius: ownship.horizontalAccuracyM,
          color: haloColor,
          weight: 1.5,
          fillColor: haloColor,
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(inflightGroup);
      } else {
        p.accuracyCircle.setLatLng(ownCoord);
        p.accuracyCircle.setRadius(ownship.horizontalAccuracyM);
        p.accuracyCircle.setStyle({ color: haloColor, fillColor: haloColor });
      }
    } else if (p.accuracyCircle) {
      inflightGroup.removeLayer(p.accuracyCircle);
      p.accuracyCircle = null;
    }

    // 6. Ownship Aircraft Marker (Persistent Marker updated in-place via setLatLng & setIcon)
    const ownshipPopupHtml = `<div class="map-popup">
      <strong style="color: #0284c7;">✈️ OWNSHIP POSITION (${ownship.source.toUpperCase()})</strong><br/>
      <span>Coords: ${ownship.latitude.toFixed(4)}°N, ${Math.abs(ownship.longitude).toFixed(4)}°W</span><br/>
      <span>Altitude: <strong>${ownship.altitudeMslFt !== null ? ownship.altitudeMslFt.toLocaleString() : '---'} ft MSL</strong> (${navSolution.estimatedAglFt !== null ? `${navSolution.estimatedAglFt.toLocaleString()} ft AGL` : '---'})</span><br/>
      <span>Ground Speed: <strong>${ownship.groundSpeedKt} kt</strong></span><br/>
      <span>Track: <strong>${ownship.magneticTrackDeg.toString().padStart(3, '0')}°M</strong> (${ownship.trueTrackDeg.toString().padStart(3, '0')}°T)</span><br/>
      <span>GPS Accuracy: ±${ownship.horizontalAccuracyM}m (${ownship.gpsQuality})</span>
    </div>`;

    if (!p.ownshipMarker) {
      p.ownshipMarker = L.marker(ownCoord, {
        icon: createOwnshipIcon(ownship),
        zIndexOffset: 2000,
      })
        .bindPopup(ownshipPopupHtml)
        .addTo(inflightGroup);
    } else {
      p.ownshipMarker.setLatLng(ownCoord);
      p.ownshipMarker.setIcon(createOwnshipIcon(ownship));
      p.ownshipMarker.setPopupContent(ownshipPopupHtml);
    }

    // 7. Lightweight Callouts Group (Track Vector Ticks + Optional On-Map Next-Point Badges)
    calloutsGroup.clearLayers();
    if (navSolution.trackVectorPoints && navSolution.trackVectorPoints.length > 0) {
      const lastIdx = navSolution.trackVectorPoints.length - 1;
      navSolution.trackVectorPoints.forEach((tv, idx) => {
        const isTerminal = idx === lastIdx;
        const tickIcon = L.divIcon({
          className: isTerminal ? 'plus-track-vector-tick' : 'plus-track-vector-hash',
          html: isTerminal
            ? `
              <div class="plus-tv-tick-pill plus-counter-rotatable">
                <span class="tv-tick-dot"></span>
                <span class="tv-tick-label">+${tv.minutesAhead}m · ${tv.predictedAltFt.toLocaleString()} FT</span>
              </div>
            `
            : `
              <div class="plus-tv-cross-tick plus-counter-rotatable" title="+${tv.minutesAhead} min predicted position"></div>
            `,
          iconSize: undefined,
          iconAnchor: isTerminal ? [4, 8] : [4, 4],
        });
        L.marker([tv.latitude, tv.longitude], {
          icon: tickIcon,
          interactive: false,
        }).addTo(calloutsGroup);
      });
    }

    if (showNextPointBadgesOnMap && navSolution.nextPoints.length > 0) {
      navSolution.nextPoints.slice(0, 4).forEach((np, idx) => {
        const isPrimary = idx === 0;
        const borderColor = np.isDirectToTarget
          ? '#d946ef'
          : isPrimary
          ? '#10b981'
          : '#38bdf8';
        const roleLabel = np.isDirectToTarget
          ? '⚡ DCT'
          : isPrimary
          ? 'NEXT'
          : `NEXT +${idx}`;

        const badgeIcon = L.divIcon({
          className: 'plus-next-point-map-badge',
          html: `
            <div class="plus-map-next-pill plus-counter-rotatable ${isPrimary ? 'is-primary' : ''}" style="border-color: ${borderColor};">
              <div class="map-next-top">
                <span class="map-next-role" style="color: ${borderColor};">${roleLabel}</span>
                <strong class="map-next-ident">${np.waypoint.identifier}</strong>
                <span class="map-next-alt">${np.plannedAltitudeFt.toLocaleString()} FT</span>
              </div>
              <div class="map-next-metrics">
                <span>${np.distanceFromOwnshipNm.toFixed(1)} NM</span>
                <span>•</span>
                <span>${Math.round(np.bearingMagDeg).toString().padStart(3, '0')}°M</span>
                <span>•</span>
                <span>${formatEteShort(np.eteSeconds)}</span>
              </div>
            </div>
          `,
          iconSize: undefined,
          iconAnchor: [-14, 24],
        });

        const m = L.marker([np.waypoint.latitude, np.waypoint.longitude], {
          icon: badgeIcon,
        }).addTo(calloutsGroup);

        m.on('click', () => {
          onActivateDirectTo(np.waypoint, np.waypointIndex);
        });
      });
    }
  }, [
    isFlightModeActive,
    ownship,
    navSolution,
    breadcrumbs,
    directToState,
    showNextPointBadgesOnMap,
    showRangeRings,
    showGlideRing,
    mapOrientation,
    onActivateDirectTo,
  ]);

  // Compute Radial & Stacked Airspace Details for Point-Inspector Card
  const inspectorDetails = React.useMemo(() => {
    if (!inspectedPoint) return null;
    const distNm = greatCircleDistance(
      ownship.latitude,
      ownship.longitude,
      inspectedPoint.lat,
      inspectedPoint.lon
    );
    const brgTrue = initialBearing(
      ownship.latitude,
      ownship.longitude,
      inspectedPoint.lat,
      inspectedPoint.lon
    );
    const magVar = magneticDeclination(
      ownship.latitude,
      ownship.longitude,
      ownship.altitudeMslFt ?? 0
    );
    const brgMag = Math.round(((brgTrue - magVar) % 360 + 360) % 360);
    const speedKt = Math.max(40, ownship.groundSpeedKt || 105);
    const eteSec = (distNm / speedKt) * 3600;
    const airspaces = queryAirspacesAtCoordinate(
      inspectedPoint.lat,
      inspectedPoint.lon
    )
      .map((item) => item.airspace)
      .sort((a, b) => b.upperLimitFt - a.upperLimitFt);

    return {
      distNm,
      brgMag,
      eteSec,
      airspaces,
    };
  }, [
    inspectedPoint,
    ownship.latitude,
    ownship.longitude,
    ownship.altitudeMslFt,
    ownship.groundSpeedKt,
  ]);

  const isTrackUpActive = isFlightModeActive && mapOrientation === 'track-up';
  const mapBearingCssVars = isTrackUpActive
    ? ({
        '--map-bearing-deg': `${-ownship.trueTrackDeg}deg`,
        '--map-counter-deg': `${ownship.trueTrackDeg}deg`,
      } as React.CSSProperties)
    : undefined;

  const handleFitEntireRoute = () => {
    const map = mapInstanceRef.current;
    if (!map || waypoints.length === 0) return;
    setFollowOwnship(false);
    isProgrammaticPanRef.current = true;
    const pts = waypoints.map((w) => L.latLng(w.latitude, w.longitude));
    if (alternateAirport) {
      pts.push(L.latLng(alternateAirport.latitude, alternateAirport.longitude));
    }
    if (pts.length === 1) {
      map.setView(pts[0], 11, { animate: true });
    } else {
      map.fitBounds(L.latLngBounds(pts), {
        paddingTopLeft: [80, 100],
        paddingBottomRight: [370, 90],
        maxZoom: 11,
        animate: true,
      });
    }
    setTimeout(() => {
      isProgrammaticPanRef.current = false;
    }, 350);
  };

  return (
    <div
      className={`route-map-container ${isFullscreen ? 'is-fullscreen' : ''} ${
        isFlightModeActive ? 'is-cockpit-map' : ''
      }`}
    >
      {/* Planning Mode Top Toolbar (Hidden in Cockpit Mode for Single-Toolbar Declutter) */}
      {!isFlightModeActive && (
        <div className="map-layer-bar">
          <div className="map-layer-section">
            <span className="map-layer-title">Base:</span>
            <div className="map-layer-buttons">
              <button
                type="button"
                className={`layer-btn ${activeLayer === 'hybrid' ? 'active' : ''}`}
                onClick={() => setActiveLayer('hybrid')}
                title="VFR Hybrid: Shaded Terrain Relief + Contours + Streets & Towns"
              >
                ⛰️🗺️ Terrain + Street
              </button>
              <button
                type="button"
                className={`layer-btn ${activeLayer === 'terrain' ? 'active' : ''}`}
                onClick={() => setActiveLayer('terrain')}
              >
                ⛰️ Topo
              </button>
              <button
                type="button"
                className={`layer-btn ${activeLayer === 'street' ? 'active' : ''}`}
                onClick={() => setActiveLayer('street')}
              >
                🗺️ Street
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
                className={`layer-btn ${activeLayer === 'dark' ? 'active' : ''}`}
                onClick={() => setActiveLayer('dark')}
              >
                🌙 Dark
              </button>
            </div>
          </div>

          {/* Airspace Dropdown Menu */}
          <div
            className="map-layer-section airspace-dropdown-section"
            ref={airspaceDropdownRef}
          >
            <span className="map-layer-title">Airspaces:</span>
            <div className="airspace-dropdown-container">
              <button
                type="button"
                className={`layer-btn airspace-trigger-btn ${
                  showAirspaces ? 'active' : ''
                } ${isAirspaceDropdownOpen ? 'open' : ''}`}
                onClick={() => setIsAirspaceDropdownOpen((prev) => !prev)}
              >
                <span className="airspace-trigger-icon">
                  {showAirspaces ? '🛡️' : '⚪'}
                </span>
                <span className="airspace-trigger-label">
                  {!showAirspaces
                    ? 'Off'
                    : onlyRouteAirspaces
                    ? `Route · ${airspaceFilter === 'ALL' ? 'All' : airspaceFilter}`
                    : airspaceFilter === 'ALL'
                    ? 'All Airspaces'
                    : airspaceFilter}
                </span>
                <span className="airspace-trigger-arrow">
                  {isAirspaceDropdownOpen ? '▲' : '▼'}
                </span>
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
                    <span className="airspace-item-indicator">
                      {!showAirspaces ? '●' : '○'}
                    </span>
                    <span className="airspace-item-text">Off / Hidden</span>
                  </button>
                  <button
                    type="button"
                    className={`airspace-menu-item ${
                      showAirspaces && !onlyRouteAirspaces ? 'selected' : ''
                    }`}
                    onClick={() => {
                      setShowAirspaces(true);
                      setOnlyRouteAirspaces(false);
                    }}
                  >
                    <span className="airspace-item-indicator">
                      {showAirspaces && !onlyRouteAirspaces ? '●' : '○'}
                    </span>
                    <span className="airspace-item-text">All Regional Airspaces</span>
                  </button>
                  <button
                    type="button"
                    className={`airspace-menu-item ${
                      showAirspaces && onlyRouteAirspaces ? 'selected' : ''
                    }`}
                    onClick={() => {
                      setShowAirspaces(true);
                      setOnlyRouteAirspaces(true);
                    }}
                  >
                    <span className="airspace-item-indicator">
                      {showAirspaces && onlyRouteAirspaces ? '●' : '○'}
                    </span>
                    <span className="airspace-item-text">
                      ✈ Route &amp; Look-Ahead Only
                    </span>
                  </button>

                  {showAirspaces && (
                    <>
                      <div className="airspace-menu-divider" />
                      <div className="airspace-menu-section-title">TYPE FILTER</div>
                      {(['ALL', 'CTR', 'TMA', 'SPECIAL', 'ATZ'] as AirspaceFilterType[]).map(
                        (f) => (
                          <button
                            key={f}
                            type="button"
                            className={`airspace-menu-item ${
                              airspaceFilter === f ? 'selected' : ''
                            }`}
                            onClick={() => setAirspaceFilter(f)}
                          >
                            <span className="airspace-item-check">
                              {airspaceFilter === f ? '✓' : ''}
                            </span>
                            <span className="airspace-item-text">{f}</span>
                          </button>
                        )
                      )}
                      <div className="airspace-menu-divider" />
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
                className={`layer-btn ${showRunwayFeathers ? 'active' : ''}`}
                onClick={() => setShowRunwayFeathers((p) => !p)}
                title="Toggle 3 NM Extended Runway Centerline Feathers"
              >
                🛬 RWY Feathers
              </button>
              <button
                type="button"
                className="layer-btn offline-cache-trigger-btn"
                onClick={() => setIsOfflineModalOpen(true)}
              >
                💾 Offline Charts
              </button>
              {!isFullscreen && (
                <button
                  type="button"
                  className="layer-btn fullscreen-toggle-btn"
                  onClick={toggleFullscreen}
                >
                  ⛶ Fullscreen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── In-Flight Left-Side Floating Cockpit Control Dock (Single-Toolbar Declutter) ─── */}
      {isFlightModeActive && (
        <div className="plus-cockpit-left-dock" ref={layersPopoverRef}>
          {/* 1. Compass Rose / Track-Up vs North-Up Toggle */}
          <button
            type="button"
            className={`plus-cockpit-dock-btn plus-compass-rose-btn ${
              mapOrientation === 'track-up' ? 'is-active' : ''
            }`}
            onClick={() =>
              setMapOrientation((prev) =>
                prev === 'north-up' ? 'track-up' : 'north-up'
              )
            }
            title="Toggle Map Orientation: North-Up vs Track-Up (70% Look-Ahead)"
          >
            <span
              className="plus-compass-needle"
              style={{
                transform: `rotate(${
                  mapOrientation === 'track-up' ? -ownship.trueTrackDeg : 0
                }deg)`,
              }}
            >
              🧭
            </span>
            <span className="plus-dock-btn-lbl">
              {mapOrientation === 'track-up' ? 'TRK-UP' : 'N-UP'}
            </span>
          </button>

          {/* 2. Follow / Center Aircraft with 70% Forward Look-Ahead */}
          <button
            type="button"
            className={`plus-cockpit-dock-btn ${followOwnship ? 'is-active' : ''}`}
            onClick={() => {
              setFollowOwnship(true);
              if (mapInstanceRef.current) {
                isProgrammaticPanRef.current = true;
                const targetZoom = Math.max(mapInstanceRef.current.getZoom(), 12);
                const camCenter = computeLookAheadCameraCenter(
                  ownship.latitude,
                  ownship.longitude,
                  ownship.trueTrackDeg,
                  targetZoom
                );
                mapInstanceRef.current.setView(camCenter, targetZoom, {
                  animate: true,
                });
                setTimeout(() => {
                  isProgrammaticPanRef.current = false;
                }, 300);
              }
            }}
            title="Zoom close to aircraft with 70% forward look-ahead camera"
          >
            <span className="plus-dock-btn-ico">🎯</span>
            <span className="plus-dock-btn-lbl">
              {followOwnship ? 'FOLLOW' : 'CENTER'}
            </span>
          </button>

          {/* 3. Unified Map Layers, Overlays & Airspaces Popover Trigger */}
          <button
            type="button"
            className={`plus-cockpit-dock-btn ${isLayersPopoverOpen ? 'is-active' : ''}`}
            onClick={() => setIsLayersPopoverOpen((prev) => !prev)}
            title="Configure Base Map, Runway Feathers, Glide Ring, Range Rings & Airspaces"
          >
            <span className="plus-dock-btn-ico">🗺️</span>
            <span className="plus-dock-btn-lbl">LAYERS</span>
          </button>

          {/* 4. Radial Map Ruler & Stacked Airspace Point-Inspector Mode */}
          <button
            type="button"
            className={`plus-cockpit-dock-btn ${
              isPointInspectorMode || inspectedPoint ? 'is-active' : ''
            }`}
            onClick={() => {
              setIsPointInspectorMode((prev) => !prev);
            }}
            title="Tap anywhere on map (or right-click) to measure BRG/DIST/ETE from Ownship and inspect stacked airspaces"
          >
            <span className="plus-dock-btn-ico">📏</span>
            <span className="plus-dock-btn-lbl">INSPECT</span>
          </button>

          {/* 5. Fit Route Overview */}
          <button
            type="button"
            className="plus-cockpit-dock-btn"
            onClick={handleFitEntireRoute}
            title="Zoom out to frame the entire planned route"
          >
            <span className="plus-dock-btn-ico">📐</span>
            <span className="plus-dock-btn-lbl">ROUTE</span>
          </button>

          {/* Consolidated Map & Avionics Overlays Popover */}
          {isLayersPopoverOpen && (
            <div className="plus-layers-popover">
              <div className="plus-popover-header">
                <strong>🗺️ Map Layers &amp; Tactical Overlays</strong>
                <button
                  type="button"
                  className="plus-popover-close"
                  onClick={() => setIsLayersPopoverOpen(false)}
                >
                  ✕
                </button>
              </div>

              <div className="plus-popover-section">
                <span className="plus-popover-sec-title">BASE CHART</span>
                <div className="plus-popover-grid">
                  {(
                    [
                      ['hybrid', '⛰️🗺️ Terrain + Street'],
                      ['terrain', '⛰️ Topo Contours'],
                      ['street', '🗺️ VFR Street'],
                      ['satellite', '🛰️ Satellite'],
                      ['dark', '🌙 Night Dark'],
                    ] as [MapLayerType, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`plus-popover-chip ${
                        activeLayer === key ? 'is-selected' : ''
                      }`}
                      onClick={() => setActiveLayer(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="plus-popover-section">
                <span className="plus-popover-sec-title">AVIONICS VECTORS &amp; RINGS</span>
                <label className="plus-popover-toggle-row">
                  <input
                    type="checkbox"
                    checked={showRunwayFeathers}
                    onChange={(e) => setShowRunwayFeathers(e.target.checked)}
                  />
                  <span>🛬 3 NM Extended Runway Approach Feathers</span>
                </label>
                <label className="plus-popover-toggle-row">
                  <input
                    type="checkbox"
                    checked={showRangeRings}
                    onChange={(e) => setShowRangeRings(e.target.checked)}
                  />
                  <span>◎ Concentric Distance Rings (2.5 / 5 / 10 NM)</span>
                </label>
                <label className="plus-popover-toggle-row">
                  <input
                    type="checkbox"
                    checked={showGlideRing}
                    onChange={(e) => setShowGlideRing(e.target.checked)}
                  />
                  <span>🪂 Wind-Adjusted Best-Glide Advisor Ring</span>
                </label>
                <label className="plus-popover-toggle-row">
                  <input
                    type="checkbox"
                    checked={showNextPointBadgesOnMap}
                    onChange={(e) => setShowNextPointBadgesOnMap(e.target.checked)}
                  />
                  <span>📍 On-Map Next-Point Telemetry Callouts</span>
                </label>
              </div>

              <div className="plus-popover-section">
                <span className="plus-popover-sec-title">AIRSPACE DISPLAY</span>
                <div className="plus-popover-grid">
                  <button
                    type="button"
                    className={`plus-popover-chip ${!showAirspaces ? 'is-selected' : ''}`}
                    onClick={() => setShowAirspaces(false)}
                  >
                    ⚪ Off
                  </button>
                  <button
                    type="button"
                    className={`plus-popover-chip ${
                      showAirspaces && !onlyRouteAirspaces ? 'is-selected' : ''
                    }`}
                    onClick={() => {
                      setShowAirspaces(true);
                      setOnlyRouteAirspaces(false);
                    }}
                  >
                    🛡️ All Sectors
                  </button>
                  <button
                    type="button"
                    className={`plus-popover-chip ${
                      showAirspaces && onlyRouteAirspaces ? 'is-selected' : ''
                    }`}
                    onClick={() => {
                      setShowAirspaces(true);
                      setOnlyRouteAirspaces(true);
                    }}
                  >
                    ✈ Route Only
                  </button>
                </div>

                {showAirspaces && (
                  <>
                    <div className="plus-popover-filter-pills">
                      {(['ALL', 'CTR', 'TMA', 'SPECIAL', 'ATZ'] as AirspaceFilterType[]).map(
                        (f) => (
                          <button
                            key={f}
                            type="button"
                            className={`plus-filter-mini-btn ${
                              airspaceFilter === f ? 'is-selected' : ''
                            }`}
                            onClick={() => setAirspaceFilter(f)}
                          >
                            {f}
                          </button>
                        )
                      )}
                    </div>
                    <label className="plus-popover-toggle-row">
                      <input
                        type="checkbox"
                        checked={showSectorLabels}
                        onChange={(e) => setShowSectorLabels(e.target.checked)}
                      />
                      <span>🏷️ Show Airspace Floor / Ceiling Badges</span>
                    </label>
                  </>
                )}
              </div>

              <div className="plus-popover-footer">
                <button
                  type="button"
                  className="plus-popover-action-btn"
                  onClick={() => {
                    setIsLayersPopoverOpen(false);
                    setIsOfflineModalOpen(true);
                  }}
                >
                  💾 Offline Chart Cache
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Map Canvas (with optional Track-Up CSS rotation + upright counter-rotated labels) */}
      <div
        ref={mapContainerRef}
        className={`route-map-leaflet ${isTrackUpActive ? 'is-track-up' : ''}`}
        style={mapBearingCssVars}
      />

      {/* Floating Radial Point & Stacked Airspace Inspector Card */}
      {inspectedPoint && inspectorDetails && (
        <div className="plus-point-inspector-card">
          <div className="plus-inspector-header">
            <div>
              <span className="plus-inspector-kicker">🎯 RADIAL &amp; AIRSPACE INSPECTOR</span>
              <strong className="plus-inspector-coords">
                {inspectedPoint.lat.toFixed(4)}°N, {Math.abs(inspectedPoint.lon).toFixed(4)}°W
              </strong>
            </div>
            <button
              type="button"
              className="plus-inspector-close"
              onClick={() => {
                setInspectedPoint(null);
                setIsPointInspectorMode(false);
              }}
            >
              ✕
            </button>
          </div>

          <div className="plus-inspector-radial-bar">
            <div className="plus-radial-metric">
              <span className="radial-lbl">BRG FROM PPOS</span>
              <strong className="radial-val">
                {inspectorDetails.brgMag.toString().padStart(3, '0')}°M
              </strong>
            </div>
            <div className="plus-radial-metric">
              <span className="radial-lbl">DISTANCE</span>
              <strong className="radial-val">
                {inspectorDetails.distNm.toFixed(1)} NM
              </strong>
            </div>
            <div className="plus-radial-metric">
              <span className="radial-lbl">ETE (@GS)</span>
              <strong className="radial-val">
                {formatEteShort(inspectorDetails.eteSec)}
              </strong>
            </div>
          </div>

          <div className="plus-inspector-airspaces">
            <span className="plus-inspector-sec-label">
              STACKED AIRSPACE COLUMN ({inspectorDetails.airspaces.length})
            </span>
            {inspectorDetails.airspaces.length === 0 ? (
              <div className="plus-inspector-empty">
                Class G Uncontrolled Airspace (No active sectors at this coordinate)
              </div>
            ) : (
              <div className="plus-inspector-sector-list">
                {inspectorDetails.airspaces.map((as) => (
                  <div key={as.id} className="plus-inspector-sector-item">
                    <div className="insp-sec-top">
                      <strong>{as.name}</strong>
                      <span className="insp-sec-limits">
                        {as.lowerLimitLabel} → {as.upperLimitLabel}
                      </span>
                    </div>
                    <div className="insp-sec-sub">
                      <span>
                        {as.type} · Class {as.classification}
                      </span>
                      {as.frequency && (
                        <span className="insp-sec-freq">📻 {as.frequency}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="plus-inspector-actions">
            <button
              type="button"
              className="plus-inspector-dct-btn"
              onClick={() => {
                const customTarget: Waypoint = {
                  id: Date.now(),
                  identifier: 'TGT',
                  name: `Inspected Point (${inspectedPoint.lat.toFixed(3)}, ${inspectedPoint.lon.toFixed(3)})`,
                  type: 'custom',
                  latitude: inspectedPoint.lat,
                  longitude: inspectedPoint.lon,
                  elevation: 0,
                  country: 'PT',
                  isCustom: true,
                };
                onActivateDirectTo(customTarget, null);
                setInspectedPoint(null);
                setIsPointInspectorMode(false);
              }}
            >
              ⚡ Direct-To This Coordinate
            </button>
          </div>
        </div>
      )}

      {/* Floating Re-Center Ownship Pill when pilot pans away in Flight Mode */}
      {isFlightModeActive && !followOwnship && (
        <button
          type="button"
          className="plus-floating-recenter-btn"
          onClick={() => {
            setFollowOwnship(true);
            if (mapInstanceRef.current) {
              isProgrammaticPanRef.current = true;
              const camCenter = computeLookAheadCameraCenter(
                ownship.latitude,
                ownship.longitude,
                ownship.trueTrackDeg,
                mapInstanceRef.current.getZoom()
              );
              mapInstanceRef.current.panTo(camCenter, {
                animate: true,
              });
              setTimeout(() => {
                isProgrammaticPanRef.current = false;
              }, 300);
            }
          }}
        >
          🎯 Re-Center on Aircraft (70% Look-Ahead)
        </button>
      )}

      {/* Floating Map Placement or Inspector Hint */}
      {isFlightModeActive && isMapClickPlacementMode && (
        <div className="plus-map-placement-banner">
          🎯 Click anywhere on the map to position Ownship at that coordinate
        </div>
      )}
      {isPointInspectorMode && !isMapClickPlacementMode && (
        <div className="plus-map-placement-banner">
          📏 Point Inspector Active: Click anywhere on the map to measure radial &amp; inspect airspace column
        </div>
      )}

      {isFullscreen && (
        <button
          type="button"
          className="fullscreen-floating-exit-btn"
          onClick={toggleFullscreen}
        >
          ✕ Exit Fullscreen (Esc)
        </button>
      )}

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
