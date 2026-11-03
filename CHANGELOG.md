# Changelog

## 1.0.0 &mdash; 3 Nov, 2026

Breaking:

- Rewritten as an ES module that exports the `HeatLayer` class, with no globals or `L.heatLayer` factory in the
  package entry.
- `dist/leaflet-heat.js` is now the ES module build, with simpleheat included and Leaflet imported from `leaflet`.
  The plain script build that sets `L.HeatLayer` (and `L.heatLayer` on Leaflet 1.x) is `dist/leaflet-heat-global.js`.
- Requires Leaflet 1.9 or 2.0.

Changes:

- Added Leaflet 2.0 support.
- Added TypeScript types.
- Much faster redraws on pan and zoom with many points, since points are projected only once (binning 1M points
  takes ~6 ms instead of ~120 ms in Chrome).
- Updated simpleheat to 1.0.
- Defaults are set as class options (`radius: 25`, `blur: 15`, `minOpacity: 0.05`, `max: 1`).
- A pending redraw is cancelled when the layer is removed.
- A point with a `null` intensity now counts as 1 instead of 0, the same as a missing one.
- Points with zero intensity are no longer drawn (a single one was drawn at `minOpacity` before).
- Fixed a crash when the map container has zero width or height (#110, #95, #102).
- Fixed a crash when the map uses a different Leaflet instance than the plugin (#144, #137).
- Fixed points drawn out of place when the heatmap is redrawn while the map is being dragged.
- Uses only public Leaflet APIs, so it no longer depends on private map methods.
- Fixed the demos on https (#117, #96).

## 0.2.0 &mdash; Oct 26, 2015

- Fixed intensity to work properly with `max` option.
- Fixed zoom animation on Leaflet 1.0 beta 2.
- Fixed tiles and point intensity in demos.

## 0.1.3 &mdash; Nov 25, 2014

- Fixed some edge cases when handling point intensity.
- Added `minOpacity` option.

## 0.1.2 &mdash; Nov 5, 2014

- Added compatibility with Leaflet 0.8-dev.

## 0.1.1 &mdash; Apr 22, 2014

- Fixed overlaying two heatmaps on top of each other.
- Fixed rare animation issues.

## 0.1.0 &mdash; Feb 3, 2014

- Added `addLatLng`, `setLatLngs`, `setOptions` and `redraw` methods.
- Added `max` option and support for different point intensity values (through `LatLng` third argument).
- Added `gradient` option to customize colors.

## 0.0.1 &mdash; Jan 31, 2014

- Initial release.
