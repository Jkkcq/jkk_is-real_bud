export const ALLOWED_MAINHAND_TAG = "bf:custom_shield_usable";
export const OFFHAND_THROWABLES = {
"minecraft:egg": "minecraft:egg",
"minecraft:snowball": "minecraft:snowball",
"minecraft:ender_pearl": "minecraft:ender_pearl",
"minecraft:experience_bottle": "minecraft:xp_bottle",
"minecraft:wind_charge": "minecraft:wind_charge_projectile",
"minecraft:splash_potion": "minecraft:splash_potion",
"minecraft:lingering_potion": "minecraft:lingering_potion"
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
"minecraft:ender_eye"
]);
export const THROW_COOLDOWNS = {
"minecraft:ender_pearl": 20,
"minecraft:wind_charge": 20,
"minecraft:splash_potion": 10,
"minecraft:lingering_potion": 10
};