import assert from "node:assert/strict";
import { test } from "node:test";
import { handleGatewayResolve, type GatewayResolveDependencies } from "./gateway-resolve-handler";
import { evaluateGatewayRoute, normaliseGatewayHost, type GatewayRouteRow, type NotRoutableReason } from "./gateway-resolve";
import { normaliseOriginUrl } from "./record-validation";

const EXPECTED_TOKEN = "correct-gateway-token";
const FIXED_REQUEST_ID = "generated-request-id";

function routableRow(overrides: Partial<GatewayRouteRow> = {}): GatewayRouteRow {
  return {
    hostname: "portal.example.co.za",
    domain_client_id: "client-1",
    domain_application_id: "application-1",
    ownership_status: "verified",
    dns_status: "verified",
    ssl_status: "active",
    route_id: "route-1",
    route_status: "active",
    route_application_id: "application-1",
    environment: "production",
    published_version: "2026-11-21 10:00:00",
    application_client_id: "client-1",
    application_type: "cloudflare_worker",
    application_status: "active",
    origin_url: "https://partner-portal.example.workers.dev/",
    client_status: "active",
    ...overrides,
  };
}

type Recorder = { lookedUp: string[]; failures: { requestId: string; error: unknown }[] };

function buildDependencies(row: GatewayRouteRow | null | Error, recorder: Recorder = { lookedUp: [], failures: [] }): GatewayResolveDependencies {
  return {
    readExpectedToken: () => EXPECTED_TOKEN,
    findRoute: async (hostname) => {
      recorder.lookedUp.push(hostname);
      if (row instanceof Error) throw row;
      return row;
    },
    generateRequestId: () => FIXED_REQUEST_ID,
    logFailure: (requestId, error) => recorder.failures.push({ requestId, error }),
  };
}

function resolveRequest(query: string, headers: Record<string, string> = { Authorization: `Bearer ${EXPECTED_TOKEN}` }): Request {
  return new Request(`https://app.example.test/api/gateway/resolve${query}`, { headers });
}

test("a missing token is refused with 401 and no detail", async () => {
  const response = await handleGatewayResolve(resolveRequest("?host=portal.example.co.za", {}), buildDependencies(routableRow()));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorised" });
});

test("a wrong token, a wrong scheme and an empty token are indistinguishable from a missing one", async () => {
  const attempts = [`Bearer wrong-token`, `Basic ${EXPECTED_TOKEN}`, `Bearer `, EXPECTED_TOKEN];
  for (const authorisation of attempts) {
    const response = await handleGatewayResolve(resolveRequest("?host=portal.example.co.za", { Authorization: authorisation }), buildDependencies(routableRow()));
    assert.equal(response.status, 401, authorisation);
    assert.deepEqual(await response.json(), { error: "unauthorised" });
  }
});

test("an unauthorised request never reaches the database", async () => {
  const recorder: Recorder = { lookedUp: [], failures: [] };
  await handleGatewayResolve(resolveRequest("?host=portal.example.co.za", { Authorization: "Bearer nope" }), buildDependencies(routableRow(), recorder));
  assert.deepEqual(recorder.lookedUp, []);
});

test("responses are never cached, carry a request id and set no CORS headers", async () => {
  const response = await handleGatewayResolve(resolveRequest("?host=portal.example.co.za"), buildDependencies(routableRow()));
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-request-id"), FIXED_REQUEST_ID);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("content-type"), "application/json");
});

test("a valid incoming request id is echoed and an invalid one is replaced", async () => {
  const echoed = await handleGatewayResolve(resolveRequest("?host=portal.example.co.za", { Authorization: `Bearer ${EXPECTED_TOKEN}`, "X-Request-Id": "gw:abc.123_-" }), buildDependencies(routableRow()));
  assert.equal(echoed.headers.get("x-request-id"), "gw:abc.123_-");
  for (const invalid of ["has space", "a".repeat(129), "bad/slash"]) {
    const replaced = await handleGatewayResolve(resolveRequest("?host=portal.example.co.za", { Authorization: `Bearer ${EXPECTED_TOKEN}`, "X-Request-Id": invalid }), buildDependencies(routableRow()));
    assert.equal(replaced.headers.get("x-request-id"), FIXED_REQUEST_ID, invalid);
  }
});

test("the host is normalised before lookup", async () => {
  const cases: [string, string | null][] = [
    ["  Portal.Example.CO.ZA. ", "portal.example.co.za"],
    ["portal.example.co.za:443", "portal.example.co.za"],
    ["PORTAL.example.co.za.:8443", "portal.example.co.za"],
    ["", null],
    ["   ", null],
    ["nodots", null],
    ["has space.example.co.za", null],
    ["[::1]", null],
    ["[::1]:443", null],
    ["-bad-.example.co.za", null],
    ["a..example.co.za", null],
    [`${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.com`, null],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(normaliseGatewayHost(raw), expected, JSON.stringify(raw));
  }
  assert.equal(normaliseGatewayHost(null), null);
});

test("an invalid or missing host is rejected with 400 and the database is not read", async () => {
  const recorder: Recorder = { lookedUp: [], failures: [] };
  for (const query of ["", "?host=", "?host=%5B%3A%3A1%5D", `?host=${"a".repeat(254)}.com`]) {
    const response = await handleGatewayResolve(resolveRequest(query), buildDependencies(routableRow(), recorder));
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), { error: "invalid_host" });
  }
  assert.deepEqual(recorder.lookedUp, []);
});

test("the normalised host is what is looked up", async () => {
  const recorder: Recorder = { lookedUp: [], failures: [] };
  await handleGatewayResolve(resolveRequest("?host=Portal.Example.co.za.:443"), buildDependencies(routableRow(), recorder));
  assert.deepEqual(recorder.lookedUp, ["portal.example.co.za"]);
});

test("an unknown host is 404 and reveals nothing else", async () => {
  const response = await handleGatewayResolve(resolveRequest("?host=missing.example.co.za"), buildDependencies(null));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "unknown_host" });
});

test("a fully routable domain answers 200 with exactly the contract fields", async () => {
  const response = await handleGatewayResolve(resolveRequest("?host=portal.example.co.za"), buildDependencies(routableRow()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: {
      hostname: "portal.example.co.za",
      client_id: "client-1",
      application_id: "application-1",
      application_type: "cloudflare_worker",
      environment: "production",
      origin_url: "https://partner-portal.example.workers.dev/",
      route_version: "2026-11-21 10:00:00",
    },
  });
});

test("a route that has never been versioned returns a null route_version", async () => {
  const response = await handleGatewayResolve(resolveRequest("?host=portal.example.co.za"), buildDependencies(routableRow({ published_version: null })));
  const body = await response.json() as { data: { route_version: string | null } };
  assert.equal(body.data.route_version, null);
});

const REASON_CASES: [NotRoutableReason, Partial<GatewayRouteRow>][] = [
  ["ownership_pending", { ownership_status: "pending" }],
  ["ownership_pending", { ownership_status: "failed" }],
  ["dns_pending", { dns_status: "pending" }],
  ["dns_pending", { dns_status: "failed" }],
  ["ssl_pending", { ssl_status: "pending" }],
  ["ssl_pending", { ssl_status: "failed" }],
  ["route_missing", { route_id: null, route_status: null, route_application_id: null, application_status: null, origin_url: null, environment: null, application_type: null, published_version: null, application_client_id: null }],
  ["route_inactive", { route_status: "draft" }],
  ["route_inactive", { route_status: "disabled" }],
  ["application_inactive", { application_status: "draft" }],
  ["application_inactive", { application_status: "disabled" }],
  ["no_origin", { origin_url: null }],
  ["client_archived", { client_status: "archived" }],
  ["route_mismatch", { route_application_id: "application-2" }],
  ["route_mismatch", { application_client_id: "client-2" }],
];

test("every not_routable reason is answered with 409 and only the reason", async () => {
  for (const [reason, overrides] of REASON_CASES) {
    const response = await handleGatewayResolve(resolveRequest("?host=portal.example.co.za"), buildDependencies(routableRow(overrides)));
    assert.equal(response.status, 409, reason);
    assert.deepEqual(await response.json(), { error: "not_routable", reason }, JSON.stringify(overrides));
  }
});

test("when several conditions fail the first reason in the stated order wins", () => {
  const everythingWrong = routableRow({
    ownership_status: "pending",
    dns_status: "pending",
    ssl_status: "pending",
    route_status: "draft",
    application_status: "draft",
    origin_url: null,
    client_status: "archived",
    route_application_id: "application-2",
  });
  const order: NotRoutableReason[] = [
    "ownership_pending",
    "dns_pending",
    "ssl_pending",
    "route_inactive",
    "application_inactive",
    "no_origin",
    "client_archived",
    "route_mismatch",
  ];
  const repairs: Partial<GatewayRouteRow>[] = [
    { ownership_status: "verified" },
    { dns_status: "verified" },
    { ssl_status: "active" },
    { route_status: "active" },
    { application_status: "active" },
    { origin_url: "https://partner-portal.example.workers.dev/" },
    { client_status: "active" },
  ];
  let row = everythingWrong;
  order.forEach((expectedReason, index) => {
    assert.deepEqual(evaluateGatewayRoute(row), { kind: "not_routable", reason: expectedReason });
    if (index < repairs.length) row = { ...row, ...repairs[index] };
  });
  assert.deepEqual(evaluateGatewayRoute({ ...row, route_application_id: "application-1" }).kind, "routable");
});

test("a domain whose client differs from its application's client is never routable", () => {
  const resolution = evaluateGatewayRoute(routableRow({ domain_client_id: "client-1", application_client_id: "client-2" }));
  assert.deepEqual(resolution, { kind: "not_routable", reason: "route_mismatch" });
});

test("an unsafe origin_url is answered as no_origin and is never returned", async () => {
  const unsafeOrigins = [
    "http://partner.example.com/",
    "https://user:secret@partner.example.com/",
    "https://partner.example.com/?token=1",
    "https://partner.example.com/#fragment",
    "https://127.0.0.1/",
    "https://10.0.0.5:8443/",
    "https://[::1]/",
    "https://localhost/",
    "https://service.local/",
    "https://service.internal/",
    "https://service.INTERNAL./",
    "/relative/path",
    "not a url",
    "https://nodots/",
  ];
  for (const origin of unsafeOrigins) {
    const response = await handleGatewayResolve(resolveRequest("?host=portal.example.co.za"), buildDependencies(routableRow({ origin_url: origin })));
    assert.equal(response.status, 409, origin);
    assert.deepEqual(await response.json(), { error: "not_routable", reason: "no_origin" }, origin);
  }
});

test("the origin validator accepts public https origins and rejects the unsafe ones when saving", () => {
  assert.equal(normaliseOriginUrl("https://members-origin.example.co.za"), "https://members-origin.example.co.za/");
  assert.equal(normaliseOriginUrl("https://app.example.workers.dev:8443/base"), "https://app.example.workers.dev:8443/base");
  assert.equal(normaliseOriginUrl("http://app.example.com"), null);
  assert.equal(normaliseOriginUrl("https://a.example.com/?"), null);
  assert.equal(normaliseOriginUrl("https://192.168.0.1"), null);
  assert.equal(normaliseOriginUrl(""), null);
});

test("a database failure is 500, logged with the request id, and leaks nothing", async () => {
  const recorder: Recorder = { lookedUp: [], failures: [] };
  const failure = new Error("D1_ERROR: sensitive detail");
  const response = await handleGatewayResolve(resolveRequest("?host=portal.example.co.za"), buildDependencies(failure, recorder));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "internal_error" });
  assert.deepEqual(recorder.failures, [{ requestId: FIXED_REQUEST_ID, error: failure }]);
});

test("a missing GATEWAY_API_TOKEN configuration is 500 rather than an open endpoint", async () => {
  const recorder: Recorder = { lookedUp: [], failures: [] };
  const dependencies: GatewayResolveDependencies = {
    ...buildDependencies(routableRow(), recorder),
    readExpectedToken: () => {
      throw new Error("GATEWAY_API_TOKEN is not set.");
    },
  };
  const response = await handleGatewayResolve(resolveRequest("?host=portal.example.co.za", {}), dependencies);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "internal_error" });
  assert.equal(recorder.failures.length, 1);
});
