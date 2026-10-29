import { world } from '@minecraft/server';
import { isWearingNetheriteArmor } from '../engine/knockback.js';
import { cfg } from '../engine/config.js';
world.afterEvents.projectileHitBlock.subscribe(event => {
const { projectile, source, location } = event;
if (!projectile) return;
if (projectile.typeId !== "minecraft:wind_charge_projectile") return;
if (!location) return;
if (cfg.wind_changes_enabled === false) return;
const attackerLoc = location;
const windBoost = Math.max(0, Number(cfg.wind_boost_multiplier ?? 1)) * Math.max(0, Number(cfg.wind_burst_multiplier ?? 1));
const dimension = source?.dimension ?? world.getDimension("overworld");
const nearbyPlayers = dimension.getEntities({
type: "minecraft:player",
location: attackerLoc,
maxDistance: 2.45,
});
for (const player of nearbyPlayers) {
if (isWearingNetheriteArmor(player) && cfg.bedrock_wind_charge_enabled !== false) {
player.applyKnockback({ x: 0, z: 0 }, 1.7 * windBoost);
} else if (windBoost > 1) {
player.applyKnockback({ x: 0, z: 0 }, windBoost);
}
}
});