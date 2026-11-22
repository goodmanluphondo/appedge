import assert from "node:assert/strict";
import { test } from "node:test";
import { gatewayHealthUrl, probeGatewayHealth } from "./gateway-health";

const GATEWAY_HOSTNAME = "edge.appedge.site";

function answering(response: Response) {
  const requestedUrls: string[] = [];
  const fetchHealth = async (url: string) => {
    requestedUrls.push(url);
    return response;
  };
  return { fetchHealth, requestedUrls };
}

test("requests the gateway health path over https", async () => {
  const { fetchHealth, requestedUrls } = answering(Response.json({ status: "ok" }));
  await probeGatewayHealth(GATEWAY_HOSTNAME, fetchHealth);
  assert.deepEqual(requestedUrls, ["https://edge.appedge.site/__appedge/health"]);
  assert.equal(gatewayHealthUrl(GATEWAY_HOSTNAME), requestedUrls[0]);
});

test("reports reachable for a 200 health response", async () => {
  const { fetchHealth } = answering(Response.json({ status: "ok", time: "2026-11-22T10:00:00.000Z" }));
  assert.deepEqual(await probeGatewayHealth(GATEWAY_HOSTNAME, fetchHealth), { reachable: true });
});

test("reports the status of a non-200 answer", async () => {
  const { fetchHealth } = answering(new Response("nope", { status: 404 }));
  const health = await probeGatewayHealth(GATEWAY_HOSTNAME, fetchHealth);
  assert.equal(health.reachable, false);
  assert.match(!health.reachable ? health.reason : "", /answered 404/);
});

test("reports a redirect as a failure", async () => {
  const { fetchHealth } = answering(new Response(null, { status: 302, headers: { location: "https://elsewhere.example" } }));
  const health = await probeGatewayHealth(GATEWAY_HOSTNAME, fetchHealth);
  assert.equal(health.reachable, false);
});

test("rejects a 200 that is not the gateway health body", async () => {
  const { fetchHealth } = answering(new Response("<html>welcome</html>", { status: 200 }));
  const health = await probeGatewayHealth(GATEWAY_HOSTNAME, fetchHealth);
  assert.equal(health.reachable, false);
  assert.match(!health.reachable ? health.reason : "", /not served by the AppEdge Gateway/);
});

test("reports a network failure as unreachable", async () => {
  const health = await probeGatewayHealth(GATEWAY_HOSTNAME, async () => {
    throw new TypeError("fetch failed");
  });
  assert.equal(health.reachable, false);
  assert.match(!health.reachable ? health.reason : "", /could not be reached/);
});
