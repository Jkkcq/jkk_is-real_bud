import { world, system, EquipmentSlot, ItemStack } from "@minecraft/server";
import { cfg } from '../engine/config.js';
const Hunger = p => p.getComponent("player.hunger");
const Sat = p => p.getComponent("player.saturation");
const getHunger = p => Hunger(p)?.currentValue;
const setHunger = (p, n) => Hunger(p)?.setCurrentValue(n);
const getSaturation = p => Sat(p)?.currentValue;
const setSaturation = (p, n) => Sat(p)?.setCurrentValue(n);
const SPEAR_MAP = {
"minecraft:netherite_spear": "bf:netherite_spear",
"bf:netherite_spear": "minecraft:netherite_spear",
"minecraft:diamond_spear": "bf:diamond_spear",
"bf:diamond_spear": "minecraft:diamond_spear",
"minecraft:golden_spear": "bf:golden_spear",
"bf:golden_spear": "minecraft:golden_spear",
"minecraft:iron_spear": "bf:iron_spear",
"bf:iron_spear": "minecraft:iron_spear",
"minecraft:copper_spear": "bf:copper_spear",
"bf:copper_spear": "minecraft:copper_spear",
"minecraft:stone_spear": "bf:stone_spear",
"bf:stone_spear": "minecraft:stone_spear",
"minecraft:wooden_spear": "bf:wooden_spear",
"bf:wooden_spear": "minecraft:wooden_spear"
};
const activeSwings = new Map();
world.afterEvents.playerSwingStart.subscribe((event) => {
if (!cfg.spear_aptitude_enabled) return;
const player = event.player;
const equippable = player.getComponent("minecraft:equippable");
const item = equippable?.getEquipment(EquipmentSlot.Mainhand);
const lungeLevel = item?.getComponent("enchantable")?.getEnchantments().find(e => e.type.id === "lunge")?.level || 0;
if (!item || !SPEAR_MAP[item.typeId]) return;
activeSwings.set(player.id, {
originalSlot: player.selectedSlotIndex,
data: serializeItemData(item),
startTime: system.currentTick,
lungeLevel: lungeLevel
});
});
world.afterEvents.playerHotbarSelectedSlotChange.subscribe((event) => {
const player = event.player;
const swing = activeSwings.get(player.id);
if (!swing) return;
if (system.currentTick - swing.startTime > (cfg.spear_aptitude_swap_window ?? 2)) {
activeSwings.delete(player.id);
return;
}
if (event.slot !== swing.originalSlot) {
const inventory = player.getComponent("minecraft:inventory")?.container;
if (!inventory) { activeSwings.delete(player.id); return; }
const newTypeId = SPEAR_MAP[swing.data.typeId];
try {
const newItemStack = new ItemStack(newTypeId, 1);
applyItemData(newItemStack, swing.data);
inventory.setItem(swing.originalSlot, newItemStack);
if (swing.lungeLevel > 0 && cfg.spear_aptitude_hunger_reset) {
const cost = swing.lungeLevel;
const sat = getSaturation(player) ?? 0
const hunger = getHunger(player) ?? 0;
if (hunger <= 6) return;
const remainingSatCap = 20 - sat;
if (remainingSatCap >= cost) {
setSaturation(player, sat + cost);
} else {
setSaturation(player, 20);
setHunger(player, Math.min(20, (getHunger(player) ?? 0) + (cost - remainingSatCap)));
}
}
} catch (e) { }
activeSwings.delete(player.id);
}
});
function serializeItemData(item) {
const enchantable = item.getComponent("minecraft:enchantable");
const durability = item.getComponent("minecraft:durability");
return {
typeId: item.typeId,
nameTag: item.nameTag,
lore: item.getLore(),
enchantments: enchantable ? enchantable.getEnchantments().map(en => ({ type: en.type, level: en.level })) : [],
damage: durability ? durability.damage : 0
};
}
function applyItemData(item, data) {
if (data.nameTag) item.nameTag = data.nameTag;
item.setLore(data.lore);
const enchantable = item.getComponent("minecraft:enchantable");
if (enchantable && data.enchantments.length > 0) {
for (const enData of data.enchantments) {
try { enchantable.addEnchantment(enData); } catch (e) {}
}
}
const durability = item.getComponent("minecraft:durability");
if (durability) {
durability.damage = data.damage;
}
}
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
activeSwings.delete(playerId);
});
const SPEAR_IDS = new Set([
"minecraft:wooden_spear", "minecraft:stone_spear", "minecraft:copper_spear",
"minecraft:iron_spear", "minecraft:golden_spear", "minecraft:diamond_spear", "minecraft:netherite_spear",
"bf:wooden_spear", "bf:stone_spear", "bf:copper_spear",
"bf:iron_spear", "bf:golden_spear", "bf:diamond_spear", "bf:netherite_spear",
]);
function isSpearId(id) { return Boolean(id) && (SPEAR_IDS.has(id) || /(?:^|:)\w+_spear$/.test(id)); }
const offhandSpearUsing = new Set();
function offhandIsSpear(player) {
try {
const eq = player.getComponent("minecraft:equippable");
const off = eq?.getEquipment(EquipmentSlot.Offhand);
return isSpearId(off?.typeId);
} catch { return false; }
}
try {
world.afterEvents.itemStartUse.subscribe((ev) => {
try {
const player = ev.source;
if (!player || player.typeId !== "minecraft:player") return;
if (!isSpearId(ev.itemStack?.typeId)) return;
if (!offhandIsSpear(player)) return;
offhandSpearUsing.add(player.id);
} catch {}
});
} catch {}
try {
world.afterEvents.itemStopUse.subscribe((ev) => {
try {
const player = ev.source;
if (player) offhandSpearUsing.delete(player.id);
} catch {}
});
} catch {}
try {
world.afterEvents.itemCompleteUse.subscribe((ev) => {
try {
const player = ev.source;
if (player) offhandSpearUsing.delete(player.id);
} catch {}
});
} catch {}
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
offhandSpearUsing.delete(playerId);
});
system.runInterval(() => {
if (offhandSpearUsing.size === 0) return;
for (const player of world.getPlayers()) {
if (!offhandSpearUsing.has(player.id)) continue;
try {
if (!offhandIsSpear(player)) {
offhandSpearUsing.delete(player.id);
continue;
}
player.addEffect("speed", 4, { amplifier: 0, showParticles: false });
try { player.removeEffect("slowness"); } catch {}
try { player.removeEffect("mining_fatigue"); } catch {}
} catch {
offhandSpearUsing.delete(player.id);
}
}
}, 1);