// MapLibre 11.5.1 and rnmapbox 10.3.17 both generate NativeMapViewModuleSpecJSI.
// Namespace MapLibre's spec to let both native SDKs link in the same app.
// The public runtime module name MLRNMapViewModule remains unchanged.
const fs = require('node:fs');
const path = require('node:path');
const root = path.dirname(require.resolve('@maplibre/maplibre-react-native/package.json'));
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (version !== '11.5.1') throw new Error('Review MapLibre codegen compatibility patch before upgrading.');
const original = path.join(root, 'src/components/map/NativeMapViewModule.ts');
const renamed = path.join(root, 'src/components/map/NativeMLRNMapViewModule.ts');
if (fs.existsSync(original)) fs.renameSync(original, renamed);
if (!fs.existsSync(renamed)) throw new Error('Missing MapLibre native spec.');
for (const file of [
  'src/components/map/Map.tsx',
  'android/src/main/java/org/maplibre/reactnative/components/mapview/MLRNMapViewModule.kt',
  'ios/components/map-view/MLRNMapViewModule.h',
  'ios/components/map-view/MLRNMapViewModule.mm',
]) {
  const location = path.join(root, file);
  const contents = fs.readFileSync(location, 'utf8');
  fs.writeFileSync(location, contents.replaceAll('NativeMapViewModule', 'NativeMLRNMapViewModule'));
}
console.log('MapLibre codegen spec namespaced for Mapbox coexistence.');
