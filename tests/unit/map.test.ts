import assert from "node:assert/strict";
import { parseCoordinates, parseMapBlock, serializeMapBlock, placeQuery, isShortMapLink } from "../../src/lib/map";

const near = (a: any, lat: number, lng: number, zoom?: number) => {
  assert.ok(a, "應該解析出座標");
  assert.ok(Math.abs(a.lat - lat) < 1e-6 && Math.abs(a.lng - lng) < 1e-6, JSON.stringify(a));
  if (zoom !== undefined) assert.equal(a.zoom, zoom);
};
near(parseCoordinates("25.033964, 121.564468"), 25.033964, 121.564468);
near(parseCoordinates("25.033964 121.564468"), 25.033964, 121.564468);
near(parseCoordinates("25.0339，121.5644"), 25.0339, 121.5644);
near(parseCoordinates("https://www.google.com/maps/@25.0339639,121.5644722,17z?entry=ttu"), 25.0339639, 121.5644722, 17);
near(parseCoordinates("https://www.google.com/maps/place/%E5%8F%B0%E5%8C%97101/@25.0339639,121.5618973,17z/data=!3m1!4b1!4m6!3m5!1s0x3442abb6da9c9e1f:0x1206bcf082fd10a6!8m2!3d25.0339639!4d121.5644722!16s"), 25.0339639, 121.5644722);
near(parseCoordinates("https://maps.google.com/?q=24.7869,120.9968"), 24.7869, 120.9968);
near(parseCoordinates("https://www.google.com/maps/search/?api=1&query=22.6273%2C120.3014"), 22.6273, 120.3014);
near(parseCoordinates("https://www.google.com/maps/dir/?api=1&destination=25.1,121.2"), 25.1, 121.2);
near(parseCoordinates("https://maps.apple.com/?ll=25.04,121.53&q=Office"), 25.04, 121.53);
near(parseCoordinates("https://www.openstreetmap.org/?mlat=25.03&mlon=121.56#map=18/25.03/121.56"), 25.03, 121.56);
near(parseCoordinates("https://www.openstreetmap.org/#map=15/24.1477/120.6736"), 24.1477, 120.6736, 15);
assert.equal(parseCoordinates("台北101"), null);
assert.equal(parseCoordinates("100, 200"), null);
assert.equal(parseCoordinates(""), null);

const d = parseMapBlock("lat: 25.033964\nlng: 121.564468\nzoom: 16\ntitle: 台北 101\naddress: 信義路五段 7 號");
assert.deepEqual(d, { lat: 25.033964, lng: 121.564468, zoom: 16, title: "台北 101", address: "信義路五段 7 號" });
assert.deepEqual(parseMapBlock(serializeMapBlock(d!)), d);
assert.equal(parseMapBlock("lat: 95\nlng: 10"), null);
assert.equal(parseMapBlock("hello"), null);
assert.equal(parseMapBlock("lat: 25\nlng: 121\nzoom: 99")!.zoom, 16);
assert.equal(serializeMapBlock({ lat: 1.23456789, lng: 2, zoom: 10, title: "a\nb", address: "" }), "lat: 1.234568\nlng: 2\nzoom: 10\ntitle: a b");
assert.equal(placeQuery("https://www.google.com/maps/place/%E5%8F%B0%E5%8C%97101/data=!4m2"), "台北101");
assert.equal(placeQuery("https://maps.google.com/?q=Taipei+101"), "Taipei 101");
assert.equal(isShortMapLink("https://maps.app.goo.gl/AbCdEf123"), true);
assert.equal(isShortMapLink("https://goo.gl/maps/xyz"), true);
assert.equal(isShortMapLink("https://evil.com/maps.app.goo.gl"), false);
assert.equal(isShortMapLink("http://maps.app.goo.gl/x"), false);
console.log("map tests passed");
