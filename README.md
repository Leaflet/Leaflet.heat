# Leaflet.heat

A tiny, simple and fast [Leaflet](https://leafletjs.com) heatmap plugin. Uses
[simpleheat](https://github.com/mourner/simpleheat) under the hood, additionally clustering points into a grid for
performance. Works with Leaflet 1.9 and 2.0.

[![Build Status](https://github.com/Leaflet/Leaflet.heat/actions/workflows/ci.yml/badge.svg)](https://github.com/Leaflet/Leaflet.heat/actions)

## Demos

- [10,000 points &rarr;](https://leaflet.github.io/Leaflet.heat/demo/)
- [Adding points dynamically &rarr;](https://leaflet.github.io/Leaflet.heat/demo/draw.html)
- [Leaflet 1.9 as an ES module &rarr;](https://leaflet.github.io/Leaflet.heat/demo/v1.html)
- [Leaflet 1.9 with plain scripts &rarr;](https://leaflet.github.io/Leaflet.heat/demo/global.html)

## Usage

```js
import {HeatLayer} from 'leaflet.heat';

const heat = new HeatLayer([
    [50.5, 30.5, 0.2], // lat, lng, intensity
    [50.6, 30.4, 0.5],
    ...
], {radius: 25}).addTo(map);
```

Install with `npm install leaflet.heat`. TypeScript types are included (for Leaflet 2.0).

### From a CDN

With Leaflet 2.0, map `leaflet` in an import map and import the plugin's ES module build, which includes simpleheat:

```html
<script type="importmap">
    {"imports": {"leaflet": "https://cdn.jsdelivr.net/npm/leaflet@2.0.0-beta.1/dist/leaflet.js"}}
</script>
<script type="module">
    import {LeafletMap, TileLayer} from 'leaflet';
    import {HeatLayer} from 'https://cdn.jsdelivr.net/npm/leaflet.heat@1.0.0/dist/leaflet-heat.js';
</script>
```

Leaflet 1.9 has no ES module package entry, so map `leaflet` to its ESM build explicitly:

```json
{"imports": {"leaflet": "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet-src.esm.js"}}
```

### As a plain script

`leaflet-heat-global.js` reads Leaflet from the global `L` and adds `L.HeatLayer` to it. Load it after Leaflet 1.9's
`leaflet.js`:

```html
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://cdn.jsdelivr.net/npm/leaflet.heat@1.0.0/dist/leaflet-heat-global.js"></script>
<script>
    const heat = L.heatLayer(points, {radius: 25}).addTo(map);
</script>
```

Or after Leaflet 2.0's `leaflet-global.js`, which has no factory functions, so use `new L.HeatLayer(points)` there.
The `L.heatLayer` factory is only added on Leaflet 1.x.

## Reference

#### new HeatLayer(latlngs, options?)

Creates a heatmap layer from an array of points. Each point can be an array like `[50.5, 30.5, 0.5]` (the third
element being the intensity), a `{lat, lng, alt}` object, or a `LatLng`, with the intensity in `alt`. Intensity is 1
if not set.

Options:

- **radius**: radius of each point, `25` by default.
- **blur**: amount of blur, `15` by default.
- **minOpacity**: the minimum opacity the heat will start at, `0.05` by default.
- **max**: intensity that maps to the end of the gradient, `1` by default.
- **maxZoom**: zoom level where points reach full intensity, the map's `maxZoom` by default.
- **gradient**: color gradient config, e.g. `{0.4: 'blue', 0.65: 'lime', 1: 'red'}`.
- **pane**: map pane where the heat will be drawn, `'overlayPane'` by default.

Points close to each other are merged into grid cells of `(radius + blur) / 2` pixels, and their intensities are
summed. Below `maxZoom`, each point's intensity is halved per zoom level. So at lower zooms, `max` is compared
against the total of all points in a cell, not against single points.

#### Methods

- **setLatLngs(latlngs)**: replaces the heatmap data and redraws it.
- **addLatLng(latlng)**: adds a point and redraws the heatmap.
- **setOptions(options)**: sets new options and redraws the heatmap.
- **redraw()**: redraws the heatmap on the next animation frame. Several calls before that frame make a single
  redraw.
- **getBounds()**: returns the `LatLngBounds` of all points.

## Compatibility

Leaflet.heat supports Leaflet 1.9 and 2.0 from the same code. It uses a few private map methods that exist in both,
`_getMapPanePos`, `_getCenterOffset` and `_zoomAnimated`, so a future Leaflet version that changes them may need a
plugin update.

## Upgrading from 0.2

- The package is an ES module and exports the `HeatLayer` class. It no longer sets globals; use
  `dist/leaflet-heat-global.js` for that.
- `dist/leaflet-heat.js` is now the ES module build. The plain script is `dist/leaflet-heat-global.js`.
- `L.heatLayer(...)` only exists in the plain script build on Leaflet 1.x. Use `new HeatLayer(...)` elsewhere.
- Leaflet 1.9 or later is required.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
