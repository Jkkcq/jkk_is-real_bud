import { world, system } from '@minecraft/server';
import { dp, cfg } from './config.js';
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const getEffect = (e, name) => e.getEffect(name);
const Hunger = p => p.getComponent("player.hunger");
const Sat = p => p.getComponent("player.saturation");
const getHunger = p => Hunger(p)?.currentValue;
const setHunger = (p, n) => Hunger(p)?.setCurrentValue(n);
const getSaturation = p => Sat(p)?.currentValue;
const setSaturation = (p, n) => Sat(p)?.setCurrentValue(n);
const getExtraHealth = p => {
const eff = getEffect(p, "minecraft:health_boost");
return eff ? 4 * (eff.amplifier + 1) : 0;
};
export function checkSaturation(player) {
const enabled = cfg.java_saturation_enabled;
if (!enabled) return;
const speed = cfg.java_saturation_speed;
if (speed <= 0) return;
const healthComp = player.getComponent("health");
const curr = healthComp.currentValue;
const max = healthComp.defaultValue + getExtraHealth(player);
if (curr >= max) return;
const hunger = getHunger(player);
const sat = getSaturation(player);
const healAmt = Math.max(0, Number(cfg.java_saturation_heal_amount ?? 2)) * speed;
const drainAmt = Math.max(0, Number(cfg.java_saturation_drain_amount ?? 2)) * speed;
const hungerThreshold = clamp(Number(cfg.java_saturation_hunger_threshold ?? 18), 10, 20);
if (sat > 0 || hunger > hungerThreshold) {
const newHealth = Math.min(curr + healAmt, max);
healthComp.setCurrentValue(newHealth);
if (sat > 0) {
const newSat = clamp(sat - drainAmt, 0, 20);
setSaturation(player, newSat);
} else {
let newHunger = hunger - drainAmt;
if (hunger > hungerThreshold && newHunger < hungerThreshold) newHunger = hungerThreshold;
newHunger = clamp(newHunger, 0, 20);
setHunger(player, newHunger);
}
player.addTag("heal");
system.runTimeout(() => {
player.removeTag("heal");
}, 5);
}
}
world.afterEvents.itemCompleteUse.subscribe(({ source: player, itemStack: item }) => {
if (item.typeId !== "minecraft:golden_apple") return;
player.removeEffect("absorption");
player.addEffect("absorption", 2400, { amplifier: 0, showParticles: true });
});
world.afterEvents.playerSpawn.subscribe(({ player }) => {
if (getEffect(player, "minecraft:absorption")) {
player.removeEffect("absorption");
player.addEffect("absorption", 2400, { amplifier: 0, showParticles: true });
}
});