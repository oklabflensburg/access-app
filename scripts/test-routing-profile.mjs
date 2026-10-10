import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";

const container = `accessapp-routing-profile-test-${process.pid}`;
const fixtures = fileURLToPath(new URL("../backend/routing/tests", import.meta.url));
const config = fileURLToPath(new URL("../backend/routing/graphhopper.yml", import.meta.url));
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8" }).trim();
let started = false;

try {
  // Load the production profile/config, with only test data, storage and one
  // additional speed attribute for the fastest-route comparison overridden.
  docker("run", "--detach", "--name", container,
    "--publish", "127.0.0.1::8989",
    "--mount", `type=bind,source=${fixtures},target=/fixtures,readonly`,
    "--mount", `type=bind,source=${config},target=/app/graphhopper.yml,readonly`,
    "--entrypoint", "java", "accessapp-graphhopper:11.1", "-Xmx512m",
    "-Ddw.graphhopper.datareader.file=/fixtures/shortest.osm",
    "-Ddw.graphhopper.prepare.min_network_size=0",
    "-Ddw.graphhopper.graph.encoded_values=foot_access,foot_average_speed,foot_road_access,hike_rating,country,road_class",
    "-jar", "/app/graphhopper.jar", "server", "/app/graphhopper.yml");
  started = true;
  const baseUrl = `http://${docker("port", container, "8989/tcp")}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    assert.equal(docker("inspect", "--format", "{{.State.Running}}", container), "true", "GraphHopper exited during import");
    try {
      const response = await fetch(`${baseUrl}/info`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Expected while the tiny graph is importing. */ }
    await setTimeout(1000);
  }
  assert(ready, "GraphHopper did not become ready within 60 seconds");

  async function route(extra = {}) {
    const response = await fetch(`${baseUrl}/route`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        points: [[9.4300, 54.7800], [9.4330, 54.7800]],
        profile: "foot_shortest", points_encoded: false, instructions: false,
        ...extra,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body.paths[0];
  }

  const shortest = await route();
  const fastest = await route({
    "ch.disable": true,
    custom_model: { speed: [{ if: "true", limit_to: "foot_average_speed" }], distance_influence: 0 },
  });
  assert(shortest.distance > 180 && shortest.distance < 210, "Expected the direct stairs");
  assert(shortest.points.coordinates.every(([, lat]) => Math.abs(lat - 54.78) < 0.00001));
  assert(fastest.points.coordinates.some(([, lat]) => lat > 54.7805), "Expected the faster footway detour");
  assert(shortest.distance < fastest.distance, "The production profile must minimize distance, not time");
  const wheelchair = await route({ profile: "foot_wheelchair" });
  assert(wheelchair.points.coordinates.some(([, lat]) => lat > 54.7805), "Expected the wheelchair profile to avoid the stairs");
  assert(wheelchair.distance > shortest.distance, "The wheelchair profile must detour around steps");
  console.log(`Routing profile passed: shortest ${shortest.distance} m; fastest walking detour ${fastest.distance} m; wheelchair detour ${wheelchair.distance} m.`);

  // Only this temporary fixture container is affected. --help runs the
  // entrypoint's backup logic without starting a second GraphHopper server.
  const rebuildOutput = docker("exec", "--env", "GRAPHHOPPER_REBUILD_GRAPH=true",
    container, "/app/entrypoint.sh", "--help");
  const backup = rebuildOutput.match(/Previous graph retained at (\/data\/graph-backup\.[A-Za-z0-9]+\/graph-cache)/)?.[1];
  assert(backup, "Explicit rebuild must report the retained graph's location");
  docker("exec", container, "test", "-f", `${backup}/properties`);
  docker("exec", container, "test", "!", "-d", "/data/graph-cache");
  docker("exec", container, "mkdir", "/data/graph-cache");
  docker("exec", container, "/app/entrypoint.sh", "--help");
  docker("exec", container, "test", "-d", "/data/graph-cache");
  console.log("Rebuild backup passed; normal startup preserves the cache.");
} catch (error) {
  if (started) console.error(docker("logs", container));
  throw error;
} finally {
  if (started) docker("rm", "--force", container);
}
