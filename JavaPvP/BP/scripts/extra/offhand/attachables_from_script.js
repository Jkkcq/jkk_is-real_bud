import { Player, world } from "@minecraft/server";
const lastCallCache = new Map();
export function setTempVars(player, data) {
if (!(player instanceof Player) || !data || typeof data !== "object") return;
const playerId = player.id;
const now = Date.now();
const lastCall = lastCallCache.get(playerId);
const forceReset = Object.prototype.hasOwnProperty.call(data, "spam_reset");
if (!forceReset && lastCall && now - lastCall.lastCallTime < 50) {
const unchanged = Object.entries(data).every(([key, value]) => lastCall.lastValues[key] === value);
if (unchanged) return;
}
lastCallCache.set(playerId, {
lastCallTime: now,
lastValues: { ...data },
});
const controllerName = `ctrl_set_${playerId.replace(/[^a-zA-Z0-9]/g, "")}`;
const assignments = Object.entries(data)
.map(([key, value]) => `v.bp_${key}=${JSON.stringify(value)};`)
.join("");
try {
player.playAnimation("animation.sny.dummy_animation", {
controller: controllerName,
stopExpression: `${assignments}return 0;`,
});
} catch (error) {
console.warn("[JPVP] Could not update offhand trident animation variables.", error);
}
}
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
lastCallCache.delete(playerId);
});