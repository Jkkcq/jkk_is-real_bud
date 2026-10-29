import { world, system, ItemStack, EquipmentSlot } from "@minecraft/server";
import { updateShieldAnimation } from "./shield.js";
import { hasStateTag, setStateTag, getPlayerState } from "./states.js";
import { cfg } from "./config.js";
system.runTimeout(() => {
updateRules();
}, 80);
const MINECRAFT_SHIELD = "minecraft:shield";
const BF_SHIELD = "bf:shield";
const SWEEPING_EDGE_TEXT = "§r§9Sweeping Edge III";
const LORE_MAIN_HAND = "§r§7When in Main Hand:";
const baseItemSwapRules = new Map([
["minecraft:tnt_minecart", { toItem: "rad:tnt_minecart" }],
["minecraft:wooden_sword", { toItem: "bf:wooden_sword", extraDamage: 4, attackSpeed: 1.6 }],
["minecraft:stone_sword", { toItem: "bf:stone_sword", extraDamage: 5, attackSpeed: 1.6 }],
["minecraft:iron_sword", { toItem: "bf:iron_sword", extraDamage: 6, attackSpeed: 1.6 }],
["minecraft:golden_sword", { toItem: "bf:golden_sword", extraDamage: 4, attackSpeed: 1.6 }],
["minecraft:diamond_sword", { toItem: "bf:diamond_sword", extraDamage: 7, attackSpeed: 1.6 }],
["minecraft:netherite_sword", { toItem: "bf:netherite_sword", extraDamage: 8, attackSpeed: 1.6 }],
["minecraft:copper_sword", { toItem: "bf:copper_sword", extraDamage: 5, attackSpeed: 1.6 }],
["minecraft:wooden_axe", { toItem: "bf:wooden_axe", extraDamage: 7, attackSpeed: 0.8 }],
["minecraft:stone_axe", { toItem: "bf:stone_axe", extraDamage: 9, attackSpeed: 0.8 }],
["minecraft:iron_axe", { toItem: "bf:iron_axe", extraDamage: 9, attackSpeed: 0.9 }],
["minecraft:golden_axe", { toItem: "bf:golden_axe", extraDamage: 7, attackSpeed: 1.0 }],
["minecraft:diamond_axe", { toItem: "bf:diamond_axe", extraDamage: 9, attackSpeed: 1.0 }],
["minecraft:netherite_axe", { toItem: "bf:netherite_axe", extraDamage: 10, attackSpeed: 1.0 }],
["minecraft:copper_axe", { toItem: "bf:copper_axe", extraDamage: 9, attackSpeed: 0.8 }],
]);
const reverseShieldRule = [BF_SHIELD, { toItem: MINECRAFT_SHIELD, extraDamage: 0, attackSpeed: 0 }];
const LORE_ONLY_ATTRIBUTES = new Map([
["minecraft:wooden_pickaxe", { damage: 2, speed: 1.2 }],
["minecraft:stone_pickaxe", { damage: 3, speed: 1.2 }],
["minecraft:iron_pickaxe", { damage: 4, speed: 1.2 }],
["minecraft:golden_pickaxe", { damage: 2, speed: 1.2 }],
["minecraft:diamond_pickaxe", { damage: 5, speed: 1.2 }],
["minecraft:netherite_pickaxe", { damage: 6, speed: 1.2 }],
["minecraft:copper_pickaxe", { damage: 3, speed: 1.2 }],
["minecraft:wooden_shovel", { damage: 2.5, speed: 1.0 }],
["minecraft:stone_shovel", { damage: 3.5, speed: 1.0 }],
["minecraft:iron_shovel", { damage: 4.5, speed: 1.0 }],
["minecraft:golden_shovel", { damage: 2.5, speed: 1.0 }],
["minecraft:diamond_shovel", { damage: 5.5, speed: 1.0 }],
["minecraft:netherite_shovel", { damage: 6.5, speed: 1.0 }],
["minecraft:copper_shovel", { damage: 3.5, speed: 1.0 }],
["minecraft:wooden_hoe", { damage: 1, speed: 1.0 }],
["minecraft:stone_hoe", { damage: 1, speed: 2.0 }],
["minecraft:iron_hoe", { damage: 1, speed: 3.0 }],
["minecraft:golden_hoe", { damage: 1, speed: 1.0 }],
["minecraft:diamond_hoe", { damage: 1, speed: 4.0 }],
["minecraft:netherite_hoe", { damage: 1, speed: 4.0 }],
["minecraft:copper_hoe", { damage: 1, speed: 2.0 }],
["minecraft:trident", { damage: 9, speed: 1.1 }],
["minecraft:mace", { damage: 6, speed: 0.6 }],
]);
let cachedRules = new Map([...baseItemSwapRules]);
let lastShieldEnabled = false;
const swapLock = new Set();
function setLore(item, damage, attackSpeed) {
try {
const isSword = item.hasTag?.("minecraft:is_sword") || /_sword$/.test(item.typeId || "");
const lore = isSword
? [SWEEPING_EDGE_TEXT, LORE_MAIN_HAND, `§r§2 ${damage} Attack Damage`, `§r§2 ${attackSpeed} Attack Speed`]
: ["", LORE_MAIN_HAND, `§r§2 ${damage} Attack Damage`, `§r§2 ${attackSpeed} Attack Speed`];
item.setLore(lore);
} catch {}
}
function copyEnchantments(fromItem, toItem) {
try {
const fromEnchantable = fromItem.getComponent("minecraft:enchantable") || fromItem.getComponent("enchantable");
if (!fromEnchantable) return;
const enchants = fromEnchantable.getEnchantments?.() || [];
if (!enchants.length) return;
const toEnchantable = toItem.getComponent("minecraft:enchantable") || toItem.getComponent("enchantable");
if (!toEnchantable) return;
for (const enchant of enchants) {
try {
toEnchantable.addEnchantment({ level: enchant.level, type: enchant.type });
} catch {
}
}
} catch {}
}
function copyDurability(fromItem, toItem) {
try {
const fromDurability = fromItem.getComponent("minecraft:durability") || fromItem.getComponent("durability");
const toDurability = toItem.getComponent("minecraft:durability") || toItem.getComponent("durability");
if (fromDurability && toDurability) {
toDurability.damage = Math.min(fromDurability.damage, toDurability.maxDurability);
}
} catch {}
}
function copyName(fromItem, toItem) {
try {
if (fromItem.nameTag) toItem.nameTag = fromItem.nameTag;
} catch {}
}
function processItemSwap(item, rule) {
const newItem = new ItemStack(rule.toItem, item.amount);
copyName(item, newItem);
copyEnchantments(item, newItem);
copyDurability(item, newItem);
const typeId = item.typeId;
if (typeId !== MINECRAFT_SHIELD && typeId !== BF_SHIELD && rule.extraDamage != null && rule.attackSpeed != null) {
setLore(newItem, rule.extraDamage, rule.attackSpeed);
}
return newItem;
}
function applyLoreOnlyAttribute(item) {
if (!item) return item;
const attr = LORE_ONLY_ATTRIBUTES.get(item.typeId);
if (!attr) return item;
try {
const current = item.getLore?.() || [];
const expected = ["", LORE_MAIN_HAND, `§r§2 ${attr.damage} Attack Damage`, `§r§2 ${attr.speed} Attack Speed`];
if (current.length >= 4 && current[2] === expected[2] && current[3] === expected[3]) return item;
item.setLore(expected);
} catch {}
return item;
}
export function swapItems(player, item, offhandItem, slot = player.selectedSlotIndex) {
if (!player) return;
if (swapLock.has(player.id)) return;
const inventory = player.getComponent("inventory")?.container;
const equippable = player.getComponent("minecraft:equippable");
if (!inventory || !equippable) return;
swapLock.add(player.id);
try {
if (!item) {
try {
item = inventory.getItem(slot);
} catch {}
}
if (item) {
const rule = cachedRules.get(item.typeId);
if (rule) {
try {
inventory.setItem(slot, processItemSwap(item, rule));
} catch {}
} else if (LORE_ONLY_ATTRIBUTES.has(item.typeId)) {
try {
applyLoreOnlyAttribute(item);
inventory.setItem(slot, item);
} catch {}
}
}
if (!offhandItem) {
try {
offhandItem = equippable.getEquipment(EquipmentSlot.Offhand);
} catch {}
}
if (offhandItem) {
const offRule = cachedRules.get(offhandItem.typeId);
if (offRule) {
try {
equippable.setEquipment(EquipmentSlot.Offhand, processItemSwap(offhandItem, offRule));
} catch {}
} else if (LORE_ONLY_ATTRIBUTES.has(offhandItem.typeId)) {
try {
applyLoreOnlyAttribute(offhandItem);
equippable.setEquipment(EquipmentSlot.Offhand, offhandItem);
} catch {}
}
}
} finally {
system.run(() => swapLock.delete(player.id));
}
}
export function updateRules() {
const shieldEnabled = cfg.custom_shield_enabled;
if (shieldEnabled !== lastShieldEnabled) {
cachedRules = new Map([...baseItemSwapRules]);
if (shieldEnabled === false) {
cachedRules.set(reverseShieldRule[0], reverseShieldRule[1]);
}
lastShieldEnabled = shieldEnabled;
}
}
const itemSet = new Set([
"bf:wooden_axe",
"bf:wooden_sword",
"bf:stone_axe",
"bf:stone_sword",
"bf:iron_axe",
"bf:iron_sword",
"bf:copper_axe",
"bf:copper_sword",
"bf:golden_axe",
"bf:golden_sword",
"bf:diamond_axe",
"bf:diamond_sword",
"bf:netherite_axe",
"bf:netherite_sword",
]);
function itemDurabilityDecrease(itemStack, player, decreaseAmount, offhand = false) {
const durability = itemStack.getComponent("durability") || itemStack.getComponent("minecraft:durability");
if (durability) {
durability.damage += decreaseAmount;
if (durability.damage >= durability.maxDurability) {
const inv = player.getComponent("inventory")?.container;
const equippable = player.getComponent("minecraft:equippable");
if (offhand && equippable) {
equippable.setEquipment(EquipmentSlot.Offhand, undefined);
} else if (inv) {
inv.setItem(player.selectedSlotIndex, undefined);
}
try {
player.playSound("random.break");
} catch {}
return null;
}
}
return itemStack;
}
world.afterEvents.playerBreakBlock.subscribe((eventData) => {
const { player, itemStackBeforeBreak } = eventData;
if (!itemStackBeforeBreak || !itemSet.has(itemStackBeforeBreak.typeId)) return;
const newItem = itemDurabilityDecrease(itemStackBeforeBreak, player, 1);
const inv = player.getComponent("inventory")?.container;
if (newItem && inv) {
inv.setItem(player.selectedSlotIndex, newItem);
}
});
export function checkItems(player, mainhandItem) {
if (!player) return;
if (!mainhandItem) {
try {
const inventory = player.getComponent("inventory")?.container;
mainhandItem = inventory?.getItem(player.selectedSlotIndex);
} catch {}
}
const state = getPlayerState(player);
const now = system.currentTick;
const prevId = state.lastWeaponId || null;
const curId = mainhandItem?.typeId || null;
if (!mainhandItem) {
system.runTimeout(() => {
try {
if (!player.getComponent("inventory")?.container?.getItem(player.selectedSlotIndex)) {
setStateTag(player, "axe", false);
setStateTag(player, "sword", false);
}
} catch {}
}, 6);
updateShieldAnimation(player);
state.lastWeaponId = null;
return;
}
const hasAxe =
mainhandItem.hasTag?.("minecraft:is_axe") ||
mainhandItem.hasTag?.("bf:custom_shield_breakable") ||
/_axe$/.test(curId);
const hasSword =
(mainhandItem.hasTag?.("minecraft:is_sword") || /_sword$/.test(curId)) &&
curId !== "minecraft:mace";
const isMace = curId === "minecraft:mace";
const hadAxeState = hasStateTag(player, "axe");
const hadSwordState = hasStateTag(player, "sword");
if (prevId && curId && prevId !== curId) {
const state = getPlayerState(player);
const prevCd = state.cooldown;
if (prevCd && Number.isFinite(prevCd.startTick)) {
const now = system.currentTick;
const prevT = Number(prevCd.exactT) > 0 ? Number(prevCd.exactT) : 20;
const elapsed = Math.max(0, now - prevCd.startTick);
const prevProgress = Math.min(1, elapsed / prevT);
const inherit = prevProgress * 0.6;
const newT = 20;
state.cooldown = {
startTick: now - Math.floor(inherit * newT),
endTick: now + Math.ceil((1 - inherit) * newT),
duration: newT,
exactT: newT
};
}
}
if (isMace && prevId && prevId !== "minecraft:mace" && cfg.mace_swap_ignore_cooldown) {
setStateTag(player, "mace_swap_ignore", true);
system.runTimeout(() => {
try { setStateTag(player, "mace_swap_ignore", false); } catch {}
}, 1);
}
const grace = Math.max(1, Math.min(20, Number(cfg.attribute_swap_grace_ticks ?? 6)));
if (hasAxe) {
setStateTag(player, "axe", true);
} else if (hadAxeState) {
system.runTimeout(() => {
try {
const still = player.getComponent("inventory")?.container?.getItem(player.selectedSlotIndex);
const stillAxe =
still?.hasTag?.("minecraft:is_axe") ||
still?.hasTag?.("bf:custom_shield_breakable") ||
/_axe$/.test(still?.typeId || "");
if (!stillAxe) setStateTag(player, "axe", false);
} catch {
setStateTag(player, "axe", false);
}
}, grace);
}
if (hasSword) {
setStateTag(player, "sword", true);
} else if (hadSwordState) {
system.runTimeout(() => {
try {
const still = player.getComponent("inventory")?.container?.getItem(player.selectedSlotIndex);
const stillSword =
(still?.hasTag?.("minecraft:is_sword") || /_sword$/.test(still?.typeId || "")) &&
still?.typeId !== "minecraft:mace";
if (!stillSword) setStateTag(player, "sword", false);
} catch {
setStateTag(player, "sword", false);
}
}, grace);
}
if (isMace && (hadAxeState || hadSwordState)) {
const breachTicks = Math.max(1, Number(cfg.breach_swap_ticks ?? 1));
if (cfg.breach_swap_enabled !== false) {
if (hadAxeState) {
setStateTag(player, "axe_breach", true);
setStateTag(player, "axe_to_mace_swap", true);
}
if (hadSwordState) setStateTag(player, "sword_breach", true);
system.runTimeout(() => {
setStateTag(player, "axe_breach", false);
setStateTag(player, "sword_breach", false);
setStateTag(player, "axe_to_mace_swap", false);
}, breachTicks);
}
}
if (prevId && curId && prevId !== curId) {
state.lastWeaponSwapTick = now;
state.prevWeaponId = prevId;
}
state.lastWeaponId = curId;
updateShieldAnimation(player);
}
world.afterEvents.playerInventoryItemChange.subscribe((event) => {
const player = event.player;
if (!player) return;
if (swapLock.has(player.id)) return;
try {
const equippable = player.getComponent("minecraft:equippable");
const offhandItem = equippable?.getEquipment(EquipmentSlot.Offhand);
swapItems(player, event.itemStack, offhandItem, event.slot);
} catch {}
});
world.afterEvents.playerHotbarSelectedSlotChange.subscribe((event) => {
const player = event.player;
if (!player) return;
try {
const equippable = player.getComponent("minecraft:equippable");
const offhandItem = equippable?.getEquipment(EquipmentSlot.Offhand);
const item = event.itemStack;
checkItems(player, item);
swapItems(player, item, offhandItem, event.newSlotSelected);
} catch {}
});
world.afterEvents.playerSwingStart.subscribe((event) => {
const player = event.player;
if (!player) return;
try {
const inventory = player.getComponent("minecraft:inventory")?.container;
if (!inventory) return;
const item = inventory.getItem(player.selectedSlotIndex);
if (item?.typeId === "minecraft:mace" && hasStateTag(player, "axe")) {
if (cfg.breach_swap_enabled !== false) {
setStateTag(player, "axe_to_mace_swap", true);
const breachTicks = Math.max(1, Number(cfg.breach_swap_ticks ?? 1));
system.runTimeout(() => setStateTag(player, "axe_to_mace_swap", false), breachTicks);
}
}
if (item && (item.hasTag?.("minecraft:is_axe") || /_axe$/.test(item.typeId || "") || item.hasTag?.("bf:custom_shield_breakable"))) {
setStateTag(player, "recent_axe_swing", true);
system.runTimeout(() => setStateTag(player, "recent_axe_swing", false), 8);
}
if (!item || !cachedRules.has(item.typeId)) return;
const equippable = player.getComponent("minecraft:equippable");
const offhandItem = equippable?.getEquipment(EquipmentSlot.Offhand);
swapItems(player, item, offhandItem);
} catch {}
});