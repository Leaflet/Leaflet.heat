import {afterEach, beforeEach, describe, expect, inject, it, vi} from 'vitest';
import * as L from 'leaflet';
import {HeatLayer} from '../src/HeatLayer.js';
import 'leaflet/dist/leaflet.css';

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
        const [lat2, lng2] = at(340, 260);
        const layer = new HeatLayer([
            at(20, 20),
            at(100, 20, 0.5),
            at(180, 20, null),
            new L.LatLng(...at(260, 20), 0.25),
            {lat, lng, alt: 0.75},
            {lat: lat2, lng: lng2}
        ], {maxZoom: 10}).addTo(map);

        expectData(layer, [[20, 20, 1], [100, 20, 0.5], [180, 20, 1], [260, 20, 0.25], [300, 200, 0.75], [340, 260, 1]]);
    });

    it('merges points in the same cell, summing intensity and averaging position by it', () => {
        // cells are (radius + blur) / 2 = 20 px and aligned to absolute pixels; one starts at container (x, y)
        const origin = map.getPixelOrigin();
        const x = 100 - (origin.x + 100) % 20;
        const y = 100 - (origin.y + 100) % 20;
        const layer = new HeatLayer([at(x + 1, y + 1, 1), at(x + 9, y + 5, 3), at(300, 200, 2)], {maxZoom: 10}).addTo(map);
        expectData(layer, [[x + 7, y + 4, 4], [300, 200, 2]]);
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

    it('merges the same points at a zoom wherever the view was reset (#3)', () => {
        const points = [];
        for (let i = 0; i < 1000; i++) points.push(at(50 + (i * 37) % 300, 50 + (i * 53) % 200));
        const layer = new HeatLayer(points, {maxZoom: 10}).addTo(map);

        // cells in absolute pixels, within an area both views below cover
        const o = layer._origin;
        const cells = () => layer._heat._data
            .map(([x, y, k]) => [x + layer._origin.x, y + layer._origin.y, k].map(v => Math.round(v * 1e6) / 1e6))
            .filter(([x, y]) => x > o.x + 100 && x < o.x + 250 && y > o.y + 100 && y < o.y + 150);
        const before = cells();
        expect(before.length).toBeGreaterThan(10);

        // as after zooming in and out around another point: the pixel origin moves by a fraction of a cell
        map.setView(map.containerPointToLatLng([207, 159]), 10, {reset: true});
        expect(layer._origin.x - o.x).toBe(7);
        expect(cells()).toEqual(before);
    });

    it('reprojects points on move', () => {
        const layer = new HeatLayer([at(100, 100)], {maxZoom: 10}).addTo(map);
        map.panBy([30, 50], {animate: false});
        expectData(layer, [[70, 50, 1]]);
    });

    it('draws where the canvas is when redrawn before moveend, e.g. while dragging', () => {
        const layer = new HeatLayer([at(100, 100)], {maxZoom: 10}).addTo(map);
        L.DomUtil.setPosition(map.getPane('mapPane'), new L.Point(-30, -50));
        layer._redraw();
        expectData(layer, [[100, 100, 1]]);
    });

    it('scales the canvas around the zoom center during zoom animation', () => {
        const layer = new HeatLayer([]).addTo(map);
        map.panBy([30, 50], {animate: false});
        map.fire('zoomanim', {center: map.containerPointToLatLng([300, 100]), zoom: 12, noUpdate: false});

        // a canvas pixel should land where its location is in the new view: scaled 4x away from (300, 100), which
        // becomes the view center
        const box = layer._canvas.getBoundingClientRect();
        const mapBox = container.getBoundingClientRect();
        expect(box.width).toBeCloseTo(1600, 3);
        expect(box.left - mapBox.left).toBeCloseTo(200 - 300 * 4, 3);
        expect(box.top - mapBox.top).toBeCloseTo(150 - 100 * 4, 3);
    });

    it('follows the map on zoom events until moveend, drawing at the zoom it is scaled from', async () => {
        // live zooms fire zoom on every frame, CSS zoom animations zoomanim at the start and zoom once at the end
        const layer = new HeatLayer([at(100, 100)], {maxZoom: 10}).addTo(map);
        const corner = map.containerPointToLatLng([0, 0]);
        const frames = [];
        let animTransform;

        // the layer listens first, so this reads the transform it set for the end of a CSS zoom animation
        map.on('zoomanim', () => { animTransform = layer._canvas.style.transform; });
        map.on('zoom', () => {
            // the transform zoomanim set is where the canvas already is when the animation ends
            if (animTransform) expect(layer._canvas.style.transform).toBe(animTransform);
            const box = layer._canvas.getBoundingClientRect();
            const mapBox = container.getBoundingClientRect();
            const {x, y} = map.latLngToContainerPoint(corner);
            layer._redraw();
            frames.push({
                dx: box.left - mapBox.left - x,
                dy: box.top - mapBox.top - y,
                dw: box.width - 400 * map.getZoomScale(map.getZoom(), 10),
                data: layer._heat._data.map(p => p.map(v => Math.round(v * 1e6) / 1e6))
            });
        });
        await new Promise((resolve) => {
            map.once('moveend', resolve);
            map.setZoom(12, {animate: true});
        });

        expect(frames.length).toBeGreaterThan(0);
        for (const {dx, dy, dw, data} of frames) {
            expect(Math.abs(dx)).toBeLessThan(1);
            expect(Math.abs(dy)).toBeLessThan(1);
            expect(Math.abs(dw)).toBeLessThan(1e-3);
            expect(data).toEqual([[100, 100, 1]]);
        }
        expect(layer._canvas.getBoundingClientRect().width).toBe(400);
    });

    it('projects points added to the array, and changed in place after redraw()', async () => {
        const points = [at(100, 100)];
        const layer = new HeatLayer(points, {maxZoom: 10}).addTo(map);

        layer.addLatLng(at(200, 100));
        points.push(at(300, 100));
        await nextFrame();
        expectData(layer, [[100, 100, 1], [200, 100, 1], [300, 100, 1]]);

        points[0] = at(100, 200);
        map.fire('moveend');
        expectData(layer, [[100, 100, 1], [200, 100, 1], [300, 100, 1]]);

        layer.redraw();
        await nextFrame();
        expectData(layer, [[200, 100, 1], [300, 100, 1], [100, 200, 1]]);

        points.length = 1;
        map.fire('moveend');
        expectData(layer, [[100, 200, 1]]);
    });

    it('reprojects points on a map with a different CRS', () => {
        const point = at(100, 100);
        const layer = new HeatLayer([point], {maxZoom: 10}).addTo(map);
        layer.remove();

        const container2 = document.createElement('div');
        container2.style.cssText = 'width: 400px; height: 300px';
        document.body.append(container2);
        const map2 = new LeafletMap(container2, {crs: L.SimpleCRS ?? L.CRS.Simple}).setView([0, 0], 0).addLayer(layer);

        // latLngToContainerPoint rounds
        const {x, y} = map2.project(point).subtract(map2.getPixelOrigin()).subtract(map2.containerPointToLayerPoint([0, 0]));
        expectData(layer, [[x, y, 1 / 2 ** 10]]);
        map2.remove();
        container2.remove();
    });

    it('skips points with zero intensity', () => {
        const layer = new HeatLayer([at(101, 101, 0), at(109, 105, 0), at(300, 200, 0), at(301, 201)], {maxZoom: 10})
            .addTo(map);
        expectData(layer, [[301, 201, 1]]);
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
