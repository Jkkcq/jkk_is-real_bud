import { world } from "@minecraft/server";
import { RiptideEnvironment } from "./interfaces";
export const waitTicks = 3;
export const CustomTrident = [
{
itemID: "bf:trident",
projectile: {
entityID: "bf:thrown_trident",
thrownVelocity: 3,
returnSpeed: 1,
returnSound: {
id: "item.trident.return",
volume: 1,
pitch: 1
},
thrownSound: {
id: "item.trident.throw",
volume: 1,
pitch: 1
}
},
riptide: {
needsEnchant: true,
environment: RiptideEnvironment.Water,
velocity: 1.37,
damage: 8,
onRiptide: (player, level) => {
player.runCommand("playanimation @s animation.player.riptide_player trident 1000");
},
sound: {
ids: ["item.trident.riptide_1", "item.trident.riptide_2", "item.trident.riptide_3"],
volume: 1
}
}
}
];
CustomTrident.push({ ...CustomTrident[0], itemID: "minecraft:trident" });