import {HeatLayer} from '../src/HeatLayer.js';

// leaflet is external here and resolves to window.L, from 1.x's leaflet.js or 2.0's leaflet-global.js
const L = window.L;
L.HeatLayer = HeatLayer;

// 2.0 has no factories, so only 1.x pages get the 1.x-style one
if (L.version.startsWith('1.')) {
    L.heatLayer = (latlngs, options) => new HeatLayer(latlngs, options);
}
