import { world, system, EquipmentSlot } from "@minecraft/server";
const SLOTS = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet];
const CHANNEL_TAG = "PYROWS";
const NUM_WIDTH = 5;
const NUM_PAD = "0";
const MAT_WIDTH = 2;
const WARN_THRESHOLD = 0.20;
const WARN_SOUND_COOLDOWN = 100;
const lastPayload = new Map();
const lastSentTick = new Map();
const lastWarnTick = new Map();
const RESEND_TICKS = 40;
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
lastPayload.delete(playerId);
lastSentTick.delete(playerId);
lastWarnTick.delete(playerId);
});
const MATERIAL_IDS = {
"minecraft:leather_helmet": 14, "minecraft:leather_chestplate": 14,
"minecraft:leather_leggings": 14, "minecraft:leather_boots": 14,
"minecraft:chainmail_helmet": 1, "minecraft:chainmail_chestplate": 1,
"minecraft:chainmail_leggings": 1, "minecraft:chainmail_boots": 1,
"minecraft:iron_helmet": 2, "minecraft:iron_chestplate": 2,
"minecraft:iron_leggings": 2, "minecraft:iron_boots": 2,
"minecraft:golden_helmet": 3, "minecraft:golden_chestplate": 3,
"minecraft:golden_leggings": 3, "minecraft:golden_boots": 3,
"minecraft:diamond_helmet": 4, "minecraft:diamond_chestplate": 4,
"minecraft:diamond_leggings": 4, "minecraft:diamond_boots": 4,
"minecraft:netherite_helmet": 5, "minecraft:netherite_chestplate": 5,
"minecraft:netherite_leggings": 5, "minecraft:netherite_boots": 5,
"minecraft:carved_pumpkin": 6,
"minecraft:turtle_helmet": 7,
"minecraft:skeleton_skull": 8,
"minecraft:wither_skeleton_skull": 9,
"minecraft:zombie_head": 10,
"minecraft:creeper_head": 11,
"minecraft:player_head": 12,
"minecraft:copper_helmet": 13, "minecraft:copper_chestplate": 13,
"minecraft:copper_leggings": 13, "minecraft:copper_boots": 13,
};
function packNum(n) {
return n.toString().padStart(NUM_WIDTH, NUM_PAD).slice(-NUM_WIDTH);
}
function packMaterial(n) {
return n.toString().padStart(MAT_WIDTH, "0").slice(-MAT_WIDTH);
}
function encodeSlot(equippable, slot) {
const stack = equippable.getEquipment(slot);
const dur = stack ? stack.getComponent("minecraft:durability") : undefined;
const present = stack ? 1 : 0;
const material = stack ? (MATERIAL_IDS[stack.typeId] ?? 0) : 0;
const current = dur ? Math.max(0, dur.maxDurability - dur.damage) : 0;
const max = dur ? dur.maxDurability : 0;
return present.toString() + packMaterial(material) + packNum(current) + packNum(max);
}
function buildPayload(player) {
const equippable = player.getComponent("minecraft:equippable");
if (!equippable) return "";
let payload = CHANNEL_TAG;
let anyLow = false;
for (const slot of SLOTS) {
payload += encodeSlot(equippable, slot);
try {
const stack = equippable.getEquipment(slot);
const dur = stack?.getComponent?.("minecraft:durability");
if (dur && dur.maxDurability > 0) {
const pct = (dur.maxDurability - dur.damage) / dur.maxDurability;
if (pct <= WARN_THRESHOLD) anyLow = true;
}
} catch {}
}
payload += anyLow ? "1" : "0";
return payload;
}
function maybeWarn(player, payload) {
if (!payload || payload[payload.length - 1] !== "1") return;
const now = system.currentTick;
const last = lastWarnTick.get(player.id) ?? -9999;
if (now - last < WARN_SOUND_COOLDOWN) return;
lastWarnTick.set(player.id, now);
try {
player.playSound("random.anvil_land", { volume: 0.15, pitch: 1.6 });
} catch {
try { player.playSound("note.pling", { volume: 0.2, pitch: 0.5 }); } catch {}
}
}
system.runInterval(() => {
for (const player of world.getPlayers()) {
try { player.runCommand(`titleraw @s times 0 0 0`); } catch {}
}
}, 100);
system.runInterval(() => {
for (const player of world.getPlayers()) {
try {
let enabled = true;
try {
const serverOn = world.getDynamicProperty("armor_hud_server");
const playerOn = player.getDynamicProperty("armor_hud");
if (serverOn === false || playerOn === false) enabled = false;
} catch {}
if (!enabled) continue;
const payload = buildPayload(player);
if (!payload) continue;
const now = system.currentTick;
const unchanged = lastPayload.get(player.id) === payload;
if (unchanged && now - (lastSentTick.get(player.id) ?? 0) < RESEND_TICKS) continue;
lastPayload.set(player.id, payload);
lastSentTick.set(player.id, now);
player.runCommand(`titleraw @s title {"rawtext":[{"text":"${payload}"}]}`);
maybeWarn(player, payload);
} catch (e) {
}
}
}, 5);