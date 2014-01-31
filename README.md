Leaflet.heat
==========

A tiny, simple and fast [Leaflet](http://leafletjs.com) heatmap plugin.
Uses [simpleheat](https://github.com/pa7/heatmap.js) under the hood,
additionally clustering points into a grid for performance.

Demo (10,000 points): http://leaflet.github.io/Leaflet.heat/demo

```js
var heat = L.heatLayer(latlngs).addTo(map);
```
