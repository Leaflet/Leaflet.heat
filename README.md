Leaflet.heat
==========

A tiny, simple and fast [Leaflet](http://leafletjs.com) heatmap plugin.
Uses [simpleheat](https://github.com/mourner/simpleheat) under the hood,
additionally clustering points into a grid for performance.

[Demo (10,000 points) &rarr;](http://leaflet.github.io/Leaflet.heat/demo)

## Basic Usage

```js
L.heatLayer(latlngs, {radius: 25}).addTo(map);
```

To include the plugin, just use `leaflet-heat.js` from the `dist` folder:

```html
<script src="leaflet-heat.js"></script>
```

## Reference

```js
L.heatLayer(latlngs, options);
```

Constructs a heatmap layer given an array of `LatLng` points and an object with the following options:

- **maxZoom** - zoom level where the points reach maximum intensity (as intensity scales with zoom),
  equals `maxZoom` of the map by default
- **radius** - radius of each "point" of the heatmap, `25` by default
- **blur** - amount of blur, `15` by default
