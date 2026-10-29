import { world, system, ItemStack, ItemTypes, EquipmentSlot, BlockPermutation, CommandPermissionLevel, CustomCommandStatus, InputButton, ButtonState } from "@minecraft/server";
import { cfg } from "./config.js";
import { getPlayerState } from "./states.js";
const FOOD_IDS = [
"apple", "baked_potato", "beetroot", "beetroot_soup", "bread", "carrot", "chorus_fruit",
"cooked_chicken", "cooked_cod", "cooked_mutton", "cooked_porkchop", "cooked_rabbit",
"cooked_salmon", "cookie", "dried_kelp", "enchanted_golden_apple", "golden_apple",
"glow_berries", "golden_carrot", "honey_bottle", "melon_slice", "mushroom_stew",
"poisonous_potato", "potato", "pumpkin_pie", "rabbit_stew", "beef", "chicken", "cod",
"mutton", "porkchop", "rabbit", "salmon", "rotten_flesh", "spider_eye", "cooked_beef",
"suspicious_stew", "sweet_berries", "tropical_fish", "pufferfish"
];
const VANILLA_FOODS = new Set(FOOD_IDS.map((id) => `minecraft:${id}`));
export const SWAPPABLE_FOOD_IDS2 = FOOD_IDS.map((id) => `bf:${id}_offhand`);
const OFFHAND_FOODS = new Set(SWAPPABLE_FOOD_IDS2);
const PROJECTILES = new Set([
"minecraft:egg", "minecraft:snowball", "minecraft:ender_pearl",
"minecraft:experience_bottle", "minecraft:wind_charge",
"minecraft:splash_potion", "minecraft:lingering_potion"
]);
const ALWAYS_SWAPPABLE = new Set([
"minecraft:shield", "bf:shield", "minecraft:totem_of_undying",
"minecraft:trident", "bf:trident", "minecraft:fishing_rod",
"minecraft:potion", "minecraft:splash_potion", "minecraft:lingering_potion",
"minecraft:glass_bottle",
"minecraft:wooden_sword", "minecraft:stone_sword", "minecraft:iron_sword",
"minecraft:golden_sword", "minecraft:diamond_sword", "minecraft:netherite_sword",
"minecraft:wooden_axe", "minecraft:stone_axe", "minecraft:iron_axe",
"minecraft:golden_axe", "minecraft:diamond_axe", "minecraft:netherite_axe",
"minecraft:wooden_spear", "minecraft:stone_spear", "minecraft:copper_spear",
"minecraft:iron_spear", "minecraft:golden_spear", "minecraft:diamond_spear",
"minecraft:netherite_spear",
"bf:wooden_spear", "bf:stone_spear", "bf:copper_spear",
"bf:iron_spear", "bf:golden_spear", "bf:diamond_spear", "bf:netherite_spear",
"minecraft:spyglass", "minecraft:compass", "minecraft:recovery_compass",
"minecraft:clock", "minecraft:map", "minecraft:filled_map",
"minecraft:writable_book", "minecraft:written_book", "minecraft:book",
"minecraft:firework_rocket", "minecraft:goat_horn", "minecraft:brush",
"minecraft:ender_eye"
]);
const BLOCK_ITEM_CACHE = new Map();
const DOUBLE_SNEAK_WINDOW = 15;
const SWAP_COOLDOWN = 20;
function getSwapCooldownTicks() {
const value = Number(cfg.offhand_swap_cooldown_ticks ?? SWAP_COOLDOWN);
return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : SWAP_COOLDOWN;
}
function safeSubscribe(signalGetter, handler, options) {
try {
const signal = signalGetter();
if (typeof signal?.subscribe !== "function") return;
signal.subscribe((event) => { try { handler(event); } catch { } }, options);
} catch { }
}
function enabled() { return cfg.offhand_enabled !== false && cfg.offhand_swap_enabled !== false; }
function hasTag(item, tag) { try { return Boolean(item?.hasTag(tag)); } catch { return false; } }
function isWeapon(item) { return hasTag(item, "bf:custom_shield_usable"); }
export function isSwappableOffhandFood(typeId) { return OFFHAND_FOODS.has(typeId); }
function isPlaceableBlockItem(item) {
if (!item?.typeId) return false;
const cached = BLOCK_ITEM_CACHE.get(item.typeId);
if (cached !== undefined) return cached;
let isBlock = false;
try {
BlockPermutation.resolve(item.typeId);
isBlock = true;
} catch { }
BLOCK_ITEM_CACHE.set(item.typeId, isBlock);
return isBlock;
}
function isSwordAxeOrSpear(typeId) {
if (!typeId) return false;
return /(?:^|:)(?:wooden|stone|copper|iron|golden|diamond|netherite)_(?:sword|axe|spear)$/.test(typeId)
|| /(?:^|:)bf:(?:wooden|stone|copper|iron|golden|diamond|netherite)_spear$/.test(typeId);
}
function isSupported(item, foodsEnabled = cfg.offhand_foods_enabled !== false, blocksEnabled = cfg.offhand_blocks_enabled !== false) {
if (!item) return false;
if (ALWAYS_SWAPPABLE.has(item.typeId) || PROJECTILES.has(item.typeId) || isWeapon(item) || hasTag(item, "bf:custom_shield")) return true;
if (isSwordAxeOrSpear(item.typeId)) return true;
if (blocksEnabled && isPlaceableBlockItem(item)) return true;
return foodsEnabled && (VANILLA_FOODS.has(item.typeId) || OFFHAND_FOODS.has(item.typeId));
}
function copyItemMetadata(source, target) {
try { if (source.nameTag) target.nameTag = source.nameTag; } catch {}
try { target.setLore(source.getLore()); } catch {}
try { target.keepOnDeath = source.keepOnDeath; } catch {}
try { target.lockMode = source.lockMode; } catch {}
try {
const from = source.getComponent("minecraft:durability");
const to = target.getComponent("minecraft:durability");
if (from && to) to.damage = from.damage;
} catch {}
try {
const from = source.getComponent("minecraft:enchantable");
const to = target.getComponent("minecraft:enchantable");
for (const enchantment of from?.getEnchantments?.() ?? []) {
try { if (to?.canAddEnchantment?.(enchantment)) to.addEnchantment(enchantment); } catch {}
}
} catch {}
try {
for (const id of source.getDynamicPropertyIds?.() ?? []) {
try { const value = source.getDynamicProperty(id); if (value !== undefined) target.setDynamicProperty(id, value); } catch {}
}
} catch {}
}
function convertItem(item, typeId) {
if (!item || !typeId || item.typeId === typeId) return item;
try {
if (!ItemTypes.get(typeId)) return item;
const max = new ItemStack(typeId).maxAmount;
const converted = new ItemStack(typeId, Math.max(1, Math.min(item.amount, max || item.amount)));
copyItemMetadata(item, converted);
return converted;
} catch { return item; }
}
function toOffhand(item, foodsEnabled, blocksEnabled) {
if (!item) return undefined;
if (item.typeId === "minecraft:trident") return convertItem(item, "bf:trident");
if (foodsEnabled && VANILLA_FOODS.has(item.typeId)) {
const id = `bf:${item.typeId.slice("minecraft:".length)}_offhand`;
return OFFHAND_FOODS.has(id) ? convertItem(item, id) : item;
}
return isSupported(item, foodsEnabled, blocksEnabled) ? item : undefined;
}
function toMainHand(item, foodsEnabled) {
if (!item) return undefined;
if (item.typeId === "bf:trident") return convertItem(item, "minecraft:trident");
if (foodsEnabled && isSwappableOffhandFood(item.typeId)) {
const food = item.typeId.slice(item.typeId.indexOf(":") + 1, -"_offhand".length);
const vanilla = `minecraft:${food}`;
return VANILLA_FOODS.has(vanilla) ? convertItem(item, vanilla) : item;
}
return item;
}
function getHands(player) {
try {
const inventory = player.getComponent("minecraft:inventory")?.container;
const equippable = player.getComponent("minecraft:equippable");
return inventory && equippable ? { inventory, equippable } : undefined;
} catch { return undefined; }
}
function setOffhand(player, equippable, item) {
try {
if (item == null) {
equippable.setEquipment(EquipmentSlot.Offhand, undefined);
return true;
}
const result = equippable.setEquipment(EquipmentSlot.Offhand, item);
const got = equippable.getEquipment(EquipmentSlot.Offhand);
if (result === false || !got || got.typeId !== item.typeId) {
throw new Error("offhand rejected");
}
return true;
} catch {
if (!item) {
try { player.runCommand("replaceitem entity @s slot.weapon.offhand 0 air"); return true; } catch { return false; }
}
try {
const amt = Math.max(1, Math.min(64, Number(item.amount) || 1));
player.runCommand(`replaceitem entity @s slot.weapon.offhand 0 ${item.typeId} ${amt}`);
return true;
} catch { return false; }
}
}
function swap(player, fromCommand = false) {
if (!player || !enabled()) return false;
const state = getPlayerState(player).offhand;
const now = system.currentTick;
const cooldown = getSwapCooldownTicks();
if (!fromCommand && now - (state.lastSwapTick ?? -cooldown) < cooldown) return false;
const hands = getHands(player);
if (!hands) return false;
const slot = player.selectedSlotIndex;
const main = hands.inventory.getItem(slot);
const off = hands.equippable.getEquipment(EquipmentSlot.Offhand);
const foodsEnabled = cfg.offhand_foods_enabled !== false;
const blocksEnabled = cfg.offhand_blocks_enabled !== false;
const nextOff = toOffhand(main, foodsEnabled, blocksEnabled);
if (main && !nextOff) return false;
if (!main && !off) return false;
const nextMain = toMainHand(off, foodsEnabled);
if (!setOffhand(player, hands.equippable, nextOff)) return false;
try {
hands.inventory.setItem(slot, nextMain);
} catch {
setOffhand(player, hands.equippable, off);
return false;
}
try { player.playSound("armor.equip_generic"); } catch {}
state.lastSwapTick = now;
state.pendingSwap = false;
return true;
}
function requestSwap(player) {
if (!enabled() || !player) return;
system.run(() => swap(player));
}
safeSubscribe(() => world.afterEvents.playerEmote, (event) => {
if (Number(event.player?.getDynamicProperty("offhand_swap") ?? 0) !== 2) return;
const now = system.currentTick;
const last = Number(event.player.getDynamicProperty("lastEmoteSwap") ?? -SWAP_COOLDOWN);
if (now - last < SWAP_COOLDOWN) return;
event.player.setDynamicProperty("lastEmoteSwap", now);
requestSwap(event.player);
});
safeSubscribe(() => system.beforeEvents.startup, (init) => {
init.customCommandRegistry.registerCommand({
name: "jk:swap",
description: "Swap a supported item with the offhand",
permissionLevel: CommandPermissionLevel.Any,
cheatsRequired: false
}, (origin) => {
const player = origin.sourceEntity;
if (!player) return { status: CustomCommandStatus.Failure, message: "This command can only be run by a player." };
system.run(() => swap(player, true));
return { status: CustomCommandStatus.Success, message: "Swapping supported offhand items..." };
});
});
safeSubscribe(() => world.afterEvents.playerButtonInput, (event) => {
if (!enabled() || event.button !== InputButton.Sneak || event.newButtonState !== ButtonState.Pressed) return;
const player = event.player;
const mode = Number(player.getDynamicProperty("offhand_swap") ?? 0);
if (mode !== 0 && mode !== 1) return;
const state = getPlayerState(player).offhand;
const now = system.currentTick;
const window = Math.max(5, Math.min(100, Math.round(Number(cfg.offhand_swap_window_ticks ?? DOUBLE_SNEAK_WINDOW))));
const personalThreshold = Number(player.getDynamicProperty("offhand_swap_sneak_presses") ?? cfg.offhand_swap_double_tap_presses ?? 2);
const threshold = mode === 0
? Math.max(2, Math.min(6, Math.round(Number.isFinite(personalThreshold) ? personalThreshold : 2)))
: Math.max(3, Math.min(10, Math.round(Number(cfg.offhand_swap_multi_presses ?? 5))));
if (!state.pressCount || now - state.firstPressTick > window) {
state.firstPressTick = now;
state.pressCount = 1;
} else {
state.pressCount++;
}
if (state.pressCount >= threshold) {
state.pressCount = 0;
state.firstPressTick = 0;
requestSwap(player);
}
}, { buttons: [InputButton.Sneak], state: ButtonState.Pressed });