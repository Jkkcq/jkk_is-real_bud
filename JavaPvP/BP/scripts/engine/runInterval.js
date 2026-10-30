import { world, system } from '@minecraft/server';
import { updatePlayerHud } from './hud.js';
import { checkSaturation } from './saturation.js';
import { checkXp } from '../extra/xp.js';
import { updateShieldAnimation } from './shield.js';
import { cfg, reloadConfig } from './config.js';
let tickCounter = 0;
const TICK_WRAP = 40;
system.runInterval(() => {
const t = tickCounter;
const t2 = (t & 1) === 0;
const t10 = t % 10 === 0;
const t20 = t % 20 === 0;
const t40 = t % 40 === 0;
if (t40) reloadConfig();
const players = world.getPlayers();
for (let i = 0; i < players.length; i++) {
const player = players[i];
if (!player.hasTag("fopt_hud_saver") || t2) {
updatePlayerHud(player, { isEvery10Ticks: t10, isEvery20Ticks: t20 });
}
if (t10) {
if (cfg.java_saturation_enabled || cfg.sat) checkSaturation(player);
checkXp(player);
}
if (t40) updateShieldAnimation(player);
}
tickCounter = (tickCounter + 1) % TICK_WRAP;
}, 2);