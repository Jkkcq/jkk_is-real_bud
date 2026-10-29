export const ALLOWED_MAINHAND_TAG = "bf:custom_shield_usable";
export const OFFHAND_THROWABLES = {
"minecraft:egg": "minecraft:egg",
"minecraft:snowball": "minecraft:snowball",
"minecraft:ender_pearl": "minecraft:ender_pearl",
"minecraft:experience_bottle": "minecraft:xp_bottle",
"minecraft:wind_charge": "minecraft:wind_charge_projectile",
"minecraft:splash_potion": "minecraft:splash_potion",
"minecraft:lingering_potion": "minecraft:lingering_potion",
"minecraft:ender_eye": "minecraft:eye_of_ender"
};
export const OFFHAND_INTERACT_HOLD_ITEMS = new Set([
"minecraft:shield", "bf:shield",
"minecraft:trident", "bf:trident",
...Object.keys(OFFHAND_THROWABLES),
"minecraft:golden_apple", "minecraft:enchanted_golden_apple",
"bf:golden_apple_offhand", "bf:enchanted_golden_apple_offhand",
"minecraft:totem_of_undying",
"minecraft:spyglass",
"minecraft:goat_horn",
"minecraft:brush"
]);
export const OFFHAND_SINGLE_EAT_PER_PRESS_ITEMS = new Set([
"minecraft:golden_apple", "minecraft:enchanted_golden_apple",
"bf:golden_apple_offhand", "bf:enchanted_golden_apple_offhand"
]);
export const EXTRA_OFFHAND_ALWAYS = new Set([
"minecraft:totem_of_undying",
"minecraft:spyglass",
"minecraft:compass",
"minecraft:recovery_compass",
"minecraft:clock",
"minecraft:map",
"minecraft:filled_map",
"minecraft:writable_book",
"minecraft:written_book",
"minecraft:book",
"minecraft:firework_rocket",
"minecraft:goat_horn",
"minecraft:brush",
"minecraft:ender_eye",
"minecraft:firework_rocket"
]);
const PASSIVE_MAINHAND = /(?:^|:)(?:[\w]+_)?(?:sword|axe|pickaxe|shovel|hoe|spear|mace)$/;
export function isMaceItem(item) {
const id = item?.typeId || "";
return id === "minecraft:mace" || /(?:^|:)mace$/.test(id) || id.includes("_mace");
}
export function mainhandAllowsOffhandUse(item) {
if (!item?.typeId) return true;
if (isMaceItem(item)) return true;
try {
if (item.hasTag?.(ALLOWED_MAINHAND_TAG) || item.hasTag?.("bf:custom_shield_usable") || item.hasTag?.("jk:custom_shield_usable") || item.hasTag?.("minecraft:is_mace") || item.hasTag?.("minecraft:is_spear") || item.hasTag?.("minecraft:is_sword") || item.hasTag?.("minecraft:is_axe")) return true;
} catch {}
const id = item.typeId;
if (PASSIVE_MAINHAND.test(id)) return true;
if (id === "minecraft:stick" || id === "minecraft:shield" || id.endsWith(":shield") || id.includes("arrow") || id === "minecraft:totem_of_undying") return true;
return false;
}
export const THROW_COOLDOWNS = {
"minecraft:ender_pearl": 20,
"minecraft:wind_charge": 20,
"minecraft:splash_potion": 10,
"minecraft:lingering_potion": 10,
"minecraft:ender_eye": 10,
"minecraft:firework_rocket": 8
};