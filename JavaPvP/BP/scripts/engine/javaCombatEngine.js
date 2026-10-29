import { system, world } from "@minecraft/server";
import { getPlayerState, hasStateTag } from "./states.js";
import { cfg } from "./config.js";
export const ATTACK_SPEED = Object.freeze({
sword: 1.6,
trident: 1.1,
mace: 0.6,
shovel: 1.0,
pickaxe: 1.2,
hoe_wood_gold: 1.0,
hoe_stone: 2.0,
hoe_iron: 3.0,
hoe_diamond_netherite: 4.0,
axe_wood_stone_copper: 0.8,
axe_iron: 0.9,
axe_gold_diamond_netherite: 1.0,
spear: 1.0,
fist: 4.0,
});
export const JAVA_SPECIAL_MIN_P = 0.848;
export function javaEngineEnabled() {
try {
if (cfg.java_combat_engine === false) return false;
if (cfg.java_combat_engine === true) return true;
const v = world.getDynamicProperty("java_combat_engine");
return v !== false;
} catch {
return true;
}
}
export function getJavaAttackSpeed(item) {
if (!item) return ATTACK_SPEED.fist;
const id = item.typeId || "";
try {
if (item.hasTag?.("minecraft:is_sword") || /_sword$/.test(id)) return ATTACK_SPEED.sword;
if (item.hasTag?.("minecraft:is_trident") || id.includes("trident")) return ATTACK_SPEED.trident;
if (id === "minecraft:mace") return ATTACK_SPEED.mace;
if (item.hasTag?.("minecraft:is_spear") || /spear$/.test(id)) return ATTACK_SPEED.spear;
if (item.hasTag?.("minecraft:is_shovel") || /_shovel$/.test(id)) return ATTACK_SPEED.shovel;
if (item.hasTag?.("minecraft:is_pickaxe") || /_pickaxe$/.test(id)) return ATTACK_SPEED.pickaxe;
if (item.hasTag?.("minecraft:is_hoe") || /_hoe$/.test(id)) {
if (id.includes("wooden") || id.includes("golden")) return ATTACK_SPEED.hoe_wood_gold;
if (id.includes("stone") || id.includes("copper")) return ATTACK_SPEED.hoe_stone;
if (id.includes("iron")) return ATTACK_SPEED.hoe_iron;
return ATTACK_SPEED.hoe_diamond_netherite;
}
if (item.hasTag?.("minecraft:is_axe") || /_axe$/.test(id)) {
if (id.includes("wooden") || id.includes("stone") || id.includes("copper")) return ATTACK_SPEED.axe_wood_stone_copper;
if (id.includes("iron")) return ATTACK_SPEED.axe_iron;
return ATTACK_SPEED.axe_gold_diamond_netherite;
}
} catch {}
return ATTACK_SPEED.fist;
}
export function getExactCooldownT(item) {
const speed = getJavaAttackSpeed(item);
try {
if (item) {
const id = item.typeId || "";
let override;
if (item.hasTag?.("minecraft:is_sword") || /_sword$/.test(id)) override = cfg.cooldown_sword;
else if (item.hasTag?.("minecraft:is_axe") || /_axe$/.test(id)) {
if (id.includes("iron")) override = cfg.cooldown_axe_iron;
else if (id.includes("wooden") || id.includes("stone") || id.includes("copper")) override = cfg.cooldown_axe_light;
else override = cfg.cooldown_axe_heavy;
} else if (id === "minecraft:mace") override = cfg.cooldown_mace;
else if (item.hasTag?.("minecraft:is_trident") || id.includes("trident")) override = cfg.cooldown_trident;
const n = Number(override);
if (Number.isFinite(n) && n >= 4 && n <= 60) return n;
}
} catch {}
return 20 / Math.max(0.05, speed);
}
export function getJavaCooldownTicks(item) {
return Math.max(1, Math.ceil(getExactCooldownT(item) - 1e-9));
}
export function getJavaProgress(player, item) {
if (!player) return 1;
if (item?.typeId === "minecraft:mace" && hasStateTag(player, "mace_swap_ignore")) {
return 1;
}
const state = getPlayerState(player);
const cd = state.cooldown;
if (!cd) return 1;
const now = system.currentTick;
const exactT = Number(cd.exactT) > 0 ? Number(cd.exactT) : getExactCooldownT(item);
const start = Number.isFinite(cd.startTick)
? cd.startTick
: (cd.endTick - (cd.duration || exactT));
const t = now - start;
if (t < 0) return 0;
return Math.min(1, Math.max(0, (t + 0.5) / exactT));
}
export function getJavaProgressPercent(player, item) {
return getJavaProgress(player, item) * 100;
}
export function javaBaseDamageFactor(p) {
const x = Math.min(1, Math.max(0, p));
return 0.2 + 0.8 * x * x;
}
export function javaEnchantDamageFactor(p) {
return Math.min(1, Math.max(0, p));
}
export function javaCanSpecialAttack(p) {
return p >= JAVA_SPECIAL_MIN_P - 1e-9;
}
export function javaSharpnessBonus(level) {
const L = Number(level) || 0;
if (L <= 0) return 0;
return 0.5 * L + 0.5;
}
export function javaStrengthBonus(amplifierPlusOne) {
const L = Number(amplifierPlusOne) || 0;
return L > 0 ? 3 * L : 0;
}
export function javaWeaknessPenalty(amplifierPlusOne) {
const L = Number(amplifierPlusOne) || 0;
return L > 0 ? 4 * L : 0;
}
export function startJavaCooldown(player, item) {
if (!player) return;
const exactT = getExactCooldownT(item);
const ticks = Math.max(1, Math.ceil(exactT - 1e-9));
const state = getPlayerState(player);
const now = system.currentTick;
state.cooldown = {
startTick: now,
exactT,
duration: ticks,
endTick: now + ticks,
};
}
export function bindJavaItemSwapReset() {
try {
world.afterEvents.playerHotbarSelectedSlotChange.subscribe((event) => {
if (!javaEngineEnabled()) return;
const player = event.player;
if (!player) return;
let item = event.itemStack;
try {
if (!item) {
item = player.getComponent("inventory")?.container?.getItem(event.newSlotSelected);
}
} catch {}
startJavaCooldown(player, item);
});
} catch {}
}
bindJavaItemSwapReset();