import { world } from '@minecraft/server';
world.afterEvents.entityHealthChanged.subscribe((event) => {
if (event.entity.typeId !== "minecraft:player") return;
const player = event.entity;
if (event.oldValue <= 0 && event.newValue > 0) {
player.addEffect("resistance", 10, { amplifier: 255, showParticles: false });
const hitLoc = player.location;
const dimension = player.dimension;
if (!player.hasTag("fopt_low_effects")) {
dimension.spawnParticle("minecraft:totem_particle", { x: hitLoc.x, y: hitLoc.y + 1.5, z: hitLoc.z });
dimension.spawnParticle("minecraft:totem_particle", { x: hitLoc.x, y: hitLoc.y + 1.5, z: hitLoc.z });
}
}
});