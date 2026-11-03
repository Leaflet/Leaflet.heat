import {afterEach, beforeEach, describe, expect, inject, it, vi} from 'vitest';
import * as L from 'leaflet';
import {HeatLayer} from '../src/HeatLayer.js';

const LeafletMap = L.LeafletMap ?? L.Map;
const nextFrame = () => new Promise(requestAnimationFrame);

let container, map;

beforeEach(() => {
    container = document.createElement('div');
    container.style.cssText = 'width: 400px; height: 300px';
    document.body.append(container);
    map = new LeafletMap(container, {maxZoom: 18}).setView([50, 30], 10);
});

afterEach(() => {
    map.remove();
    container.remove();
});

// a point at the given container pixel, with an optional intensity
const at = (x, y, alt) => {
    const {lat, lng} = map.containerPointToLatLng([x, y]);
    return alt === undefined ? [lat, lng] : [lat, lng, alt];
};

const expectData = (layer, expected) => {
    const data = layer._heat._data;
    expect(data).toHaveLength(expected.length);
    expected.forEach((point, i) => point.forEach((v, j) => expect(data[i][j]).toBeCloseTo(v, 6)));
};

describe('HeatLayer', () => {
    it('runs on the Leaflet version of the test project', () => {
        expect(L.version.startsWith(inject('leafletVersion'))).toBe(true);
    });

    it('sets default options without changing Layer defaults', () => {
        const layer = new HeatLayer([], {radius: 10});
        expect(layer.options).toMatchObject({radius: 10, blur: 15, minOpacity: 0.05, max: 1, pane: 'overlayPane'});
        expect(new L.Layer().options.radius).toBeUndefined();
    });

    it('adds a canvas of the map size to the pane and removes it', () => {
        const layer = new HeatLayer([]).addTo(map);
        const canvas = map.getPane('overlayPane').querySelector('canvas.leaflet-heatmap-layer');
        expect(canvas).toBe(layer._canvas);
        expect([canvas.width, canvas.height]).toEqual([400, 300]);

        layer.remove();
        expect(canvas.isConnected).toBe(false);

        layer.addTo(map);
        expect(canvas.isConnected).toBe(true);
    });

    it('uses a custom pane', () => {
        map.createPane('heat');
        const layer = new HeatLayer([], {pane: 'heat'}).addTo(map);
        expect(layer._canvas.parentNode).toBe(map.getPane('heat'));
    });

    it('accepts arrays, LatLngs and objects, with intensity defaulting to 1', () => {
        const [lat, lng] = at(300, 200);
        const layer = new HeatLayer([
            at(20, 20),
            at(100, 20, 0.5),
            at(180, 20, null),
            new L.LatLng(...at(260, 20), 0.25),
            {lat, lng, alt: 0.75},
            {lat: lat + 0.1, lng}
        ], {maxZoom: 10}).addTo(map);

        const y = map.latLngToContainerPoint([lat + 0.1, lng]).y;
        expectData(layer, [[20, 20, 1], [100, 20, 0.5], [180, 20, 1], [260, 20, 0.25], [300, 200, 0.75], [300, y, 1]]);
    });

    it('merges points in the same cell, summing intensity and averaging position by it', () => {
        const layer = new HeatLayer([at(101, 101, 1), at(109, 105, 3), at(300, 200, 2)], {maxZoom: 10}).addTo(map);
        expectData(layer, [[107, 104, 4], [300, 200, 2]]);
    });

    it('halves intensity per zoom level below maxZoom, falling back to the map maxZoom', () => {
        const layer = new HeatLayer([at(200, 150)], {maxZoom: 12}).addTo(map);
        expectData(layer, [[200, 150, 0.25]]);

        map.setZoom(16, {animate: false});
        layer.setOptions({maxZoom: undefined});
        layer._redraw();
        expect(layer._heat._data[0][2]).toBeCloseTo(0.25, 6);
    });

    it('skips points more than radius + blur outside the view', () => {
        const layer = new HeatLayer([at(-30, 100), at(-50, 100), at(100, 330), at(100, 350)], {maxZoom: 10}).addTo(map);
        expectData(layer, [[-30, 100, 1], [100, 330, 1]]);
    });

    it('reprojects points on move', () => {
        const layer = new HeatLayer([at(100, 100)], {maxZoom: 10}).addTo(map);
        map.panBy([30, 50], {animate: false});
        expectData(layer, [[70, 50, 1]]);
    });

    it('draws pixels around points', () => {
        const layer = new HeatLayer([at(100, 100)]).addTo(map);
        const ctx = layer._canvas.getContext('2d');
        expect(ctx.getImageData(100, 100, 1, 1).data[3]).toBeGreaterThan(0);
        expect(ctx.getImageData(300, 200, 1, 1).data[3]).toBe(0);
    });

    it('batches redraws into one per frame', async () => {
        const layer = new HeatLayer([]).addTo(map);
        const redraw = vi.spyOn(layer, '_redraw');

        layer.setLatLngs([at(100, 100)]);
        layer.addLatLng(at(200, 100));
        layer.setOptions({radius: 10, max: 2, gradient: {0.5: 'blue', 1: 'red'}});
        expect(redraw).not.toHaveBeenCalled();

        await nextFrame();
        expect(redraw).toHaveBeenCalledOnce();
        expect(layer._heat._r).toBe(25);
        expect(layer._heat._max).toBe(2);
        expect(layer._heat._data).toHaveLength(2);
    });

    it('does not redraw before being added', async () => {
        const layer = new HeatLayer([]);
        layer.addLatLng(at(100, 100)).setOptions({radius: 10});
        await nextFrame();
        expect(layer._heat).toBeUndefined();

        layer.addTo(map);
        expect(layer._heat._r).toBe(25);
        expect(layer._heat._data).toHaveLength(1);
    });

    it('cancels a pending redraw and unbinds events on removal', async () => {
        const layer = new HeatLayer([at(100, 100)]);
        const reset = vi.spyOn(layer, '_reset');
        layer.addTo(map);
        expect(reset).toHaveBeenCalledOnce();

        const redraw = vi.spyOn(layer, '_redraw');
        layer.addLatLng(at(200, 100)).remove();
        await nextFrame();
        expect(redraw).not.toHaveBeenCalled();

        map.panBy([10, 10], {animate: false});
        expect(reset).toHaveBeenCalledOnce();
    });

    it('works in a zero-size container', () => {
        container.style.display = 'none';
        map.invalidateSize();
        const layer = new HeatLayer([[50, 30]]).addTo(map);
        expect([layer._canvas.width, layer._canvas.height]).toEqual([0, 0]);

        container.style.display = '';
        map.invalidateSize();
        map.fire('moveend');
        expect([layer._canvas.width, layer._canvas.height]).toEqual([400, 300]);
    });

    it('returns the bounds of all points', () => {
        const bounds = new HeatLayer([[50, 30, 0.5], {lat: 51, lng: 29}, new L.LatLng(49, 31)]).getBounds();
        expect(bounds.equals([[49, 29], [51, 31]])).toBe(true);
    });
});
