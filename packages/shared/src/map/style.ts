import type { StyleSpecification } from 'maplibre-gl';

/**
 * Монохромный стиль карты в палитре сайта.
 *
 * Готовые стили (positron, liberty) приходят цветными, и в строгой вёрстке
 * карта становится единственным пёстрым пятном. Здесь тот же тёплый серый
 * ряд, что и во всём остальном: земля чуть темнее страницы, дороги белые,
 * вода — самый тёмный из фоновых тонов, чтобы Волга читалась без синего.
 *
 * Данные — OpenStreetMap по схеме OpenMapTiles. Подпись обязательна по
 * лицензии ODbL и выводится под картой.
 */

/** Те же значения, что в globals.css. Стиль карты — обычный JSON, доступа к CSS-переменным у него нет. */
const c = {
  land: '#f7f5f1',
  green: '#eeeae1',
  water: '#dcd7cd',
  building: '#e9e5de',
  roadFill: '#ffffff',
  roadCasing: '#d6d2ca',
  roadMinor: '#fbfaf7',
  roadMinorCasing: '#e3dfd7',
  rail: '#cdc8bd',
  boundary: '#c4bfb4',
  label: '#55554f',
  labelSoft: '#8a8880',
  halo: '#f7f5f1',
} as const;

const FONT = ['Noto Sans Regular'];
const FONT_ITALIC = ['Noto Sans Italic'];

/** Русское название, если оно есть в данных, иначе местное. */
const NAME: unknown = ['coalesce', ['get', 'name:ru'], ['get', 'name']];

export const TILE_SOURCE = 'https://tiles.openfreemap.org/planet';
export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const ATTRIBUTION = '© OpenStreetMap';

export const mapStyle: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS,
  sources: {
    omt: { type: 'vector', url: TILE_SOURCE, attribution: ATTRIBUTION },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': c.land } },

    {
      id: 'green',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass', 'scrub']]],
      paint: { 'fill-color': c.green },
    },
    {
      id: 'park',
      type: 'fill',
      source: 'omt',
      'source-layer': 'park',
      paint: { 'fill-color': c.green },
    },

    {
      id: 'water',
      type: 'fill',
      source: 'omt',
      'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: { 'fill-color': c.water },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'omt',
      'source-layer': 'waterway',
      paint: {
        'line-color': c.water,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 16, 3],
      },
    },

    // Дома появляются только вблизи: раньше они превращают квартал в кашу.
    {
      id: 'building',
      type: 'fill',
      source: 'omt',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-color': c.building,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 1],
      },
    },

    // Дороги: сначала обводка целиком, потом заливка — иначе стыки рвутся.
    {
      id: 'road-casing',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      filter: [
        'in',
        ['get', 'class'],
        ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c.roadCasing,
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 1.4, 14, 7, 18, 26],
      },
    },
    {
      id: 'road-minor-casing',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'service']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c.roadMinorCasing,
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 12, 1, 18, 14],
      },
    },
    {
      id: 'road-minor',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'service']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c.roadMinor,
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 12, 0.4, 18, 11],
      },
    },
    {
      id: 'road',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      filter: [
        'in',
        ['get', 'class'],
        ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c.roadFill,
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 0.6, 14, 5, 18, 22],
      },
    },
    {
      id: 'path',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 14,
      filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]],
      paint: {
        'line-color': c.roadCasing,
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.6, 18, 2],
        'line-dasharray': [2, 2],
      },
    },
    {
      id: 'rail',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['==', ['get', 'class'], 'rail'],
      paint: {
        'line-color': c.rail,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 18, 2.4],
        'line-dasharray': [3, 2],
      },
    },

    {
      id: 'boundary',
      type: 'line',
      source: 'omt',
      'source-layer': 'boundary',
      filter: ['<=', ['get', 'admin_level'], 6],
      paint: { 'line-color': c.boundary, 'line-width': 0.8, 'line-dasharray': [4, 3] },
    },

    // ── Подписи ──
    {
      id: 'label-water',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'water_name',
      layout: {
        'text-field': NAME as never,
        'text-font': FONT_ITALIC,
        'text-size': 12,
        'symbol-placement': 'line',
      },
      paint: { 'text-color': c.labelSoft, 'text-halo-color': c.water, 'text-halo-width': 1 },
    },
    {
      id: 'label-street',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'transportation_name',
      minzoom: 14,
      layout: {
        'text-field': NAME as never,
        'text-font': FONT,
        'text-size': 11,
        'symbol-placement': 'line',
        'text-letter-spacing': 0.02,
      },
      paint: { 'text-color': c.labelSoft, 'text-halo-color': c.halo, 'text-halo-width': 1.4 },
    },
    {
      id: 'label-place-small',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      filter: [
        'in',
        ['get', 'class'],
        ['literal', ['suburb', 'neighbourhood', 'village', 'hamlet']],
      ],
      layout: {
        'text-field': NAME as never,
        'text-font': FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 15, 13],
        'text-letter-spacing': 0.08,
        'text-transform': 'uppercase',
      },
      paint: { 'text-color': c.labelSoft, 'text-halo-color': c.halo, 'text-halo-width': 1.6 },
    },
    {
      id: 'label-place',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      layout: {
        'text-field': NAME as never,
        'text-font': FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 12, 14, 17],
        'text-letter-spacing': 0.06,
      },
      paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.8 },
    },
  ],
};
