// Imports the package by name, so this checks the emitted declarations through the `types` export condition.
import {LatLng, LayerGroup, LeafletMap} from 'leaflet';
import {HeatLayer} from 'leaflet.heat';
import type {HeatLatLng, HeatLayerOptions} from 'leaflet.heat';

const map = new LeafletMap('map');

// points as tuples with or without intensity, literals with or without alt, and LatLngs
const points: HeatLatLng[] = [
    [50, 30], [50, 30, 0.5], {lat: 50, lng: 30}, {lat: 50, lng: 30, alt: 2}, new LatLng(50, 30, 1)
];
const opts: HeatLayerOptions = {
    radius: 10, blur: 5, max: 2, maxZoom: 12, gradient: {0.4: 'blue', 1: 'red'}, pane: 'heat'
};

// methods chain, and the layer works anywhere a Layer does
const heat = new HeatLayer(points, opts).addTo(map);
new HeatLayer([]).setLatLngs(points).addLatLng([1, 2]).setOptions({minOpacity: 0.2}).redraw().remove();
heat.getBounds().getCenter();
map.hasLayer(heat);
new LayerGroup<HeatLayer>([heat]).eachLayer(layer => layer.setOptions({radius: 20}));

// options on an instance have the defaults filled in
const radius: number = heat.options.radius;
const minOpacity: number = heat.options.minOpacity;
const maxZoom: number | undefined = heat.options.maxZoom;
const pane: string = heat.options.pane;

// @ts-expect-error options are numbers
new HeatLayer([], {radius: '10'});
// @ts-expect-error unknown option
new HeatLayer([], {radiu: 10});
// @ts-expect-error latlngs are required
new HeatLayer();
// @ts-expect-error not a point
heat.addLatLng('50,30');
// @ts-expect-error a tuple has at most lat, lng and intensity
heat.addLatLng([50, 30, 1, 2]);
// @ts-expect-error maxZoom may be unset
const zoom: number = heat.options.maxZoom;
