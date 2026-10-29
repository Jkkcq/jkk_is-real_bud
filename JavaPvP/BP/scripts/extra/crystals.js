import { world, system } from "@minecraft/server";
import { cfg } from '../engine/config.js';
world.afterEvents.entitySpawn.subscribe((event) => {
const entity = event.entity;
if (entity.typeId !== "minecraft:ender_crystal") return;
if (cfg.auto_crystal_enabled) {
const configuredDelay = Math.max(0, Math.min(20, Number(cfg.auto_crystal_delay_ticks ?? 0)));
const delay = Math.floor(configuredDelay) + (Math.random() < configuredDelay % 1 ? 1 : 0);
if (delay === 0) {
entity.triggerEvent('minecraft:crystal_explode');
} else {
system.runTimeout(() => {
try { if (entity?.isValid) entity.triggerEvent('minecraft:crystal_explode'); } catch { }
}, delay);
}
}
});