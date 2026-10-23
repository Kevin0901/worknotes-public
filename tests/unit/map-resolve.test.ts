import assert from "node:assert/strict";
const { resolveShortMapLink } = await import("../../src/lib/map-resolve");

const fake = (routes: Record<string, { status: number; location?: string }>) => {
  const calls: string[] = [];
  const f = (async (u: URL | string) => {
    const key = String(u);
    calls.push(key);
    const r = routes[key] ?? { status: 404 };
    return new Response(null, { status: r.status, headers: r.location ? { location: r.location } : {} });
  }) as unknown as typeof fetch;
  return { f, calls };
};

let t = fake({
  "https://maps.app.goo.gl/abc": { status: 302, location: "https://www.google.com/maps/place/Taipei+101/@25.0339639,121.5618973,17z/data=!3d25.0339639!4d121.5644722" },
});
assert.equal(await resolveShortMapLink("https://maps.app.goo.gl/abc", t.f), "https://www.google.com/maps/place/Taipei+101/@25.0339639,121.5618973,17z/data=!3d25.0339639!4d121.5644722");

// 不在允許網域的轉址要停止（SSRF）
t = fake({ "https://maps.app.goo.gl/evil": { status: 302, location: "http://169.254.169.254/latest/meta-data" } });
assert.equal(await resolveShortMapLink("https://maps.app.goo.gl/evil", t.f), null);
assert.equal(t.calls.length, 1);
t = fake({ "https://maps.app.goo.gl/evil2": { status: 302, location: "https://attacker.example/x" } });
assert.equal(await resolveShortMapLink("https://maps.app.goo.gl/evil2", t.f), null);

// 同意頁面：取 continue
t = fake({
  "https://maps.app.goo.gl/eu": {
    status: 302,
    location: "https://consent.google.com/ml?continue=" + encodeURIComponent("https://www.google.com/maps/@24.78,120.99,15z"),
  },
});
assert.equal(await resolveShortMapLink("https://maps.app.goo.gl/eu", t.f), "https://www.google.com/maps/@24.78,120.99,15z");
t = fake({ "https://maps.app.goo.gl/eu2": { status: 302, location: "https://consent.google.com/ml?continue=" + encodeURIComponent("https://evil.example/") } });
assert.equal(await resolveShortMapLink("https://maps.app.goo.gl/eu2", t.f), null);

// 非短網址直接拒絕、不發出請求
t = fake({});
assert.equal(await resolveShortMapLink("https://evil.example/", t.f), null);
assert.equal(t.calls.length, 0);
// 迴圈轉址最多 5 次
t = fake({ "https://maps.app.goo.gl/loop": { status: 302, location: "https://maps.app.goo.gl/loop" } });
assert.equal(await resolveShortMapLink("https://maps.app.goo.gl/loop", t.f), null);
assert.ok(t.calls.length <= 5);
console.log("resolver tests passed");
