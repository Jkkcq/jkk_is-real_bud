/**
 * Use weapons that are sitting in the offhand.
 * Spears jab. Swords and axes stay in the offhand without swinging, like Java.
 * A mace in the main hand can still use the offhand.
 */
import { EquipmentSlot, GameMode, system } from "@minecraft/server";
import { cfg } from "../../engine/config.js";
import { onOffhandRightClick } from "../../engine/offhandRightClick.js";
import { mainhandBlocksOffhand } from "./listed_items.js";

const SPEAR_DAMAGE = { wooden: 5, stone: 6, copper: 6, golden: 4, iron: 7, diamond: 8, netherite: 9 };
const lastUse = new Map();

function tierOf(id) {
const match = String(id).match(/(wooden|stone|copper|golden|iron|diamond|netherite)/);
return match ? match[1] : "iron";
}
function weaponProfile(id) {
if (!id) return null;
if (/spear$/.test(id)) return { kind: "spear", reach: 4.5, damage: SPEAR_DAMAGE[tierOf(id)] ?? 7, hits: 2, lunge: 0.22, sound: "item.spear.attack_hit" };
if (id === "minecraft:mace" || /(?:^|:)mace$/.test(id)) return { kind: "mace", reach: 3, damage: 6, hits: 1, lunge: 0, sound: "mace.smash_ground" };
return null;
}
function wear(player, item) {
if (player.getGameMode?.() === GameMode.Creative) return;
try {
const durability = item.getComponent("minecraft:durability");
if (!durability) return;
durability.damage += 1;
const equippable = player.getComponent("minecraft:equippable");
if (durability.damage >= durability.maxDurability) {
equippable?.setEquipment(EquipmentSlot.Offhand, undefined);
try { player.playSound("random.break", { volume: 0.6, pitch: 1 }); } catch {}
return;
}
equippable?.setEquipment(EquipmentSlot.Offhand, item);
} catch {}
}
function jab(player, item, profile) {
const view = player.getViewDirection();
const origin = player.getHeadLocation();
let hits = [];
try {
hits = player.getEntitiesFromViewDirection({ maxDistance: profile.reach });
} catch { hits = []; }
let count = 0;
for (const hit of hits) {
const target = hit?.entity;
if (!target || target.id === player.id) continue;
try {
target.applyDamage(profile.damage, { cause: "entityAttack", damagingEntity: player });
const dx = target.location.x - player.location.x;
const dz = target.location.z - player.location.z;
const len = Math.hypot(dx, dz) || 1;
try { target.applyKnockback({ x: dx / len, z: dz / len }, profile.kind === "spear" ? 0.35 : 0.25); } catch {}
} catch { continue; }
count += 1;
if (count >= profile.hits) break;
}
try {
player.playSound(count > 0 ? profile.sound : "item.spear.attack_miss", { volume: 0.7, pitch: profile.kind === "spear" ? 1 : 0.9 });
} catch {}
if (profile.lunge > 0) {
try { player.applyImpulse({ x: view.x * profile.lunge, y: 0.02, z: view.z * profile.lunge }); } catch {}
}
try {
player.dimension.spawnParticle(count > 0 ? "minecraft:critical_hit_emitter" : "minecraft:basic_smoke_particle", {
x: origin.x + view.x * 1.4,
y: origin.y + view.y * 1.4,
z: origin.z + view.z * 1.4
});
} catch {}
wear(player, item);
return true;
}

onOffhandRightClick((event) => {
const player = event?.player;
if (!player || cfg.offhand_enabled === false) return false;
let offhand;
let mainhand;
try {
const equippable = player.getComponent("minecraft:equippable");
const inventory = player.getComponent("minecraft:inventory")?.container;
offhand = equippable?.getEquipment(EquipmentSlot.Offhand);
mainhand = inventory?.getItem(player.selectedSlotIndex);
} catch { return false; }
const profile = weaponProfile(offhand?.typeId);
if (!profile || mainhandBlocksOffhand(player, mainhand, event)) return false;
const now = Number.isFinite(event.inputTick) ? event.inputTick : system.currentTick;
const last = lastUse.get(player.id) ?? -999;
if (now - last < (profile.kind === "spear" ? 8 : 10)) return true;
lastUse.set(player.id, now);
return jab(player, offhand, profile);
});

try {
system.runInterval(() => {
const now = system.currentTick;
for (const [id, tick] of lastUse) if (now - tick > 80) lastUse.delete(id);
}, 80);
} catch {}
