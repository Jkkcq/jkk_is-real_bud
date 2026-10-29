import { world, system, ItemStack } from "@minecraft/server";
const foodSwapMap = new Map([
["bf:golden_apple", { newItem: "minecraft:golden_apple" }],
["bf:apple_offhand", { newItem: "minecraft:apple" }],
["bf:baked_potato_offhand", { newItem: "minecraft:baked_potato" }],
["bf:beetroot_offhand", { newItem: "minecraft:beetroot" }],
["bf:beetroot_soup_offhand", { newItem: "minecraft:beetroot_soup" }],
["bf:bread_offhand", { newItem: "minecraft:bread" }],
["bf:carrot_offhand", { newItem: "minecraft:carrot" }],
["bf:chorus_fruit_offhand", { newItem: "minecraft:chorus_fruit" }],
["bf:cooked_chicken_offhand", { newItem: "minecraft:cooked_chicken" }],
["bf:cooked_cod_offhand", { newItem: "minecraft:cooked_cod" }],
["bf:cooked_mutton_offhand", { newItem: "minecraft:cooked_mutton" }],
["bf:cooked_porkchop_offhand", { newItem: "minecraft:cooked_porkchop" }],
["bf:cooked_rabbit_offhand", { newItem: "minecraft:cooked_rabbit" }],
["bf:cooked_salmon_offhand", { newItem: "minecraft:cooked_salmon" }],
["bf:cookie_offhand", { newItem: "minecraft:cookie" }],
["bf:dried_kelp_offhand", { newItem: "minecraft:dried_kelp" }],
["bf:enchanted_golden_apple_offhand", { newItem: "minecraft:enchanted_golden_apple" }],
["bf:golden_apple_offhand", { newItem: "minecraft:golden_apple" }],
["bf:glow_berries_offhand", { newItem: "minecraft:glow_berries" }],
["bf:golden_carrot_offhand", { newItem: "minecraft:golden_carrot" }],
["bf:honey_bottle_offhand", { newItem: "minecraft:honey_bottle" }],
["bf:melon_slice_offhand", { newItem: "minecraft:melon_slice" }],
["bf:mushroom_stew_offhand", { newItem: "minecraft:mushroom_stew" }],
["bf:poisonous_potato_offhand", { newItem: "minecraft:poisonous_potato" }],
["bf:potato_offhand", { newItem: "minecraft:potato" }],
["bf:pufferfish_offhand", { newItem: "minecraft:pufferfish" }],
["bf:pumpkin_pie_offhand", { newItem: "minecraft:pumpkin_pie" }],
["bf:rabbit_stew_offhand", { newItem: "minecraft:rabbit_stew" }],
["bf:beef_offhand", { newItem: "minecraft:beef" }],
["bf:chicken_offhand", { newItem: "minecraft:chicken" }],
["bf:cod_offhand", { newItem: "minecraft:cod" }],
["bf:mutton_offhand", { newItem: "minecraft:mutton" }],
["bf:porkchop_offhand", { newItem: "minecraft:porkchop" }],
["bf:rabbit_offhand", { newItem: "minecraft:rabbit" }],
["bf:salmon_offhand", { newItem: "minecraft:salmon" }],
["bf:rotten_flesh_offhand", { newItem: "minecraft:rotten_flesh" }],
["bf:spider_eye_offhand", { newItem: "minecraft:spider_eye" }],
["bf:cooked_beef_offhand", { newItem: "minecraft:cooked_beef" }],
["bf:suspicious_stew_offhand", { newItem: "minecraft:suspicious_stew" }],
["bf:sweet_berries_offhand", { newItem: "minecraft:sweet_berries" }],
["bf:tropical_fish_offhand", { newItem: "minecraft:tropical_fish" }]
]);
world.afterEvents.playerInventoryItemChange.subscribe((event) => {
const { player, itemStack, slot } = event;
if (!itemStack) return;
const swapData = foodSwapMap.get(itemStack.typeId);
if (!swapData) return;
system.run(() => {
const inventory = player.getComponent("inventory")?.container;
if (!inventory) return;
const current = inventory.getItem(slot);
if (!current || current.typeId !== itemStack.typeId) return;
inventory.setItem(slot, new ItemStack(swapData.newItem, current.amount));
});
});