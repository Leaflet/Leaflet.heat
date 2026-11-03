import {defineConfig} from 'rolldown';
import pkg from '../package.json' with {type: 'json'};

const banner = `/* @preserve
 * Leaflet.heat ${pkg.version}, a tiny and fast Leaflet heatmap plugin. https://github.com/Leaflet/Leaflet.heat
 * (c) 2014-${new Date().getFullYear()} Volodymyr Agafonkin
 */`;

/** @type {import('rolldown').OutputOptions} */
const commonOptions = {
    postBanner: banner,
    minify: true,
    comments: false,
    sourcemap: true
};

// keep the minifier from emitting syntax newer than what the sources may use
const transform = {target: 'es2022'};

export default defineConfig([
    {
        input: './src/HeatLayer.js',
        external: ['leaflet'],
        transform,
        output: {
            ...commonOptions,
            file: './dist/leaflet-heat.js'
        }
    },
    {
        input: './build/global.js',
        external: ['leaflet'],
        transform,
        output: {
            ...commonOptions,
            file: './dist/leaflet-heat-global.js',
            format: 'iife',
            globals: {leaflet: 'L'}
        }
    }
]);
