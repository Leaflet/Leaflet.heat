import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';
import {playwright} from '@vitest/browser-playwright';

// the leaflet devDependency is 2.0; 1.9 is installed as leaflet-v1, and its package entry is UMD, so use the ESM build
const leaflet1 = fileURLToPath(new URL('node_modules/leaflet-v1/dist/', import.meta.url));

export default defineConfig({
    test: {
        include: ['test/**/*.test.js'],
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            screenshotFailures: false,
            instances: [{browser: 'chromium'}]
        },
        projects: [{
            extends: true,
            test: {name: 'leaflet 2', provide: {leafletVersion: '2.'}}
        }, {
            extends: true,
            resolve: {alias: [
                {find: /^leaflet$/, replacement: `${leaflet1}leaflet-src.esm.js`},
                {find: /^leaflet\/dist\/leaflet\.css$/, replacement: `${leaflet1}leaflet.css`}
            ]},
            test: {name: 'leaflet 1.9', provide: {leafletVersion: '1.9.'}}
        }]
    }
});
