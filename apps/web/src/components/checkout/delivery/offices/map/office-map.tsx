"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { MapPinOff } from "lucide-react";
import type {
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import { DeliveryOfficeType, ShippingMethod, type DeliveryOfficeDto } from "@vp-parts-shop/shared";
import type { ReferencePoint } from "@/lib/checkout/delivery/office-distance";
import {
  framingBounds,
  toLocationFeatures,
  toOfficeFeatures,
} from "@/lib/checkout/delivery/office-map-features";
import {
  carrierColorToken,
  loadSvgImage,
  officePinImageExpression,
  officePinImageId,
  officePinSvg,
} from "@/lib/checkout/delivery/office-pin";

/** OpenFreeMap needs no key; see docs/DELIVERY-PROVIDERS.md for the fallback. */
const MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/positron";

/** Put there by scripts/copy-map-worker.mjs. */
const MAP_WORKER_URL = "/vendor/maplibre/maplibre-gl-worker.mjs";

/** Must be a font the style's glyph server serves. */
const LABEL_FONT = "Noto Sans Bold";

const BULGARIA_BOUNDS: [[number, number], [number, number]] = [
  [22.35, 41.23],
  [28.61, 44.22],
];

const SOURCE_ID = "offices";
const LOCATION_SOURCE_ID = "customer-location";
const CLUSTER_LAYER = "office-clusters";
const POINT_LAYER = "office-points";
const HOVERED_LAYER = "office-hovered";
const SELECTED_LAYER = "office-selected";
const SELECTED_OFFICE_ZOOM = 16;
const REDRAW_DELAY_MS = 200;
const PIN_PIXEL_RATIO = 2;
const PIN_SIZE = 36 * PIN_PIXEL_RATIO;
const SELECTED_PIN_SIZE = 44 * PIN_PIXEL_RATIO;

type MapStatus = "loading" | "ready" | "failed";

interface OfficeMapProps {
  offices: DeliveryOfficeDto[];
  /** Colours the clusters; each pin takes its own office's carrier. */
  carrier: ShippingMethod;
  /** Changes when the customer changes the search; the map re-frames only then. */
  framingKey: string;
  selectedCode: string | null;
  hoveredCode: string | null;
  /** Frames the map around it; marked on the map only when it is the customer's device. */
  referencePoint: ReferencePoint | null;
  onSelect: (officeCode: string) => void;
  onHover: (officeCode: string | null) => void;
}

/**
 * The offices on a map, as a second way into the list beside it. MapLibre is
 * loaded only when this mounts, and a map that cannot be drawn leaves the list
 * to do the job.
 */
export function OfficeMap({
  offices,
  carrier,
  framingKey,
  selectedCode,
  hoveredCode,
  referencePoint,
  onSelect,
  onHover,
}: OfficeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const officesRef = useRef(offices);
  const carrierRef = useRef(carrier);
  const selectedCodeRef = useRef(selectedCode);
  const referencePointRef = useRef(referencePoint);
  const framedKeyRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  const [status, setStatus] = useState<MapStatus>("loading");

  useEffect(() => {
    officesRef.current = offices;
    carrierRef.current = carrier;
    selectedCodeRef.current = selectedCode;
    referencePointRef.current = referencePoint;
    onSelectRef.current = onSelect;
    onHoverRef.current = onHover;
  });

  useEffect(() => {
    let isUnmounted = false;

    import("maplibre-gl")
      .then((maplibre) => {
        if (isUnmounted || !containerRef.current) {
          return;
        }

        maplibre.setWorkerUrl(MAP_WORKER_URL);
        const map = new maplibre.Map({
          container: containerRef.current,
          style: MAP_STYLE_URL,
          bounds: BULGARIA_BOUNDS,
          attributionControl: { compact: true },
          dragRotate: false,
          touchPitch: false,
        });
        map.addControl(new maplibre.NavigationControl({ showCompass: false }));
        mapRef.current = map;

        watchMapLoad(map, carrierRef.current, setStatus);
        wireOfficePointer(map, {
          onSelect: (code) => onSelectRef.current(code),
          onHover: (code) => onHoverRef.current(code),
        });
      })
      .catch(() => setStatus("failed"));

    return () => {
      isUnmounted = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) {
      return;
    }

    const redraw = setTimeout(() => {
      map.getSource<GeoJSONSource>(SOURCE_ID)?.setData(toOfficeFeatures(offices));

      if (framedKeyRef.current !== framingKey) {
        framedKeyRef.current = framingKey;
        frameOffices(map, offices, {
          selectedCode: selectedCodeRef.current,
          referencePoint: referencePointRef.current,
        });
      }
    }, REDRAW_DELAY_MS);

    return () => clearTimeout(redraw);
  }, [status, offices, framingKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) {
      return;
    }

    map.setFilter(HOVERED_LAYER, codeFilter(hoveredCode));
  }, [status, hoveredCode]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) {
      return;
    }

    const deviceLocation = referencePoint?.kind === "device" ? referencePoint : null;
    map.getSource<GeoJSONSource>(LOCATION_SOURCE_ID)?.setData(toLocationFeatures(deviceLocation));
  }, [status, referencePoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) {
      return;
    }

    map.setFilter(SELECTED_LAYER, codeFilter(selectedCode));

    const selected = officesRef.current.find(({ code }) => code === selectedCode);
    if (selected) {
      map.easeTo({
        center: [selected.longitude, selected.latitude],
        zoom: SELECTED_OFFICE_ZOOM,
      });
    }
  }, [status, selectedCode]);

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-[10px] border border-line bg-bg-sunken">
      {/* Sized, not positioned: MapLibre's stylesheet makes its container `relative`. */}
      <div ref={containerRef} data-testid="office-map" className="h-full min-h-[320px] w-full" />

      {status === "loading" && (
        <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-bg-sunken" />
      )}

      {status === "failed" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg-sunken p-6 text-center">
          <MapPinOff className="h-6 w-6 text-ink-4" aria-hidden="true" />
          <p className="text-[12.5px] text-ink-3">
            Картата не може да се зареди. Изберете офис от списъка.
          </p>
        </div>
      )}
    </div>
  );
}

interface FramingFocus {
  selectedCode: string | null;
  referencePoint: ReferencePoint | null;
}

/** Keeps the office the customer has open in view; otherwise the offices around the point, or all. */
function frameOffices(
  map: MapLibreMap,
  offices: DeliveryOfficeDto[],
  { selectedCode, referencePoint }: FramingFocus,
) {
  const selected = offices.find(({ code }) => code === selectedCode);
  if (selected) {
    map.easeTo({
      center: [selected.longitude, selected.latitude],
      zoom: SELECTED_OFFICE_ZOOM,
    });
    return;
  }

  const bounds = framingBounds(offices, referencePoint);
  if (bounds) {
    map.fitBounds(bounds, { padding: 40, maxZoom: SELECTED_OFFICE_ZOOM });
  }
}

/** Adds the office layers once the style and pins are in; either missing fails the map. */
function watchMapLoad(
  map: MapLibreMap,
  carrier: ShippingMethod,
  setStatus: (status: MapStatus) => void,
) {
  let isLoaded = false;

  map.on("load", () => {
    isLoaded = true;
    const colors = readColorTokens(carrier);

    addOfficePinImages(map, colors)
      .then(() => {
        addOfficeLayers(map, colors);
        setStatus("ready");
      })
      .catch(() => setStatus("failed"));
  });

  // Tile errors are routine and leave the map usable; only a missing style is fatal.
  map.on("error", () => {
    if (!isLoaded && !map.isStyleLoaded()) {
      setStatus("failed");
    }
  });
}

function codeFilter(officeCode: string | null): FilterSpecification {
  return ["==", ["get", "code"], officeCode ?? ""];
}

interface OfficePointerHandlers {
  onSelect: (officeCode: string) => void;
  onHover: (officeCode: string | null) => void;
}

function wireOfficePointer(map: MapLibreMap, { onSelect, onHover }: OfficePointerHandlers) {
  map.on("click", POINT_LAYER, (event: MapLayerMouseEvent) => {
    const code = officeCodeOf(event);
    if (code) {
      onSelect(code);
    }
  });

  // The cluster can be gone by the time its zoom resolves, when a keystroke redraws the offices.
  map.on("click", CLUSTER_LAYER, (event: MapLayerMouseEvent) => {
    zoomIntoCluster(map, event).catch(() => undefined);
  });

  map.on("mousemove", POINT_LAYER, (event: MapLayerMouseEvent) => {
    map.getCanvas().style.cursor = "pointer";
    onHover(officeCodeOf(event));
  });
  map.on("mouseleave", POINT_LAYER, () => {
    map.getCanvas().style.cursor = "";
    onHover(null);
  });

  map.on("mouseenter", CLUSTER_LAYER, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", CLUSTER_LAYER, () => {
    map.getCanvas().style.cursor = "";
  });
}

function officeCodeOf(event: MapLayerMouseEvent): string | null {
  const code = event.features?.[0]?.properties?.code;

  return typeof code === "string" ? code : null;
}

async function zoomIntoCluster(map: MapLibreMap, event: MapLayerMouseEvent) {
  const cluster = event.features?.[0];
  const source = map.getSource<GeoJSONSource>(SOURCE_ID);
  if (!cluster || cluster.geometry.type !== "Point" || !source) {
    return;
  }

  const zoom = await source.getClusterExpansionZoom(cluster.properties.cluster_id);
  const [longitude, latitude] = cluster.geometry.coordinates;

  map.easeTo({ center: [longitude, latitude], zoom });
}

type ColorTokens = ReturnType<typeof readColorTokens>;

/** Every carrier's pin for every office type, and the selected pin for each type. */
async function addOfficePinImages(map: MapLibreMap, colors: ColorTokens) {
  const pins = Object.values(DeliveryOfficeType).flatMap((type) => [
    ...Object.values(ShippingMethod).map((carrier) => ({
      id: officePinImageId(carrier, type),
      svg: officePinSvg({
        type,
        fill: colors.carrier(carrier),
        ring: colors.card,
        size: PIN_SIZE,
      }),
    })),
    {
      id: officePinImageId("selected", type),
      svg: officePinSvg({
        type,
        fill: colors.carrierFill,
        ring: colors.card,
        size: SELECTED_PIN_SIZE,
      }),
    },
  ]);

  const images = await Promise.all(pins.map(({ svg }) => loadSvgImage(svg)));

  pins.forEach(({ id }, index) => {
    if (!map.hasImage(id)) {
      map.addImage(id, images[index], { pixelRatio: PIN_PIXEL_RATIO });
    }
  });
}

function addOfficeLayers(map: MapLibreMap, colors: ColorTokens) {
  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: toOfficeFeatures([]),
    cluster: true,
    clusterRadius: 40,
    clusterMaxZoom: SELECTED_OFFICE_ZOOM - 2,
  });

  map.addLayer({
    id: CLUSTER_LAYER,
    type: "circle",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": colors.carrierFill,
      "circle-radius": ["step", ["get", "point_count"], 18, 20, 22, 100, 27],
      "circle-stroke-width": 2,
      "circle-stroke-color": colors.card,
    },
  });

  map.addLayer({
    id: "office-cluster-count",
    type: "symbol",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": [LABEL_FONT],
      "text-size": 13,
    },
    paint: { "text-color": colors.card },
  });

  map.addSource(LOCATION_SOURCE_ID, { type: "geojson", data: toLocationFeatures(null) });
  map.addLayer({
    id: LOCATION_SOURCE_ID,
    type: "circle",
    source: LOCATION_SOURCE_ID,
    paint: {
      "circle-color": colors.location,
      "circle-radius": 7,
      "circle-stroke-width": 3,
      "circle-stroke-color": colors.card,
    },
  });

  map.addLayer({
    id: HOVERED_LAYER,
    type: "circle",
    source: SOURCE_ID,
    filter: codeFilter(null),
    paint: {
      "circle-color": "transparent",
      "circle-radius": PIN_SIZE / PIN_PIXEL_RATIO / 2 + 3,
      "circle-stroke-width": 2,
      "circle-stroke-color": colors.ink,
    },
  });

  map.addLayer({
    id: POINT_LAYER,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": officePinImageExpression(["get", "carrier"]),
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });

  map.addLayer({
    id: SELECTED_LAYER,
    type: "symbol",
    source: SOURCE_ID,
    filter: codeFilter(null),
    layout: {
      "icon-image": officePinImageExpression("selected"),
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
}

/** Map paint takes literal colours, so the theme's tokens are read off the page. */
function readColorTokens(mapCarrier: ShippingMethod) {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(name).trim();

  return {
    ink: token("--ink"),
    card: token("--bg-alt"),
    location: token("--info"),
    carrier: (carrier: ShippingMethod) => token(carrierColorToken(carrier)),
    carrierFill: token(carrierColorToken(mapCarrier)),
  };
}
