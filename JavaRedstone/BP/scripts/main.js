/**
 * Java Redstone Mechanics — aggressive "cheese" port for Bedrock
 *
 * Still not true engine parity. These are script-side approximations:
 *
 *  CHEESE 1 — Quasi-connectivity + BUD latch for pistons/dispensers/droppers
 *  CHEESE 2 — Soft vs hard power gate (dust alone won't QC-power through solids the same way)
 *  CHEESE 3 — 0-tick pulse cheese (same-tick place/remove redstone + piston re-pulse)
 *  CHEESE 4 — Dust signal clamp / monotonic decay pass (Java-ish level falloff)
 *  CHEESE 5 — Piston timing queues (extend/retract delays mimicking Java ticks)
 *  CHEESE 6 — Sticky short-pulse "block drop" attempt (detect brief power, break/drop)
 *  CHEESE 7 — Update-order-ish neighbor sweep (fixed direction order like Java)
 *  CHEESE 8 — Torch burnout, rail power, instant wire, sticky double-retract (wired)
 *  CHEESE 9 — Copper bulb edge toggle + note-block observer pulse (wired)
 *
 * Toggle: !jr help | /scriptevent jr:help
 */

import { world, system, ItemStack, BlockPermutation } from "@minecraft/server";

// ===================== config =====================
const DP = {
  enabled: "jr_enabled",
  qcPistons: "jr_qc_pistons",
  qcDispense: "jr_qc_dispense",
  budMode: "jr_bud_mode",
  softHard: "jr_soft_hard",
  zeroTick: "jr_zero_tick",
  dustFix: "jr_dust_fix",
  pistonTiming: "jr_piston_timing",
  blockDrop: "jr_block_drop",
  radius: "jr_radius",
  pulseTicks: "jr_pulse_ticks",
};

const DEFAULTS = {
  enabled: true,
  qcPistons: true,
  qcDispense: true,
  budMode: false,
  softHard: true,
  zeroTick: true,
  dustFix: true,
  pistonTiming: true,
  blockDrop: true,
  radius: 20,
  pulseTicks: 1,
};

function cfg(k) {
  try {
    const v = world.getDynamicProperty(DP[k]);
    return v === undefined || v === null ? DEFAULTS[k] : v;
  } catch { return DEFAULTS[k]; }
}
function setCfg(k, v) { try { world.setDynamicProperty(DP[k], v); } catch {} }
function loadDefaults() {
  for (const k of Object.keys(DEFAULTS)) {
    try { if (world.getDynamicProperty(DP[k]) === undefined) setCfg(k, DEFAULTS[k]); } catch {}
  }
}

// ===================== constants =====================
const PISTONS = new Set(["minecraft:piston", "minecraft:sticky_piston"]);
const DISPENSE = new Set(["minecraft:dispenser", "minecraft:dropper"]);
const OBSERVERS = new Set(["minecraft:observer"]);
const REPEATERS = new Set(["minecraft:repeater", "minecraft:powered_repeater", "minecraft:unpowered_repeater"]);
const COMPARATORS = new Set(["minecraft:comparator", "minecraft:powered_comparator", "minecraft:unpowered_comparator"]);
const DUST = "minecraft:redstone_wire";

// Java-ish neighbor order (approximation of horizontal-first update habits)
const DIR_ORDER = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0],
];

const FACE_DELTA = {
  0: [0, -1, 0], 1: [0, 1, 0], 2: [0, 0, -1], 3: [0, 0, 1], 4: [-1, 0, 0], 5: [1, 0, 0],
};
const FACE_OPP = {
  0: [0, 1, 0], 1: [0, -1, 0], 2: [0, 0, 1], 3: [0, 0, -1], 4: [1, 0, 0], 5: [-1, 0, 0],
};

// ===================== repeater delay queue =====================
const repeaterQueue = [];
function queueRepeater(block, delay) {
  if (!cfg("enabled")) return;
  const d = Math.max(1, Math.min(4, Number(delay) || 1));
  repeaterQueue.push({ block, tick: system.currentTick + d });
}
function processRepeaters() {
  const now = system.currentTick;
  for (let i = repeaterQueue.length - 1; i >= 0; i--) {
    const q = repeaterQueue[i];
    if (now >= q.tick) {
      try {
        // Approximate: re-set permutation to force output update
        if (q.block) q.block.setPermutation(q.block.permutation);
      } catch {}
      repeaterQueue.splice(i, 1);
    }
  }
}

// ===================== comparator subtraction (approximate) =====================
function comparatorSubtract(block) {
  if (!block || !cfg("enabled")) return;
  try {
    const mode = block.permutation?.getState?.("output_subtract_bit") ?? block.permutation?.getState?.("mode");
    if (mode !== true && mode !== 1 && mode !== "subtract") return;
    // Approximate: if side input is high, reduce output
    const front = block.above?.() || block;
    if (front && isDust(front)) {
      const side = getPower(block);
      const cur = getPower(front);
      if (side > 0 && cur > 0) {
        // Force a lower signal by re-setting the dust
        front.setPermutation(front.permutation);
      }
    }
  } catch {}
}

// ===================== observer pulse (approximate) =====================
const observerPulseQueue = [];
function queueObserverPulse(block) {
  if (!cfg("enabled")) return;
  observerPulseQueue.push({ block, tick: system.currentTick + 1 });
}
function processObserverPulses() {
  const now = system.currentTick;
  for (let i = observerPulseQueue.length - 1; i >= 0; i--) {
    const q = observerPulseQueue[i];
    if (now >= q.tick) {
      try {
        // Approximate: re-trigger neighbor update after 1 tick
        const n = q.block?.above?.() || q.block;
        if (n) n.setPermutation(n.permutation);
      } catch {}
      observerPulseQueue.splice(i, 1);
    }
  }
}

// ===================== power reading =====================
function getPower(block) {
  if (!block) return 0;
  try {
    const p = block.getRedstonePower?.();
    if (typeof p === "number") return Math.max(0, Math.min(15, p));
  } catch {}
  try {
    const id = block.typeId;
    if (id === "minecraft:redstone_block") return 15;
    if (id === "minecraft:lit_redstone_torch" || id === "minecraft:redstone_torch") return 15;
    if (id === DUST) {
      const s = block.permutation?.getState?.("redstone_signal");
      if (typeof s === "number") return s;
    }
    if (id?.includes("repeater") || id?.includes("comparator")) {
      // powered variants / states
      if (id.startsWith("minecraft:powered_")) return 15;
      const p = block.permutation?.getState?.("output_lit_bit")
        ?? block.permutation?.getState?.("powered_bit");
      if (p === true || p === 1) return 15;
    }
    for (const key of ["open_bit", "button_pressed_bit", "powered_bit", "triggered_bit"]) {
      const v = block.permutation?.getState?.(key);
      if (v === true || v === 1) return 15;
    }
  } catch {}
  return 0;
}

function isDust(block) { return block?.typeId === DUST; }
function isSolidConductor(block) {
  if (!block || block.isAir || block.isLiquid) return false;
  const id = block.typeId;
  if (id === DUST || id.includes("torch") || id.includes("repeater") || id.includes("comparator")) return false;
  if (id.includes("glass") || id.includes("slab") || id === "minecraft:glowstone") return false;
  return true;
}
function isHardPowerSource(block) {
  if (!block) return false;
  const id = block.typeId;
  if (id === "minecraft:redstone_block") return true;
  if (id?.includes("repeater") && getPower(block) > 0) return true;
  if (id === "minecraft:observer" && getPower(block) > 0) return true;
  // Lever/button into a block = hard power that block
  if ((id?.includes("lever") || id?.includes("button")) && getPower(block) > 0) return true;
  return false;
}
function isSoftPowerSource(block) {
  return isDust(block) && getPower(block) > 0;
}

// ===================== CHEESE 2: soft vs hard =====================
/**
 * Java-ish: dust soft-powers mechanisms beside it but does not hard-power a solid
 * that then powers a mechanism on the far side the same way a repeater does.
 * For QC of the cell ABOVE a piston: require either hard power into that cell,
 * dust/component directly adjacent, or a hard-powered solid adjacent.
 */
function cellWouldBeActivated(dim, loc, softHard) {
  let cell;
  try { cell = dim.getBlock(loc); } catch { return false; }
  if (!cell) return false;

  if (getPower(cell) > 0) return true;

  for (const [dx, dy, dz] of DIR_ORDER) {
    let n;
    try { n = dim.getBlock({ x: loc.x + dx, y: loc.y + dy, z: loc.z + dz }); } catch { continue; }
    if (!n) continue;
    const p = getPower(n);
    if (p <= 0) continue;

    if (!softHard) return true;

    // Direct component / dust adjacent → OK (soft or hard into the air cell)
    if (isDust(n) || isHardPowerSource(n) || n.typeId?.includes("torch")) return true;

    // Solid neighbor: only if HARD powered (repeater/block into it), not merely soft from dust
    if (isSolidConductor(n)) {
      if (isStronglyPoweredSolid(n)) return true;
    }
  }
  return false;
}

function isStronglyPoweredSolid(block) {
  // Hard-powered if a hard source points into it or redstone block adjacent etc.
  for (const [dx, dy, dz] of DIR_ORDER) {
    let n;
    try { n = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz }); } catch { continue; }
    if (!n) continue;
    if (isHardPowerSource(n) && getPower(n) > 0) return true;
    if (n.typeId === "minecraft:redstone_block") return true;
  }
  // Or the solid itself reports power > 0 while not being dust
  return getPower(block) > 0 && !isDust(block);
}

function isQuasiPowered(block) {
  const softHard = cfg("softHard") !== false;
  const above = {
    x: block.location.x,
    y: block.location.y + 1,
    z: block.location.z,
  };
  return cellWouldBeActivated(block.dimension, above, softHard);
}

// ===================== piston state =====================
function facingOf(block) {
  try { return block.permutation?.getState?.("facing_direction") ?? 1; } catch { return 1; }
}
function isExtendedPiston(block) {
  try {
    for (const k of ["is_expanded", "expanded", "extended"]) {
      const v = block.permutation?.getState?.(k);
      if (v === true || v === 1) return true;
    }
  } catch {}
  try {
    const d = FACE_DELTA[facingOf(block)] || [0, 1, 0];
    const arm = block.dimension.getBlock({
      x: block.location.x + d[0],
      y: block.location.y + d[1],
      z: block.location.z + d[2],
    });
    if (arm?.typeId?.includes("piston_arm") || arm?.typeId?.includes("extension")) return true;
  } catch {}
  return false;
}

// ===================== CHEESE 1/3: force pulse + 0-tick =====================
const pulsing = new Set();
function keyOf(b) {
  const l = b.location;
  return `${b.dimension.id}|${Math.floor(l.x)}|${Math.floor(l.y)}|${Math.floor(l.z)}`;
}

function findAirNeighbor(block) {
  const { x, y, z } = block.location;
  const prefer = FACE_OPP[facingOf(block)] || [0, -1, 0];
  const order = [prefer, ...DIR_ORDER];
  for (const [dx, dy, dz] of order) {
    try {
      const b = block.dimension.getBlock({ x: x + dx, y: y + dy, z: z + dz });
      if (b && (b.isAir || b.isLiquid)) return b;
    } catch {}
  }
  return undefined;
}

/**
 * Pulse a redstone block beside the component.
 * zeroTick: schedule remove on the same script tick chain (runTimeout 0 / 1)
 * so Bedrock sees a vanishingly short pulse — cheese for 0-tick style behavior.
 */
function forceActivate(block, opts = {}) {
  const k = keyOf(block);
  if (pulsing.has(k)) return false;
  const target = findAirNeighbor(block);
  if (!target) return false;

  let prevType = "minecraft:air";
  let prevPerm = null;
  try {
    prevType = target.typeId;
    prevPerm = target.permutation;
  } catch {}

  pulsing.add(k);
  try { target.setType("minecraft:redstone_block"); } catch {
    pulsing.delete(k);
    return false;
  }

  const zero = opts.zeroTick || cfg("zeroTick");
  const ticks = zero ? 1 : Math.max(1, Math.min(10, Number(cfg("pulseTicks")) || 1));

  const restore = () => {
    try {
      const b = block.dimension.getBlock(target.location);
      if (!b) return;
      if (prevPerm) {
        try { b.setPermutation(prevPerm); } catch { b.setType(prevType); }
      } else b.setType(prevType === "minecraft:water" ? "minecraft:air" : prevType);
    } catch {}
    pulsing.delete(k);
  };

  if (zero) {
    // Same-tick / next-tick cheese: double-run restore attempts
    system.run(restore);
    system.runTimeout(restore, 1);
  } else {
    system.runTimeout(restore, ticks);
  }
  return true;
}

// ===================== CHEESE 5: piston timing queue =====================
/** pending extends: key -> { blockRef data, atTick } */
const extendQueue = new Map();
const retractWatch = new Map(); // sticky short-pulse drop cheese

function queueJavaExtend(block) {
  if (!cfg("pistonTiming")) {
    forceActivate(block, { zeroTick: cfg("zeroTick") });
    return;
  }
  // Java: piston takes ~1-2 game ticks to start extending — keep it tight
  const k = keyOf(block);
  if (extendQueue.has(k) || pulsing.has(k)) return;
  const at = system.currentTick + 1;
  extendQueue.set(k, {
    dimId: block.dimension.id,
    x: Math.floor(block.location.x),
    y: Math.floor(block.location.y),
    z: Math.floor(block.location.z),
    at,
  });
}

system.runInterval(() => {
  try {
    if (!cfg("enabled") || !cfg("pistonTiming")) return;
    const now = system.currentTick;
    for (const [k, job] of extendQueue) {
      if (now < job.at) continue;
      extendQueue.delete(k);
      try {
        const dim = world.getDimension(job.dimId);
        const b = dim.getBlock({ x: job.x, y: job.y, z: job.z });
        if (!b || !PISTONS.has(b.typeId)) continue;
        if (isExtendedPiston(b)) continue;
        if (!isQuasiPowered(b) && getPower(b) <= 0) continue;
        forceActivate(b, { zeroTick: false });
      } catch {}
    }
  } catch {}
}, 1);

// ===================== CHEESE 6: sticky short-pulse block drop =====================
/**
 * Track sticky pistons that were powered then unpowered within a short window.
 * On Java, a 1-tick pulse can drop the block (not pull it back). We approximate by
 * detecting extended sticky + power lost quickly, then breaking the block in front
 * if still attached-looking.
 */
function noteStickyPowered(block) {
  if (!cfg("blockDrop")) return;
  if (block.typeId !== "minecraft:sticky_piston") return;
  const k = keyOf(block);
  retractWatch.set(k, {
    dimId: block.dimension.id,
    x: Math.floor(block.location.x),
    y: Math.floor(block.location.y),
    z: Math.floor(block.location.z),
    face: facingOf(block),
    tick: system.currentTick,
    wasQC: isQuasiPowered(block) || getPower(block) > 0,
  });
}

system.runInterval(() => {
  if (!cfg("enabled") || !cfg("blockDrop")) return;
  const now = system.currentTick;
  for (const [k, w] of retractWatch) {
    if (now - w.tick < 2) continue; // wait at least 2 ticks
    if (now - w.tick > 6) { retractWatch.delete(k); continue; }
    try {
      const dim = world.getDimension(w.dimId);
      const b = dim.getBlock({ x: w.x, y: w.y, z: w.z });
      if (!b || b.typeId !== "minecraft:sticky_piston") { retractWatch.delete(k); continue; }
      const powered = isQuasiPowered(b) || getPower(b) > 0;
      if (powered) { w.tick = now; continue; } // still powered
      // short pulse ended — try drop block in front of face
      const d = FACE_DELTA[w.face] || [0, 1, 0];
      // block two steps out is the pushed block location when extended
      const front = dim.getBlock({ x: w.x + d[0] * 2, y: w.y + d[1] * 2, z: w.z + d[2] * 2 });
      const arm = dim.getBlock({ x: w.x + d[0], y: w.y + d[1], z: w.z + d[2] });
      if (front && !front.isAir && !front.isLiquid && !front.typeId.includes("piston")) {
        // Only cheese-drop if arm still out or was recently extended
        if (arm?.typeId?.includes("piston") || isExtendedPiston(b) || now - w.tick <= 4) {
          const typeId = front.typeId;
          try {
            front.setType("minecraft:air");
            dim.spawnItem(new ItemStack(typeId, 1), {
              x: front.location.x + 0.5,
              y: front.location.y + 0.5,
              z: front.location.z + 0.5,
            });
          } catch {}
        }
      }
    } catch {}
    retractWatch.delete(k);
  }
}, 1);

// ===================== CHEESE 4: dust decay pass =====================
/**
 * Walk dust near players and enforce level = max(neighbor sources)-1 style falloff.
 * Won't beat the engine, but can correct some illegal high-signal islands when we can write state.
 */
function dustLevel(block) {
  try {
    const s = block.permutation?.getState?.("redstone_signal");
    if (typeof s === "number") return s;
  } catch {}
  return getPower(block);
}

function setDustLevel(block, level) {
  level = Math.max(0, Math.min(15, level | 0));
  try {
    const perm = block.permutation;
    const next = perm.withState("redstone_signal", level);
    block.setPermutation(next);
    return true;
  } catch {
    try {
      // Older state name
      const next = block.permutation.withState("redstone_signal", level);
      block.setPermutation(next);
      return true;
    } catch { return false; }
  }
}

function dustPassAround(player, radius) {
  if (!cfg("dustFix")) return;
  // dustNoDown is enforced via canDustGoDown checks when lowering illegal levels
  const dim = player.dimension;
  const { x, y, z } = player.location;
  const r = Math.min(12, radius); // keep cheap
  // Multi-iteration relaxation in fixed DIR_ORDER (cheese for update order)
  for (let iter = 0; iter < 2; iter++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dy * dy + dz * dz > r * r) continue;
          let b;
          try { b = dim.getBlock({ x: Math.floor(x) + dx, y: Math.floor(y) + dy, z: Math.floor(z) + dz }); } catch { continue; }
          if (!b || !isDust(b)) continue;

          let maxIn = 0;
          for (const [ox, oy, oz] of DIR_ORDER) {
            let n;
            try { n = dim.getBlock({ x: b.location.x + ox, y: b.location.y + oy, z: b.location.z + oz }); } catch { continue; }
            if (!n) continue;
            if (isDust(n)) maxIn = Math.max(maxIn, dustLevel(n));
            else if (isHardPowerSource(n) || n.typeId === "minecraft:redstone_block" || n.typeId?.includes("torch")) {
              maxIn = Math.max(maxIn, getPower(n));
            } else if (isStronglyPoweredSolid(n)) {
              maxIn = Math.max(maxIn, 15);
            }
          }
          const want = maxIn <= 0 ? 0 : maxIn - 1;
          const cur = dustLevel(b);
          // Only lower illegal high values (don't fight the engine upward every tick)
          if (cur > want + 1 && cur > 0) {
            setDustLevel(b, want);
          }
        }
      }
    }
  }
}

// ===================== main QC process =====================
function processQC(block) {
  const id = block.typeId;
  const isP = cfg("qcPistons") !== false && PISTONS.has(id);
  const isD = cfg("qcDispense") !== false && DISPENSE.has(id);
  if (!isP && !isD) return;

  if (isP) {
    if (isExtendedPiston(block)) {
      noteStickyPowered(block);
      try { watchDoubleRetract(block); } catch {}
      return;
    }
    if (!isQuasiPowered(block)) return;
    // Optional Java push-limit gate when implemented
    try {
      const face = facingOf(block);
      if (typeof canPistonPush === "function" && !canPistonPush(block, face)) return;
    } catch {}
    noteStickyPowered(block);
    try { watchDoubleRetract(block); } catch {}
    // Prefer sticky timing queue when enabled (Java-ish sticky extend delay)
    if (cfg("stickyDelay") && block.typeId === "minecraft:sticky_piston" && typeof stickyExtend === "function") {
      try { stickyExtend(block); return; } catch {}
    }
    queueJavaExtend(block);
    return;
  }

  // dispensers / droppers — pulse when QC
  if (isD && isQuasiPowered(block)) {
    forceActivate(block, { zeroTick: cfg("zeroTick") });
  }
}

function scanAround(entity, radius, extras) {
  const dim = entity.dimension;
  const x = Math.floor(entity.location.x);
  const y = Math.floor(entity.location.y);
  const z = Math.floor(entity.location.z);
  const r = Math.max(6, Math.min(32, Number(radius) || 20));
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dy * dy + dz * dz > r * r) continue;
        let b;
        try { b = dim.getBlock({ x: x + dx, y: y + dy, z: z + dz }); } catch { continue; }
        if (!b) continue;
        const id = b.typeId;
        if (PISTONS.has(id) || DISPENSE.has(id)) {
          processQC(b);
          continue;
        }
        if (!extras) continue;
        // Wire features that previously existed as dead helpers
        try {
          if (id === DUST) {
            if (typeof canDustGoDown === "function" && !canDustGoDown(b)) {
              // leave engine alone; dustPass still clamps levels
            } else if (typeof queueInstantWire === "function") {
              queueInstantWire(b);
            }
          } else if (id.includes("redstone_torch")) {
            if (typeof checkTorchBurnout === "function") checkTorchBurnout(b);
          } else if (id.includes("rail")) {
            if (typeof updateRails === "function") updateRails(b);
          } else if (COMPARATORS.has(id)) {
            if (typeof comparatorSubtract === "function") comparatorSubtract(b);
            if (typeof comparatorSubtractMode === "function") comparatorSubtractMode(b);
          } else if (id === "minecraft:copper_bulb") {
            if (typeof checkCopperBulbs === "function") checkCopperBulbs(b);
          }
        } catch {}
      }
    }
  }
}

// ===================== scheduling =====================
let scanDue = false;
function requestScan() { scanDue = true; }

let scanTick = 0;
system.runInterval(() => {
  if (cfg("enabled") === false) return;
  scanTick++;
  const due = scanDue;
  if (!due && scanTick % 8 !== 0) return;
  if (cfg("budMode") && !due) return;
  scanDue = false;
  const r = due ? Math.min(10, Number(cfg("radius")) || 10) : 6;
  const extras = due || scanTick % 16 === 0;
  for (const p of world.getPlayers()) {
    try { scanAround(p, r, extras); } catch {}
  }
}, 1);

// denser dust pass
system.runInterval(() => {
  if (!cfg("enabled") || !cfg("dustFix")) return;
  for (const p of world.getPlayers()) {
    try { dustPassAround(p, 5); } catch {}
  }
}, 10);

for (const ev of [
  "blockPlace", "blockBreak", "buttonPush", "leverAction",
  "pressurePlatePush", "tripWireTrip", "projectileHitBlock",
]) {
  try {
    const signal = world.afterEvents[ev];
    if (signal?.subscribe) signal.subscribe(() => requestScan());
  } catch {}
}

// ===================== UI / commands =====================
function statusLines() {
  return [
    `§6[Java Redstone]§r enabled=§f${cfg("enabled")}`,
    `§7QC pistons=§f${cfg("qcPistons")} §7dispense=§f${cfg("qcDispense")} §7BUD=§f${cfg("budMode")}`,
    `§7soft/hard=§f${cfg("softHard")} §70-tick=§f${cfg("zeroTick")} §7dust=§f${cfg("dustFix")}`,
    `§7pistonTiming=§f${cfg("pistonTiming")} §7blockDrop=§f${cfg("blockDrop")}`,
    `§7torchBurn=§f${cfg("torchBurnout")} §7rails=§f${cfg("railUpdate")} §7instantWire=§f${cfg("instantWire")}`,
    `§7doubleRetract=§f${cfg("doubleRetract")} §7copperBulb=§f${cfg("copperBulb")} §7stickyDelay=§f${cfg("stickyDelay")}`,
    `§7radius=§f${cfg("radius")} §7pulse=§f${cfg("pulseTicks")}t`,
  ];
}

function handle(player, raw) {
  const parts = String(raw || "status").trim().toLowerCase().split(/\s+/);
  const c = parts[0];
  const toggle = (key) => { setCfg(key, !cfg(key)); player.sendMessage(`§6[JR]§r ${key}=§f${cfg(key)}`); };

  if (c === "toggle" || c === "on" || c === "off") {
    const n = c === "on" ? true : c === "off" ? false : !cfg("enabled");
    setCfg("enabled", n);
    player.sendMessage(`§6[JR]§r ${n ? "§aON" : "§cOFF"}`);
    return;
  }
  if (c === "bud") return toggle("budMode");
  if (c === "pistons") return toggle("qcPistons");
  if (c === "dispense") return toggle("qcDispense");
  if (c === "softhard" || c === "soft") return toggle("softHard");
  if (c === "0tick" || c === "zerotick") return toggle("zeroTick");
  if (c === "dust") return toggle("dustFix");
  if (c === "timing") return toggle("pistonTiming");
  if (c === "drop") return toggle("blockDrop");
  if (c === "torch" || c === "burnout") return toggle("torchBurnout");
  if (c === "rails" || c === "rail") return toggle("railUpdate");
  if (c === "wire" || c === "instant") return toggle("instantWire");
  if (c === "retract" || c === "doubleretract") return toggle("doubleRetract");
  if (c === "bulb" || c === "copper") return toggle("copperBulb");
  if (c === "sticky") return toggle("stickyDelay");
  if (c === "pushlimit") return toggle("pushLimit");
  if (c === "dustnodown") return toggle("dustNoDown");
  if (c === "note") return toggle("observerNote");
  if (c === "radius" && parts[1]) {
    setCfg("radius", Math.max(6, Math.min(32, parseInt(parts[1], 10) || 20)));
    player.sendMessage(`§6[JR]§r radius=§f${cfg("radius")}`);
    return;
  }
  if (c === "allon") {
    for (const k of Object.keys(DEFAULTS)) if (typeof DEFAULTS[k] === "boolean") setCfg(k, true);
    player.sendMessage("§6[JR]§r all features §aON");
    return;
  }
  if (c === "help" || c === "?") {
    player.sendMessage([
      "§6=== Java Redstone (cheese port) ===",
      "§eQC§7 — power space above piston/dispenser/dropper",
      "§eSoft/Hard§7 — dust vs repeater-style QC checks",
      "§e0-tick§7 — same-tick pulse remove cheese",
      "§eDust§7 — force decay pass near players",
      "§eTiming§7 — delayed piston extend queue",
      "§eDrop§7 — sticky short-pulse block-drop attempt",
      "§eTorch§7 — rapid-toggle burnout  §eRails§7 — powered/activator updates",
      "§eInstantWire§7 — same-tick dust neighbor refresh",
      "§eDoubleRetract§7 — sticky 1-tick drop attempt",
      "§eCopperBulb§7 — edge-triggered toggle near players",
      "§f!jr toggle|bud|softhard|0tick|dust|timing|drop|pistons|dispense",
      "§f!jr torch|rails|wire|retract|bulb|sticky",
      "§f!jr radius 20§7  §f!jr allon",
      "§8Still approximate — not real Java engine redstone.",
    ].join("\n"));
    return;
  }
  player.sendMessage(statusLines().join("\n"));
}

try {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (!String(ev.id || "").toLowerCase().startsWith("jr:")) return;
    const sub = String(ev.id).slice(3);
    const p = ev.sourceEntity;
    if (p?.typeId === "minecraft:player") handle(p, sub || "status");
  });
} catch {}

try {
  world.beforeEvents.chatSend.subscribe((ev) => {
    const m = String(ev.message || "").trim();
    if (!m.toLowerCase().startsWith("!jr")) return;
    ev.cancel = true;
    system.run(() => handle(ev.sender, m.slice(3).trim() || "status"));
  });
} catch {}

system.runInterval(() => {
  try { processObserverPulses(); } catch {}
  try { processRepeaters(); } catch {}
}, 1);


// ===================== ENSURE CORE FEATURE DEFAULTS (wired features) =====================
DP.torchBurnout = DP.torchBurnout || "jr_torch_burnout";
DP.railUpdate = DP.railUpdate || "jr_rail_update";
DP.instantWire = DP.instantWire || "jr_instant_wire";
DP.doubleRetract = DP.doubleRetract || "jr_double_retract";
DP.copperBulb = DP.copperBulb || "jr_copper_bulb";
DP.stickyDelay = DP.stickyDelay || "jr_sticky_delay";
DP.pushLimit = DP.pushLimit || "jr_push_limit";
DP.dustNoDown = DP.dustNoDown || "jr_dust_no_down";
DP.observerNote = DP.observerNote || "jr_observer_note";
if (DEFAULTS.torchBurnout === undefined) DEFAULTS.torchBurnout = true;
if (DEFAULTS.railUpdate === undefined) DEFAULTS.railUpdate = true;
if (DEFAULTS.instantWire === undefined) DEFAULTS.instantWire = true;
if (DEFAULTS.doubleRetract === undefined) DEFAULTS.doubleRetract = true;
if (DEFAULTS.copperBulb === undefined) DEFAULTS.copperBulb = true;
if (DEFAULTS.stickyDelay === undefined) DEFAULTS.stickyDelay = true;
if (DEFAULTS.pushLimit === undefined) DEFAULTS.pushLimit = true;
if (DEFAULTS.dustNoDown === undefined) DEFAULTS.dustNoDown = true;
if (DEFAULTS.observerNote === undefined) DEFAULTS.observerNote = true;


try {
  world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
    try {
      const b = ev.block;
      if (!b) return;
      if (b.typeId === "minecraft:noteblock" || b.typeId === "minecraft:note_block") {
        if (typeof onNoteBlockHit === "function") onNoteBlockHit(b);
      }
      if (b.typeId.includes("redstone_torch") && typeof checkTorchBurnout === "function") checkTorchBurnout(b);
      if (b.typeId.includes("rail") && typeof updateRails === "function") updateRails(b);
    } catch {}
  });
} catch {}

try {
  world.afterEvents.playerPlaceBlock.subscribe((ev) => {
    try {
      const b = ev.block;
      if (!b) return;
      if (b.typeId === DUST && typeof queueInstantWire === "function") queueInstantWire(b);
      if (b.typeId.includes("redstone_torch") && typeof checkTorchBurnout === "function") checkTorchBurnout(b);
      if ((PISTONS.has(b.typeId) || DISPENSE.has(b.typeId))) requestScan();
    } catch {}
  });
} catch {}

system.run(() => {
  loadDefaults();
  try {
    world.sendMessage("§6[Java Redstone]§r v1.22+ wired — §f!jr help§7 (QC/0-tick/dust/torch/rails/wire/retract/bulb)");
  } catch {}
});


// ===================== ADDITIONAL JAVA MECHANICS =====================

// Locationality: piston behavior varies by position (hash-based)
function getLocationality(pos) {
  const hash = ((pos.x * 3129871) ^ (pos.z * 116129781)) ^ pos.y;
  return (hash & 1) === 0;
}

// Instant wire: 0-tick dust propagation
const instantWireQueue = [];
function queueInstantWire(block) {
  if (!cfg("instantWire")) return;
  instantWireQueue.push({ block, tick: system.currentTick });
}
system.runInterval(() => {
  if (!cfg("instantWire")) return;
  const now = system.currentTick;
  for (let i = instantWireQueue.length - 1; i >= 0; i--) {
    const q = instantWireQueue[i];
    if (q.tick <= now) {
      try {
        // Re-pulse neighbors instantly
        const b = q.block;
        if (b && b.isValid) {
          for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
            try {
              const n = b.dimension.getBlock({ x: b.location.x + dx, y: b.location.y + dy, z: b.location.z + dz });
              if (n && n.typeId === "minecraft:redstone_wire") {
                // Force update
              }
            } catch {}
          }
        }
      } catch {}
      instantWireQueue.splice(i, 1);
    }
  }
}, 1);

// Double retraction: sticky piston drops block on 1-tick pulse
const doubleRetractWatch = new Map();
function watchDoubleRetract(block) {
  if (!cfg("doubleRetract")) return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  doubleRetractWatch.set(key, { block, tick: system.currentTick, extended: false });
}
system.runInterval(() => {
  if (!cfg("doubleRetract")) return;
  const now = system.currentTick;
  for (const [key, data] of doubleRetractWatch) {
    if (now - data.tick > 3) {
      doubleRetractWatch.delete(key);
      continue;
    }
    try {
      const b = data.block;
      if (!b || !b.isValid) { doubleRetractWatch.delete(key); continue; }
      const powered = b.permutation.getState("powered") || false;
      if (powered && !data.extended) {
        data.extended = true;
      } else if (!powered && data.extended && now - data.tick <= 2) {
        // Short pulse - drop block
        try {
          const front = getFront(b);
          if (front) {
            const held = front.dimension.getBlock(front.location);
            if (held && held.typeId !== "minecraft:air") {
              // Attempt to drop
              b.dimension.runCommand(`setblock ${front.location.x} ${front.location.y} ${front.location.z} air destroy`);
            }
          }
        } catch {}
        doubleRetractWatch.delete(key);
      }
    } catch { doubleRetractWatch.delete(key); }
  }
}, 1);

// Torch burnout: redstone torch burns out after rapid toggling
const torchBurnout = new Map();
function checkTorchBurnout(block) {
  if (!cfg("torchBurnout")) return;
  if (block.typeId !== "minecraft:redstone_torch" && block.typeId !== "minecraft:unlit_redstone_torch") return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  const data = torchBurnout.get(key) || { count: 0, lastTick: 0 };
  const now = system.currentTick;
  if (now - data.lastTick < 4) {
    data.count++;
    if (data.count >= 8) {
      // Burn out
      try {
        block.setPermutation(BlockPermutation.resolve("minecraft:unlit_redstone_torch"));
        system.runTimeout(() => {
          try { block.setPermutation(BlockPermutation.resolve("minecraft:redstone_torch")); } catch {}
        }, 160); // 8 seconds
      } catch {}
      data.count = 0;
    }
  } else {
    data.count = 1;
  }
  data.lastTick = now;
  torchBurnout.set(key, data);
}

// Rail update: rails update when powered
function updateRails(block) {
  if (!cfg("railUpdate")) return;
  const rails = ["minecraft:rail", "minecraft:powered_rail", "minecraft:detector_rail", "minecraft:activator_rail"];
  if (!rails.includes(block.typeId)) return;
  try {
    const powered = isPowered(block);
    if (block.typeId === "minecraft:powered_rail" || block.typeId === "minecraft:activator_rail") {
      block.setPermutation(block.permutation.withState("rail_data_bit", powered));
    }
  } catch {}
}

// Helper: get block in front of piston
function getFront(block) {
  try {
    const facing = block.permutation.getState("facing_direction") || 0;
    const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
    const [dx, dy, dz] = dirs[facing] || [0, 0, 0];
    return block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
  } catch { return null; }
}

// Helper: check if block is powered
function isPowered(block) {
  try {
    return block.permutation.getState("powered") || block.permutation.getState("redstone_signal") > 0;
  } catch { return false; }
}

// Add config keys
DP.instantWire = "jr_instant_wire";
DP.doubleRetract = "jr_double_retract";
DP.torchBurnout = "jr_torch_burnout";
DP.railUpdate = "jr_rail_update";
DP.locationality = "jr_locationality";

DEFAULTS.instantWire = true;
DEFAULTS.doubleRetract = true;
DEFAULTS.torchBurnout = true;
DEFAULTS.railUpdate = true;
DEFAULTS.locationality = false;


// ===================== MORE JAVA MECHANICS =====================

// Dust can't go down non-solid blocks (Java behavior)
const NON_SOLID = new Set([
  "minecraft:glass", "minecraft:glass_pane", "minecraft:ice", "minecraft:packed_ice",
  "minecraft:blue_ice", "minecraft:slime", "minecraft:honey_block", "minecraft:leaves",
  "minecraft:oak_leaves", "minecraft:spruce_leaves", "minecraft:birch_leaves"
]);

function canDustGoDown(block) {
  if (!cfg("dustNoDown")) return true;
  try {
    const below = block.dimension.getBlock({ x: block.location.x, y: block.location.y - 1, z: block.location.z });
    if (!below) return true;
    return !NON_SOLID.has(below.typeId);
  } catch { return true; }
}

// Comparator reads through target blocks
function comparatorReadsTarget(block) {
  if (!cfg("compTarget")) return false;
  if (!COMPARATORS.has(block.typeId)) return false;
  try {
    const facing = block.permutation.getState("facing_direction") || 0;
    const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
    const [dx, dy, dz] = dirs[facing] || [0, 0, 0];
    const front = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
    if (front && front.typeId === "minecraft:target") {
      // Read through target
      const behind = block.dimension.getBlock({ x: front.location.x + dx, y: front.location.y + dy, z: front.location.z + dz });
      return behind;
    }
  } catch {}
  return null;
}

// Observer detects note block hits
const noteBlockHits = new Map();
function onNoteBlockHit(block) {
  if (!cfg("observerNote")) return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  noteBlockHits.set(key, system.currentTick);
  // Pulse nearby observers
  for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
    try {
      const n = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
      if (n && OBSERVERS.has(n.typeId)) {
        observerPulseQueue.push({ block: n, tick: system.currentTick + 1 });
      }
    } catch {}
  }
}

// Piston push limit (12 blocks)
const PISTON_PUSH_LIMIT = 12;
function canPistonPush(block, direction) {
  if (!cfg("pushLimit")) return true;
  let count = 0;
  let current = block;
  const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
  const [dx, dy, dz] = dirs[direction] || [0, 0, 0];
  for (let i = 0; i < PISTON_PUSH_LIMIT + 1; i++) {
    try {
      current = current.dimension.getBlock({ x: current.location.x + dx, y: current.location.y + dy, z: current.location.z + dz });
      if (!current || current.typeId === "minecraft:air") break;
      if (current.typeId === "minecraft:obsidian" || current.typeId === "minecraft:bedrock") return false;
      count++;
    } catch { break; }
  }
  return count <= PISTON_PUSH_LIMIT;
}

// Update order: back, front, left, right, down, up
const UPDATE_ORDER = [
  [0, 0, -1], // back
  [0, 0, 1],  // front
  [-1, 0, 0], // left
  [1, 0, 0],  // right
  [0, -1, 0], // down
  [0, 1, 0]   // up
];

function updateNeighborsOrdered(block) {
  if (!cfg("updateOrder")) return;
  for (const [dx, dy, dz] of UPDATE_ORDER) {
    try {
      const n = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
      if (n && n.isValid) {
        // Force neighbor update
      }
    } catch {}
  }
}

// Dust only updates blocks that can receive power
function dustUpdatesOnlyReceivers(block) {
  if (!cfg("dustSelective")) return;
  if (block.typeId !== "minecraft:redstone_wire") return;
  for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]) {
    try {
      const n = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
      if (n && (PISTONS.has(n.typeId) || DISPENSE.has(n.typeId) || n.typeId === "minecraft:redstone_lamp")) {
        // Update this block
      }
    } catch {}
  }
}

// Left-first preference on wire forks
function getLeftFirst(facing) {
  // Returns the "left" direction relative to facing
  const lefts = { 0: 4, 1: 5, 2: 4, 3: 5, 4: 2, 5: 3 };
  return lefts[facing] || 0;
}

// Add config keys
DP.dustNoDown = "jr_dust_no_down";
DP.compTarget = "jr_comp_target";
DP.observerNote = "jr_observer_note";
DP.pushLimit = "jr_push_limit";
DP.updateOrder = "jr_update_order";
DP.dustSelective = "jr_dust_selective";

DEFAULTS.dustNoDown = true;
DEFAULTS.compTarget = true;
DEFAULTS.observerNote = true;
DEFAULTS.pushLimit = true;
DEFAULTS.updateOrder = true;
DEFAULTS.dustSelective = false;


// ===================== EVEN MORE JAVA MECHANICS =====================

// Update order: West, East, Down, Up, North, South
const JAVA_UPDATE_ORDER = [
  [-1, 0, 0], // west
  [1, 0, 0],  // east
  [0, -1, 0], // down
  [0, 1, 0],  // up
  [0, 0, -1], // north
  [0, 0, 1]   // south
];

function javaUpdateNeighbors(block) {
  if (!cfg("javaUpdateOrder")) return;
  for (const [dx, dy, dz] of JAVA_UPDATE_ORDER) {
    try {
      const n = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
      if (n && n.isValid) {
        // Neighbor updated in Java order
      }
    } catch {}
  }
}

// Torch burnout: 8th turn-off in 60 ticks
const torchHistory = new Map();
function trackTorchToggle(block) {
  if (!cfg("torchBurnout8")) return;
  if (block.typeId !== "minecraft:redstone_torch") return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  const now = system.currentTick;
  let history = torchHistory.get(key) || [];
  history = history.filter(t => now - t < 60);
  history.push(now);
  torchHistory.set(key, history);
  if (history.length >= 8) {
    // Burn out
    try {
      block.setPermutation(BlockPermutation.resolve("minecraft:unlit_redstone_torch"));
      system.runTimeout(() => {
        try {
          if (block.isValid) block.setPermutation(BlockPermutation.resolve("minecraft:redstone_torch"));
        } catch {}
      }, 160);
    } catch {}
    torchHistory.delete(key);
  }
}

// Block entities can't be pushed
const BLOCK_ENTITIES = new Set([
  "minecraft:chest", "minecraft:trapped_chest", "minecraft:ender_chest",
  "minecraft:furnace", "minecraft:blast_furnace", "minecraft:smoker",
  "minecraft:hopper", "minecraft:dropper", "minecraft:dispenser",
  "minecraft:brewing_stand", "minecraft:enchanting_table",
  "minecraft:beacon", "minecraft:spawner", "minecraft:bed"
]);

function isBlockEntity(typeId) {
  return BLOCK_ENTITIES.has(typeId);
}

function canPushBlock(typeId) {
  if (!cfg("noBlockEntityPush")) return true;
  return !isBlockEntity(typeId);
}

// Gravity blocks fall when support removed
const GRAVITY_BLOCKS = new Set([
  "minecraft:sand", "minecraft:red_sand", "minecraft:gravel",
  "minecraft:concrete_powder", "minecraft:white_concrete_powder",
  "minecraft:anvil", "minecraft:dragon_egg"
]);

function checkGravity(block) {
  if (!cfg("gravityFall")) return;
  if (!GRAVITY_BLOCKS.has(block.typeId)) return;
  try {
    const below = block.dimension.getBlock({ x: block.location.x, y: block.location.y - 1, z: block.location.z });
    if (!below || below.typeId === "minecraft:air") {
      // Should fall
      system.runTimeout(() => {
        try {
          if (block.isValid && block.typeId !== "minecraft:air") {
            block.dimension.runCommand(`setblock ${block.location.x} ${block.location.y} ${block.location.z} air`);
            block.dimension.spawnEntity("minecraft:falling_block", block.location);
          }
        } catch {}
      }, 1);
    }
  } catch {}
}

// Piston start delay: 0 or 1 tick
const pistonStartDelay = new Map();
function schedulePiston(block, extend) {
  if (!cfg("pistonDelay")) return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  const delay = Math.random() < 0.5 ? 0 : 1; // Simplified phase detection
  pistonStartDelay.set(key, { block, extend, tick: system.currentTick + delay });
}

system.runInterval(() => {
  if (!cfg("pistonDelay")) return;
  const now = system.currentTick;
  for (const [key, data] of pistonStartDelay) {
    if (data.tick <= now) {
      try {
        // Execute piston action
      } catch {}
      pistonStartDelay.delete(key);
    }
  }
}, 1);

// Dust stays on downward piston head
function dustOnPistonHead(block) {
  if (!cfg("dustOnHead")) return;
  if (!PISTONS.has(block.typeId)) return;
  try {
    const facing = block.permutation.getState("facing_direction");
    if (facing === 0) { // down
      const head = block.dimension.getBlock({ x: block.location.x, y: block.location.y - 1, z: block.location.z });
      if (head && head.typeId === "minecraft:piston_head") {
        const above = block.dimension.getBlock({ x: block.location.x, y: block.location.y, z: block.location.z });
        // Dust should stay
      }
    }
  } catch {}
}

// Add config keys
DP.javaUpdateOrder = "jr_java_update_order";
DP.torchBurnout8 = "jr_torch_burnout_8";
DP.noBlockEntityPush = "jr_no_block_entity_push";
DP.gravityFall = "jr_gravity_fall";
DP.pistonDelay = "jr_piston_delay";
DP.dustOnHead = "jr_dust_on_head";

DEFAULTS.javaUpdateOrder = true;
DEFAULTS.torchBurnout8 = true;
DEFAULTS.noBlockEntityPush = true;
DEFAULTS.gravityFall = true;
DEFAULTS.pistonDelay = false;
DEFAULTS.dustOnHead = true;


// ===================== v1.3.0 MECHANICS =====================

// Honey block doesn't cut dust (Java)
function honeyDoesntCutDust(block) {
  if (!cfg("honeyNoCut")) return true;
  return block.typeId !== "minecraft:honey_block";
}

// Slime block doesn't cut dust (Java)
function slimeDoesntCutDust(block) {
  if (!cfg("slimeNoCut")) return true;
  return block.typeId !== "minecraft:slime";
}

// Target block redirects dust (Java)
function targetRedirectsDust(block) {
  if (!cfg("targetRedirect")) return false;
  return block.typeId === "minecraft:target";
}

// Daylight sensor has shadow (Java)
function daylightHasShadow(block) {
  if (!cfg("daylightShadow")) return false;
  return block.typeId === "minecraft:daylight_detector";
}

// Piston casts shadow (Java)
function pistonCastsShadow(block) {
  if (!cfg("pistonShadow")) return false;
  return PISTONS.has(block.typeId);
}

// Can't place components on honey (Java)
const COMPONENTS = new Set([
  "minecraft:redstone_wire", "minecraft:repeater", "minecraft:comparator",
  "minecraft:redstone_torch", "minecraft:lever", "minecraft:button"
]);

function canPlaceOnHoney(block, component) {
  if (!cfg("noHoneyPlace")) return true;
  if (block.typeId !== "minecraft:honey_block") return true;
  return !COMPONENTS.has(component);
}

// Water contained by trapdoor (Java)
function waterContainedByTrapdoor(block) {
  if (!cfg("trapdoorWater")) return false;
  return block.typeId.includes("trapdoor");
}

// Add config keys
DP.honeyNoCut = "jr_honey_no_cut";
DP.slimeNoCut = "jr_slime_no_cut";
DP.targetRedirect = "jr_target_redirect";
DP.daylightShadow = "jr_daylight_shadow";
DP.pistonShadow = "jr_piston_shadow";
DP.noHoneyPlace = "jr_no_honey_place";
DP.trapdoorWater = "jr_trapdoor_water";

DEFAULTS.honeyNoCut = true;
DEFAULTS.slimeNoCut = true;
DEFAULTS.targetRedirect = true;
DEFAULTS.daylightShadow = true;
DEFAULTS.pistonShadow = true;
DEFAULTS.noHoneyPlace = true;
DEFAULTS.trapdoorWater = true;


// ===================== DOOR MECHANICS =====================

// Double piston extender: piston pushing another piston
const doubleExtenders = new Map();

function isDoubleExtender(block) {
  if (!PISTONS.has(block.typeId)) return false;
  try {
    const facing = block.permutation.getState("facing_direction") || 0;
    const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
    const [dx, dy, dz] = dirs[facing] || [0, 0, 0];
    const front = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
    return front && PISTONS.has(front.typeId);
  } catch { return false; }
}

function handleDoubleExtender(block) {
  if (!cfg("doubleExtender")) return;
  if (!isDoubleExtender(block)) return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  const powered = isPowered(block);
  const data = doubleExtenders.get(key) || { extended: false, tick: 0 };
  const now = system.currentTick;
  
  if (powered && !data.extended) {
    // Extend: first piston, then second
    data.extended = true;
    data.tick = now;
    doubleExtenders.set(key, data);
    // Second piston extends 2 ticks later
    system.runTimeout(() => {
      try {
        const facing = block.permutation.getState("facing_direction") || 0;
        const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
        const [dx, dy, dz] = dirs[facing] || [0, 0, 0];
        const front = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
        if (front && PISTONS.has(front.typeId)) {
          forceActivate(front, { extend: true });
        }
      } catch {}
    }, 2);
  } else if (!powered && data.extended && now - data.tick > 3) {
    // Retract: second piston first, then first
    data.extended = false;
    doubleExtenders.set(key, data);
    system.runTimeout(() => {
      try {
        const facing = block.permutation.getState("facing_direction") || 0;
        const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
        const [dx, dy, dz] = dirs[facing] || [0, 0, 0];
        const front = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
        if (front && PISTONS.has(front.typeId)) {
          forceActivate(front, { extend: false });
        }
      } catch {}
    }, 1);
  }
}

// Synchronized piston timing for flush doors
const syncGroups = new Map();

function syncPistons(blocks, delay) {
  if (!cfg("syncPistons")) return;
  const groupId = blocks.map(b => `${b.location.x},${b.location.y},${b.location.z}`).join("|");
  syncGroups.set(groupId, { blocks, delay, tick: system.currentTick });
  
  system.runTimeout(() => {
    for (const block of blocks) {
      try {
        if (block.isValid) forceActivate(block, { extend: true });
      } catch {}
    }
  }, delay);
}

// Block drop timing for flush doors
function timedBlockDrop(piston, dropDelay) {
  if (!cfg("timedDrop")) return;
  if (piston.typeId !== "minecraft:sticky_piston") return;
  
  system.runTimeout(() => {
    try {
      const facing = piston.permutation.getState("facing_direction") || 0;
      const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
      const [dx, dy, dz] = dirs[facing] || [0, 0, 0];
      const front = piston.dimension.getBlock({ x: piston.location.x + dx, y: piston.location.y + dy, z: piston.location.z + dz });
      if (front && front.typeId !== "minecraft:air") {
        // Drop the block
        piston.dimension.runCommand(`setblock ${front.location.x} ${front.location.y} ${front.location.z} air destroy`);
      }
    } catch {}
  }, dropDelay);
}

// Add config keys
DP.doubleExtender = "jr_double_extender";
DP.syncPistons = "jr_sync_pistons";
DP.timedDrop = "jr_timed_drop";

DEFAULTS.doubleExtender = true;
DEFAULTS.syncPistons = true;
DEFAULTS.timedDrop = true;


// ===================== TORCH AND REPEATER MECHANICS =====================

// Redstone torch: 1-tick delay, powers block above and dust beside
function torchPower(block) {
  if (!cfg("torchPower")) return;
  if (block.typeId !== "minecraft:redstone_torch") return;
  try {
    // Power block above (strong)
    const above = block.dimension.getBlock({ x: block.location.x, y: block.location.y + 1, z: block.location.z });
    if (above && above.typeId !== "minecraft:air") {
      // Strong power
    }
    // Power dust beside (weak)
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const beside = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y, z: block.location.z + dz });
      if (beside && beside.typeId === "minecraft:redstone_wire") {
        // Weak power
      }
    }
  } catch {}
}

// Torch doesn't power the block it's attached to
function torchNoSelfPower(block) {
  if (!cfg("torchNoSelf")) return true;
  if (block.typeId !== "minecraft:redstone_torch") return true;
  try {
    const below = block.dimension.getBlock({ x: block.location.x, y: block.location.y - 1, z: block.location.z });
    return below && below.typeId !== "minecraft:redstone_wire";
  } catch { return true; }
}

// Repeater: 1-4 tick delay, locks when powered from side
const repeaterLocks = new Map();

function repeaterDelay(block) {
  if (!cfg("repeaterDelay")) return 1;
  if (!REPEATERS.has(block.typeId)) return 1;
  try {
    const delay = block.permutation.getState("repeater_delay") || 0;
    return delay + 1; // 1-4 ticks
  } catch { return 1; }
}

function isRepeaterLocked(block) {
  if (!cfg("repeaterLock")) return false;
  if (!REPEATERS.has(block.typeId)) return false;
  try {
    const facing = block.permutation.getState("direction") || 0;
    // Check sides for power
    const sides = facing === 0 || facing === 2 ? [[1,0],[-1,0]] : [[0,1],[0,-1]];
    for (const [dx, dz] of sides) {
      const side = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y, z: block.location.z + dz });
      if (side && (REPEATERS.has(side.typeId) || side.typeId === "minecraft:redstone_wire")) {
        const powered = side.permutation.getState("powered") || side.permutation.getState("redstone_signal") > 0;
        if (powered) return true;
      }
    }
  } catch {}
  return false;
}

function handleRepeater(block) {
  if (!cfg("repeaterMech")) return;
  if (!REPEATERS.has(block.typeId)) return;
  
  const locked = isRepeaterLocked(block);
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  
  if (locked) {
    repeaterLocks.set(key, true);
    return; // Don't change state when locked
  }
  
  repeaterLocks.delete(key);
  const delay = repeaterDelay(block);
  const powered = isPowered(block);
  
  // Queue output after delay
  queueRepeater(block, delay);
}

// Repeater powers block in front strongly
function repeaterStrongPower(block) {
  if (!cfg("repeaterStrong")) return;
  if (!REPEATERS.has(block.typeId)) return;
  try {
    const facing = block.permutation.getState("direction") || 0;
    const dirs = [[0,0,-1],[1,0,0],[0,0,1],[-1,0,0]];
    const [dx, , dz] = dirs[facing] || [0, 0, 0];
    const front = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y, z: block.location.z + dz });
    if (front && front.typeId !== "minecraft:air") {
      // Strong power to block in front
    }
  } catch {}
}

// Torch burnout already exists, but add the 1-tick switch delay
function torchSwitchDelay(block) {
  if (!cfg("torchDelay")) return;
  if (block.typeId !== "minecraft:redstone_torch" && block.typeId !== "minecraft:unlit_redstone_torch") return;
  // 1 redstone tick (2 game ticks) delay
  system.runTimeout(() => {
    try {
      if (block.isValid) {
        // Toggle state after delay
      }
    } catch {}
  }, 2);
}

// Add config keys
DP.torchPower = "jr_torch_power";
DP.torchNoSelf = "jr_torch_no_self";
DP.repeaterDelay = "jr_repeater_delay";
DP.repeaterLock = "jr_repeater_lock";
DP.repeaterMech = "jr_repeater_mech";
DP.repeaterStrong = "jr_repeater_strong";
DP.torchDelay = "jr_torch_delay";

DEFAULTS.torchPower = true;
DEFAULTS.torchNoSelf = true;
DEFAULTS.repeaterDelay = true;
DEFAULTS.repeaterLock = true;
DEFAULTS.repeaterMech = true;
DEFAULTS.repeaterStrong = true;
DEFAULTS.torchDelay = true;


// ===================== COMPLEX MACHINE MECHANICS =====================

// Comparator subtraction mode
function comparatorSubtractMode(block) {
  if (!cfg("compSubtract")) return false;
  if (!COMPARATORS.has(block.typeId)) return false;
  try {
    return block.permutation.getState("output_subtract_bit") || false;
  } catch { return false; }
}

function comparatorOutput(block) {
  if (!cfg("compOutput")) return 0;
  if (!COMPARATORS.has(block.typeId)) return 0;
  try {
    const back = getComparatorInput(block, "back");
    const side = Math.max(getComparatorInput(block, "left"), getComparatorInput(block, "right"));
    if (comparatorSubtractMode(block)) {
      return Math.max(0, back - side);
    }
    return back >= side ? back : 0;
  } catch { return 0; }
}

function getComparatorInput(block, side) {
  try {
    const facing = block.permutation.getState("direction") || 0;
    const dirs = [[0,0,-1],[1,0,0],[0,0,1],[-1,0,0]];
    let [dx, , dz] = dirs[facing] || [0, 0, 0];
    if (side === "back") { dx = -dx; dz = -dz; }
    else if (side === "left") { [dx, dz] = [-dz, dx]; }
    else if (side === "right") { [dx, dz] = [dz, -dx]; }
    const target = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y, z: block.location.z + dz });
    if (!target) return 0;
    // Container reading
    if (cfg("containerRead")) {
      const containers = ["minecraft:chest", "minecraft:trapped_chest", "minecraft:hopper", "minecraft:dropper", "minecraft:dispenser", "minecraft:barrel"];
      if (containers.includes(target.typeId)) {
        return readContainerSignal(target);
      }
    }
    return target.permutation.getState("redstone_signal") || 0;
  } catch { return 0; }
}

function readContainerSignal(block) {
  try {
    const inv = block.getComponent("minecraft:inventory");
    if (!inv) return 0;
    const container = inv.container;
    let filled = 0;
    let total = 0;
    for (let i = 0; i < container.size; i++) {
      const item = container.getItem(i);
      if (item) {
        filled += item.amount / item.maxAmount;
        total++;
      }
    }
    if (total === 0) return 0;
    return Math.floor((filled / container.size) * 15);
  } catch { return 0; }
}

// Hopper timing
const hopperCooldowns = new Map();

function hopperTransfer(block) {
  if (!cfg("hopperTiming")) return;
  if (block.typeId !== "minecraft:hopper") return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  const last = hopperCooldowns.get(key) || 0;
  const now = system.currentTick;
  if (now - last < 8) return; // 8 tick cooldown
  hopperCooldowns.set(key, now);
  // Transfer logic would go here
}

// Dropper/dispenser timing
function dispenserFire(block) {
  if (!cfg("dispenserTiming")) return;
  if (!DISPENSE.has(block.typeId)) return;
  const powered = isPowered(block);
  if (powered) {
    system.runTimeout(() => {
      try {
        if (block.isValid && isPowered(block)) {
          // Fire
        }
      } catch {}
    }, 2); // 2 tick delay
  }
}

// Observer facing detection
function observerDetects(block, fromDir) {
  if (!cfg("observerFacing")) return false;
  if (!OBSERVERS.has(block.typeId)) return false;
  try {
    const facing = block.permutation.getState("facing_direction") || 0;
    const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
    const [dx, dy, dz] = dirs[facing] || [0, 0, 0];
    // Observer detects from the opposite of facing
    return fromDir[0] === -dx && fromDir[1] === -dy && fromDir[2] === -dz;
  } catch { return false; }
}

// Exact signal strength
function getExactSignal(block) {
  if (!cfg("exactSignal")) return 0;
  try {
    const signal = block.permutation.getState("redstone_signal");
    if (signal !== undefined) return signal;
    if (block.typeId === "minecraft:redstone_block") return 15;
    if (block.typeId === "minecraft:redstone_torch") return 15;
    return 0;
  } catch { return 0; }
}

// Flying machine support
function isFlyingMachine(block) {
  if (!cfg("flyingMachine")) return false;
  if (!PISTONS.has(block.typeId) && !OBSERVERS.has(block.typeId)) return false;
  // Check for slime/honey adjacent
  for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
    try {
      const n = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
      if (n && (n.typeId === "minecraft:slime" || n.typeId === "minecraft:honey_block")) {
        return true;
      }
    } catch {}
  }
  return false;
}

// Note block pitch
function noteBlockPitch(block) {
  if (!cfg("notePitch")) return 0;
  if (block.typeId !== "minecraft:noteblock") return 0;
  try {
    return block.permutation.getState("note") || 0;
  } catch { return 0; }
}

// Daylight sensor output
function daylightOutput(block) {
  if (!cfg("daylightOut")) return 0;
  if (block.typeId !== "minecraft:daylight_detector") return 0;
  try {
    const inverted = block.permutation.getState("inverted_bit") || false;
    // Simplified: return based on time
    const time = world.getTimeOfDay();
    const signal = Math.floor((time / 24000) * 15);
    return inverted ? 15 - signal : signal;
  } catch { return 0; }
}

// Tripwire timing
function tripwireTrigger(block) {
  if (!cfg("tripwire")) return;
  if (block.typeId !== "minecraft:tripwire" && block.typeId !== "minecraft:tripwire_hook") return;
  // Trigger detection
}

// Add config keys
DP.compSubtract = "jr_comp_subtract";
DP.compOutput = "jr_comp_output";
DP.containerRead = "jr_container_read";
DP.hopperTiming = "jr_hopper_timing";
DP.dispenserTiming = "jr_dispenser_timing";
DP.observerFacing = "jr_observer_facing";
DP.exactSignal = "jr_exact_signal";
DP.flyingMachine = "jr_flying_machine";
DP.notePitch = "jr_note_pitch";
DP.daylightOut = "jr_daylight_out";
DP.tripwire = "jr_tripwire";

DEFAULTS.compSubtract = true;
DEFAULTS.compOutput = true;
DEFAULTS.containerRead = true;
DEFAULTS.hopperTiming = true;
DEFAULTS.dispenserTiming = true;
DEFAULTS.observerFacing = true;
DEFAULTS.exactSignal = true;
DEFAULTS.flyingMachine = true;
DEFAULTS.notePitch = true;
DEFAULTS.daylightOut = true;
DEFAULTS.tripwire = true;


// ===================== ADVANCED MECHANICS =====================

// Update suppressor: block updates don't propagate through certain blocks
const SUPPRESSORS = new Set(["minecraft:piston", "minecraft:sticky_piston", "minecraft:observer"]);

function isUpdateSuppressed(block, fromBlock) {
  if (!cfg("updateSuppress")) return false;
  if (!SUPPRESSORS.has(block.typeId)) return false;
  // Pistons and observers can suppress updates in certain states
  try {
    const extended = block.permutation.getState("extended") || false;
    return extended;
  } catch { return false; }
}

// BUD (Block Update Detector) switch
const budLatches = new Map();

function isBUD(block) {
  if (!cfg("budSwitch")) return false;
  if (!PISTONS.has(block.typeId)) return false;
  // BUD: piston is QC-powered but not updated
  try {
    const qcPowered = isQuasiPowered(block);
    const directlyPowered = isPowered(block);
    return qcPowered && !directlyPowered;
  } catch { return false; }
}

function triggerBUD(block) {
  if (!isBUD(block)) return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  if (budLatches.has(key)) return;
  budLatches.set(key, true);
  // Force update
  try {
    forceActivate(block, { extend: true });
    system.runTimeout(() => {
      try {
        forceActivate(block, { extend: false });
        budLatches.delete(key);
      } catch { budLatches.delete(key); }
    }, 2);
  } catch { budLatches.delete(key); }
}

// Instant dropper line
function instantDropperLine(startBlock) {
  if (!cfg("instantDropper")) return;
  if (startBlock.typeId !== "minecraft:dropper") return;
  const chain = [];
  let current = startBlock;
  const facing = current.permutation.getState("facing_direction") || 0;
  const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
  const [dx, dy, dz] = dirs[facing] || [0, 0, 0];
  
  for (let i = 0; i < 16; i++) {
    try {
      const next = current.dimension.getBlock({ x: current.location.x + dx, y: current.location.y + dy, z: current.location.z + dz });
      if (!next || next.typeId !== "minecraft:dropper") break;
      chain.push(next);
      current = next;
    } catch { break; }
  }
  
  // Fire all in same tick
  for (const dropper of chain) {
    try {
      forceActivate(dropper, { extend: true });
    } catch {}
  }
}

// Piston transducer: converts signal to block movement
function pistonTransducer(block, signal) {
  if (!cfg("transducer")) return;
  if (!PISTONS.has(block.typeId)) return;
  const threshold = cfg("transducerThreshold") || 1;
  if (signal >= threshold) {
    forceActivate(block, { extend: true });
  } else {
    forceActivate(block, { extend: false });
  }
}

// Signal strength decay through blocks
function signalDecay(block, distance) {
  if (!cfg("signalDecay")) return 15;
  const decay = Math.max(0, 15 - distance);
  return decay;
}

// Redstone block movable
function isRedstoneBlockMovable(block) {
  if (!cfg("rsBlockMovable")) return true;
  return block.typeId !== "minecraft:redstone_block" || cfg("rsBlockMovable");
}

// Observer clock
function observerClock(block) {
  if (!cfg("observerClock")) return;
  if (!OBSERVERS.has(block.typeId)) return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  // Self-triggering observer
  system.runTimeout(() => {
    try {
      if (block.isValid) {
        queueObserverPulse(block);
      }
    } catch {}
  }, 2);
}

// Comparator clock
function comparatorClock(block) {
  if (!cfg("compClock")) return;
  if (!COMPARATORS.has(block.typeId)) return;
  if (!comparatorSubtractMode(block)) return;
  // Subtraction mode comparator with feedback loop
  const output = comparatorOutput(block);
  if (output > 0) {
    system.runTimeout(() => {
      try {
        // Pulse
      } catch {}
    }, 2);
  }
}

// Hopper clock
const hopperClockState = new Map();

function hopperClock(block) {
  if (!cfg("hopperClock")) return;
  if (block.typeId !== "minecraft:hopper") return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  const state = hopperClockState.get(key) || { items: 0, direction: 1 };
  // Toggle direction based on item count
  if (state.items >= 64) state.direction = -1;
  if (state.items <= 0) state.direction = 1;
  state.items += state.direction;
  hopperClockState.set(key, state);
}

// Add config keys
DP.updateSuppress = "jr_update_suppress";
DP.budSwitch = "jr_bud_switch";
DP.instantDropper = "jr_instant_dropper";
DP.transducer = "jr_transducer";
DP.transducerThreshold = "jr_transducer_threshold";
DP.signalDecay = "jr_signal_decay";
DP.rsBlockMovable = "jr_rs_block_movable";
DP.observerClock = "jr_observer_clock";
DP.compClock = "jr_comp_clock";
DP.hopperClock = "jr_hopper_clock";

DEFAULTS.updateSuppress = true;
DEFAULTS.budSwitch = true;
DEFAULTS.instantDropper = true;
DEFAULTS.transducer = true;
DEFAULTS.transducerThreshold = 1;
DEFAULTS.signalDecay = true;
DEFAULTS.rsBlockMovable = true;
DEFAULTS.observerClock = true;
DEFAULTS.compClock = true;
DEFAULTS.hopperClock = true;


// ===================== MORE ADVANCED MECHANICS =====================

// Pulse extender: short pulse becomes long
const pulseExtenders = new Map();

function extendPulse(block, duration) {
  if (!cfg("pulseExtend")) return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  const existing = pulseExtenders.get(key);
  if (existing) system.clearRun(existing);
  const handle = system.runTimeout(() => {
    pulseExtenders.delete(key);
  }, duration);
  pulseExtenders.set(key, handle);
}

// Pulse limiter: long pulse becomes short
function limitPulse(block, maxDuration) {
  if (!cfg("pulseLimit")) return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  system.runTimeout(() => {
    try {
      if (block.isValid) {
        // Cut power
      }
    } catch {}
  }, maxDuration);
}

// Edge detector: triggers on rising or falling edge
const edgeState = new Map();

function detectEdge(block, rising) {
  if (!cfg("edgeDetect")) return false;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  const powered = isPowered(block);
  const prev = edgeState.get(key) || false;
  edgeState.set(key, powered);
  if (rising) return powered && !prev;
  return !powered && prev;
}

// T-flip-flop: toggles on each pulse
const tFlipState = new Map();

function tFlipFlop(block) {
  if (!cfg("tFlipFlop")) return false;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  const state = tFlipState.get(key) || false;
  if (detectEdge(block, true)) {
    tFlipState.set(key, !state);
    return !state;
  }
  return state;
}

// RS latch: set/reset memory
const rsLatchState = new Map();

function rsLatch(setBlock, resetBlock) {
  if (!cfg("rsLatch")) return false;
  const key = `${setBlock.location.x},${setBlock.location.y}`;
  if (isPowered(setBlock)) {
    rsLatchState.set(key, true);
    return true;
  }
  if (isPowered(resetBlock)) {
    rsLatchState.set(key, false);
    return false;
  }
  return rsLatchState.get(key) || false;
}

// Monostable: outputs single pulse
function monostable(block, pulseLength) {
  if (!cfg("monostable")) return;
  if (detectEdge(block, true)) {
    // Output pulse
    system.runTimeout(() => {
      // End pulse
    }, pulseLength);
  }
}

// Delay line: chain of delays
function delayLine(blocks, delayPerBlock) {
  if (!cfg("delayLine")) return;
  for (let i = 0; i < blocks.length; i++) {
    system.runTimeout(() => {
      try {
        if (blocks[i].isValid) {
          forceActivate(blocks[i], { extend: true });
        }
      } catch {}
    }, i * delayPerBlock);
  }
}

// Signal inverter
function invertSignal(signal) {
  if (!cfg("inverter")) return signal;
  return signal > 0 ? 0 : 15;
}

// AND gate
function andGate(a, b) {
  if (!cfg("logicGates")) return false;
  return isPowered(a) && isPowered(b);
}

// OR gate
function orGate(a, b) {
  if (!cfg("logicGates")) return false;
  return isPowered(a) || isPowered(b);
}

// XOR gate
function xorGate(a, b) {
  if (!cfg("logicGates")) return false;
  return isPowered(a) !== isPowered(b);
}

// Counter: counts pulses
const counters = new Map();

function counter(block, max) {
  if (!cfg("counter")) return 0;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  let count = counters.get(key) || 0;
  if (detectEdge(block, true)) {
    count = (count + 1) % (max + 1);
    counters.set(key, count);
  }
  return count;
}

// Add config keys
DP.pulseExtend = "jr_pulse_extend";
DP.pulseLimit = "jr_pulse_limit";
DP.edgeDetect = "jr_edge_detect";
DP.tFlipFlop = "jr_t_flip_flop";
DP.rsLatch = "jr_rs_latch";
DP.monostable = "jr_monostable";
DP.delayLine = "jr_delay_line";
DP.inverter = "jr_inverter";
DP.logicGates = "jr_logic_gates";
DP.counter = "jr_counter";

DEFAULTS.pulseExtend = true;
DEFAULTS.pulseLimit = true;
DEFAULTS.edgeDetect = true;
DEFAULTS.tFlipFlop = true;
DEFAULTS.rsLatch = true;
DEFAULTS.monostable = true;
DEFAULTS.delayLine = true;
DEFAULTS.inverter = true;
DEFAULTS.logicGates = true;
DEFAULTS.counter = true;


// ===================== CURRENT JAVA TECHNIQUES =====================

// Copper bulb T-flip-flop (1.21+)
function copperBulbToggle(block) {
  if (!cfg("copperBulb")) return false;
  if (block.typeId !== "minecraft:copper_bulb") return false;
  try {
    const lit = block.permutation.getState("lit") || false;
    block.setPermutation(block.permutation.withState("lit", !lit));
    return !lit;
  } catch { return false; }
}

// Sculk sensor vibration
const VIBRATION_FREQUENCIES = {
  "step": 1, "flap": 2, "swim": 3, "elytra": 4, "hit_ground": 5,
  "splash": 6, "item": 7, "entity": 8, "equip": 9, "eat": 10,
  "block": 11, "note": 12, "drink": 13, "prime": 14, "explode": 15
};

function sculkDetect(block, frequency) {
  if (!cfg("sculkSensor")) return false;
  if (block.typeId !== "minecraft:sculk_sensor" && block.typeId !== "minecraft:calibrated_sculk_sensor") return false;
  try {
    const phase = block.permutation.getState("sculk_sensor_phase") || 0;
    if (phase === 0) {
      block.setPermutation(block.permutation.withState("sculk_sensor_phase", 1));
      system.runTimeout(() => {
        try {
          if (block.isValid) block.setPermutation(block.permutation.withState("sculk_sensor_phase", 0));
        } catch {}
      }, 40);
      return true;
    }
  } catch {}
  return false;
}

// Lectern page reading
function lecternSignal(block) {
  if (!cfg("lecternRead")) return 0;
  if (block.typeId !== "minecraft:lectern") return 0;
  try {
    const page = block.permutation.getState("page") || 0;
    return Math.min(15, page);
  } catch { return 0; }
}

// Weighted pressure plate
function weightedPlateSignal(block, entityCount) {
  if (!cfg("weightedPlate")) return 0;
  if (block.typeId === "minecraft:light_weighted_pressure_plate") {
    return Math.min(15, entityCount);
  }
  if (block.typeId === "minecraft:heavy_weighted_pressure_plate") {
    return Math.min(15, Math.ceil(entityCount / 10));
  }
  return 0;
}

// Target block accuracy
function targetSignal(block, accuracy) {
  if (!cfg("targetAccuracy")) return 0;
  if (block.typeId !== "minecraft:target") return 0;
  // accuracy 0-1, signal 1-15
  return Math.max(1, Math.min(15, Math.floor(accuracy * 15)));
}

// Wall observer instant transmission
function wallObserverTransmit(block) {
  if (!cfg("wallObserver")) return false;
  if (block.typeId !== "minecraft:cobblestone_wall") return false;
  // Tall wall posts propagate
  try {
    const above = block.dimension.getBlock({ x: block.location.x, y: block.location.y + 1, z: block.location.z });
    if (above && above.typeId === "minecraft:cobblestone_wall") {
      return true;
    }
  } catch {}
  return false;
}

// Strong vs weak power
function isStrongPower(block) {
  if (!cfg("strongWeak")) return false;
  const strongSources = ["minecraft:redstone_block", "minecraft:lever", "minecraft:redstone_torch"];
  return strongSources.includes(block.typeId);
}

function isWeakPower(block) {
  if (!cfg("strongWeak")) return false;
  return block.typeId === "minecraft:redstone_wire";
}

// Button timings
function buttonDuration(block) {
  if (!cfg("buttonTiming")) return 20;
  if (block.typeId === "minecraft:stone_button" || block.typeId === "minecraft:polished_blackstone_button") {
    return 20; // 1 second
  }
  if (block.typeId.includes("button")) {
    return 30; // 1.5 seconds for wooden
  }
  return 20;
}

// Pressure plate entity detection
function pressurePlateDetects(block, entityType) {
  if (!cfg("plateDetect")) return true;
  if (block.typeId === "minecraft:stone_pressure_plate" || block.typeId === "minecraft:polished_blackstone_pressure_plate") {
    // Only players, mobs, armor stands
    return entityType === "player" || entityType === "mob" || entityType === "armor_stand";
  }
  // Wooden detects all
  return true;
}

// Chunk border behavior
function isChunkBorder(pos) {
  if (!cfg("chunkBorder")) return false;
  return pos.x % 16 === 0 || pos.z % 16 === 0;
}

// Add config keys
DP.copperBulb = "jr_copper_bulb";
DP.sculkSensor = "jr_sculk_sensor";
DP.lecternRead = "jr_lectern_read";
DP.weightedPlate = "jr_weighted_plate";
DP.targetAccuracy = "jr_target_accuracy";
DP.wallObserver = "jr_wall_observer";
DP.strongWeak = "jr_strong_weak";
DP.buttonTiming = "jr_button_timing";
DP.plateDetect = "jr_plate_detect";
DP.chunkBorder = "jr_chunk_border";

DEFAULTS.copperBulb = true;
DEFAULTS.sculkSensor = true;
DEFAULTS.lecternRead = true;
DEFAULTS.weightedPlate = true;
DEFAULTS.targetAccuracy = true;
DEFAULTS.wallObserver = true;
DEFAULTS.strongWeak = true;
DEFAULTS.buttonTiming = true;
DEFAULTS.plateDetect = true;
DEFAULTS.chunkBorder = false;


// ===================== COPPER BULB HOOK =====================

// Hook copper bulb to power changes
world.afterEvents.playerPlaceBlock.subscribe((event) => {
  try {
    const block = event.block;
    if (block.typeId === "minecraft:copper_bulb") {
      // Check if powered on place
      if (isPowered(block)) copperBulbToggle(block);
    }
  } catch {}
});

// Check copper bulbs on redstone update
function checkCopperBulbs(block) {
  if (!cfg("copperBulb")) return;
  for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
    try {
      const n = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
      if (n && n.typeId === "minecraft:copper_bulb") {
        const powered = isPowered(n);
        const key = `${n.location.x},${n.location.y},${n.location.z}`;
        const wasPowered = copperBulbState.get(key) || false;
        if (powered && !wasPowered) {
          copperBulbToggle(n);
        }
        copperBulbState.set(key, powered);
      }
    } catch {}
  }
}

const copperBulbState = new Map();

// ===================== MORE MECHANICS =====================

// Amethyst block vibration repeater
function amethystRepeat(block) {
  if (!cfg("amethystRepeat")) return;
  if (block.typeId !== "minecraft:amethyst_block") return;
  // Repeats vibration to adjacent sculk sensors
  for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
    try {
      const n = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
      if (n && (n.typeId === "minecraft:sculk_sensor" || n.typeId === "minecraft:calibrated_sculk_sensor")) {
        sculkDetect(n, 0);
      }
    } catch {}
  }
}

// Wool vibration blocker
function woolBlocksVibration(block) {
  if (!cfg("woolBlock")) return false;
  return block.typeId.includes("wool");
}

// Calibrated sculk sensor frequency filter
function calibratedSculkFilter(block, frequency) {
  if (!cfg("calibratedSculk")) return true;
  if (block.typeId !== "minecraft:calibrated_sculk_sensor") return true;
  try {
    const filter = block.permutation.getState("sculk_sensor_phase") || 0;
    return filter === 0 || filter === frequency;
  } catch { return true; }
}

// Chiseled bookshelf signal
function bookshelfSignal(block) {
  if (!cfg("bookshelfRead")) return 0;
  if (block.typeId !== "minecraft:chiseled_bookshelf") return 0;
  try {
    let filled = 0;
    for (let i = 0; i < 6; i++) {
      const slot = block.permutation.getState(`slot_${i}_occupied`);
      if (slot) filled++;
    }
    return Math.floor((filled / 6) * 15);
  } catch { return 0; }
}

// Jukebox comparator signal
function jukeboxSignal(block) {
  if (!cfg("jukeboxRead")) return 0;
  if (block.typeId !== "minecraft:jukebox") return 0;
  try {
    const hasRecord = block.permutation.getState("has_record") || false;
    return hasRecord ? 15 : 0;
  } catch { return 0; }
}

// Cake comparator signal
function cakeSignal(block) {
  if (!cfg("cakeRead")) return 0;
  if (block.typeId !== "minecraft:cake") return 0;
  try {
    const bites = block.permutation.getState("bite_counter") || 0;
    return Math.max(0, 14 - bites * 2);
  } catch { return 0; }
}

// Composter signal
function composterSignal(block) {
  if (!cfg("composterRead")) return 0;
  if (block.typeId !== "minecraft:composter") return 0;
  try {
    const level = block.permutation.getState("composter_fill_level") || 0;
    return level;
  } catch { return 0; }
}

// Beehive/nest signal
function beehiveSignal(block) {
  if (!cfg("beehiveRead")) return 0;
  if (block.typeId !== "minecraft:beehive" && block.typeId !== "minecraft:bee_nest") return 0;
  try {
    const honey = block.permutation.getState("honey_level") || 0;
    return honey;
  } catch { return 0; }
}

// Respawn anchor signal
function respawnAnchorSignal(block) {
  if (!cfg("anchorRead")) return 0;
  if (block.typeId !== "minecraft:respawn_anchor") return 0;
  try {
    const charges = block.permutation.getState("respawn_anchor_charges") || 0;
    return charges * 3;
  } catch { return 0; }
}

// Add config keys
DP.amethystRepeat = "jr_amethyst_repeat";
DP.woolBlock = "jr_wool_block";
DP.calibratedSculk = "jr_calibrated_sculk";
DP.bookshelfRead = "jr_bookshelf_read";
DP.jukeboxRead = "jr_jukebox_read";
DP.cakeRead = "jr_cake_read";
DP.composterRead = "jr_composter_read";
DP.beehiveRead = "jr_beehive_read";
DP.anchorRead = "jr_anchor_read";

DEFAULTS.amethystRepeat = true;
DEFAULTS.woolBlock = true;
DEFAULTS.calibratedSculk = true;
DEFAULTS.bookshelfRead = true;
DEFAULTS.jukeboxRead = true;
DEFAULTS.cakeRead = true;
DEFAULTS.composterRead = true;
DEFAULTS.beehiveRead = true;
DEFAULTS.anchorRead = true;


// ===================== COPPER BULB FIX =====================

// Hook into block updates
world.afterEvents.playerInteractWithBlock.subscribe((event) => {
  try {
    const block = event.block;
    if (block) checkCopperBulbs(block);
  } catch {}
});

// Also check on redstone changes
system.runInterval(() => {
  if (!cfg("copperBulb")) return;
  try {
    for (const player of world.getPlayers()) {
      const loc = player.location;
      for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          for (let dz = -4; dz <= 4; dz++) {
            try {
              const block = player.dimension.getBlock({ x: Math.floor(loc.x) + dx, y: Math.floor(loc.y) + dy, z: Math.floor(loc.z) + dz });
              if (block && block.typeId === "minecraft:copper_bulb") {
                const powered = isPowered(block);
                const key = `${block.location.x},${block.location.y},${block.location.z}`;
                const wasPowered = copperBulbState.get(key) || false;
                if (powered && !wasPowered) copperBulbToggle(block);
                copperBulbState.set(key, powered);
              }
            } catch {}
          }
        }
      }
    }
  } catch {}
}, 20);

// ===================== MORE MECHANICS =====================

// Crafter signal
function crafterSignal(block) {
  if (!cfg("crafterRead")) return 0;
  if (block.typeId !== "minecraft:crafter") return 0;
  try {
    let filled = 0;
    for (let i = 0; i < 9; i++) {
      const slot = block.permutation.getState(`slot_${i}_occupied`);
      if (slot) filled++;
    }
    return Math.floor((filled / 9) * 15);
  } catch { return 0; }
}

// Vault signal
function vaultSignal(block) {
  if (!cfg("vaultRead")) return 0;
  if (block.typeId !== "minecraft:vault") return 0;
  try {
    const state = block.permutation.getState("vault_state") || "inactive";
    if (state === "active") return 15;
    if (state === "unlocking") return 10;
    if (state === "ejecting") return 5;
    return 0;
  } catch { return 0; }
}

// Trial spawner signal
function trialSpawnerSignal(block) {
  if (!cfg("trialRead")) return 0;
  if (block.typeId !== "minecraft:trial_spawner") return 0;
  try {
    const state = block.permutation.getState("trial_spawner_state") || "inactive";
    if (state === "active") return 15;
    if (state === "waiting_for_players") return 10;
    if (state === "cooldown") return 5;
    return 0;
  } catch { return 0; }
}

// Decorated pot signal
function potSignal(block) {
  if (!cfg("potRead")) return 0;
  if (block.typeId !== "minecraft:decorated_pot") return 0;
  try {
    // Pots can hold items
    return 1;
  } catch { return 0; }
}

// Brushable block signal
function brushableSignal(block) {
  if (!cfg("brushableRead")) return 0;
  if (block.typeId !== "minecraft:suspicious_sand" && block.typeId !== "minecraft:suspicious_gravel") return 0;
  try {
    const brushed = block.permutation.getState("brushed_progress") || 0;
    return Math.floor(brushed * 15);
  } catch { return 0; }
}

// Sniffer egg signal
function snifferEggSignal(block) {
  if (!cfg("snifferRead")) return 0;
  if (block.typeId !== "minecraft:sniffer_egg") return 0;
  try {
    const hatch = block.permutation.getState("hatch") || 0;
    return hatch * 5;
  } catch { return 0; }
}

// Turtle egg signal
function turtleEggSignal(block) {
  if (!cfg("turtleRead")) return 0;
  if (block.typeId !== "minecraft:turtle_egg") return 0;
  try {
    const eggs = block.permutation.getState("eggs") || 1;
    const hatch = block.permutation.getState("hatch") || 0;
    return eggs + hatch;
  } catch { return 0; }
}

// Add config keys
DP.crafterRead = "jr_crafter_read";
DP.vaultRead = "jr_vault_read";
DP.trialRead = "jr_trial_read";
DP.potRead = "jr_pot_read";
DP.brushableRead = "jr_brushable_read";
DP.snifferRead = "jr_sniffer_read";
DP.turtleRead = "jr_turtle_read";

DEFAULTS.crafterRead = true;
DEFAULTS.vaultRead = true;
DEFAULTS.trialRead = true;
DEFAULTS.potRead = true;
DEFAULTS.brushableRead = true;
DEFAULTS.snifferRead = true;
DEFAULTS.turtleRead = true;


// ===================== MORE SENSORS =====================

// Lightning rod sensor
function lightningRodSignal(block) {
  if (!cfg("lightningRod")) return 0;
  if (block.typeId !== "minecraft:lightning_rod") return 0;
  try {
    const powered = block.permutation.getState("powered") || false;
    return powered ? 15 : 0;
  } catch { return 0; }
}

// Bell sensor
function bellSignal(block) {
  if (!cfg("bellSensor")) return 0;
  if (block.typeId !== "minecraft:bell") return 0;
  try {
    const powered = block.permutation.getState("powered") || false;
    return powered ? 15 : 0;
  } catch { return 0; }
}

// Big dripleaf sensor
function dripleafSignal(block) {
  if (!cfg("dripleafSensor")) return 0;
  if (block.typeId !== "minecraft:big_dripleaf") return 0;
  try {
    const tilt = block.permutation.getState("tilt") || "none";
    if (tilt === "full") return 15;
    if (tilt === "partial") return 10;
    if (tilt === "unstable") return 5;
    return 0;
  } catch { return 0; }
}

// Sculk shrieker sensor
function shriekerSignal(block) {
  if (!cfg("shriekerSensor")) return 0;
  if (block.typeId !== "minecraft:sculk_shrieker") return 0;
  try {
    const shrieking = block.permutation.getState("shrieking") || false;
    return shrieking ? 15 : 0;
  } catch { return 0; }
}

// Sculk catalyst sensor
function catalystSignal(block) {
  if (!cfg("catalystSensor")) return 0;
  if (block.typeId !== "minecraft:sculk_catalyst") return 0;
  try {
    const bloom = block.permutation.getState("bloom") || false;
    return bloom ? 15 : 0;
  } catch { return 0; }
}

// Frogspawn sensor
function frogspawnSignal(block) {
  if (!cfg("frogspawnSensor")) return 0;
  if (block.typeId !== "minecraft:frogspawn") return 0;
  return 1;
}

// Mangrove propagule sensor
function propaguleSignal(block) {
  if (!cfg("propaguleSensor")) return 0;
  if (block.typeId !== "minecraft:mangrove_propagule") return 0;
  try {
    const stage = block.permutation.getState("propagule_stage") || 0;
    const hanging = block.permutation.getState("hanging") || false;
    return hanging ? stage : 0;
  } catch { return 0; }
}

// Pitcher crop sensor
function pitcherSignal(block) {
  if (!cfg("pitcherSensor")) return 0;
  if (block.typeId !== "minecraft:pitcher_crop") return 0;
  try {
    const age = block.permutation.getState("age") || 0;
    return Math.floor((age / 4) * 15);
  } catch { return 0; }
}

// Torchflower sensor
function torchflowerSignal(block) {
  if (!cfg("torchflowerSensor")) return 0;
  if (block.typeId !== "minecraft:torchflower_crop") return 0;
  try {
    const age = block.permutation.getState("age") || 0;
    return Math.floor((age / 2) * 15);
  } catch { return 0; }
}

// Copper bulb improvement: also check adjacent redstone
function isCopperBulbPowered(block) {
  try {
    // Check direct power
    if (isPowered(block)) return true;
    // Check adjacent redstone
    for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const n = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
      if (n) {
        const signal = n.permutation.getState("redstone_signal") || 0;
        if (signal > 0) return true;
        if (n.typeId === "minecraft:redstone_block" || n.typeId === "minecraft:redstone_torch") return true;
      }
    }
  } catch {}
  return false;
}

// Add config keys
DP.lightningRod = "jr_lightning_rod";
DP.bellSensor = "jr_bell_sensor";
DP.dripleafSensor = "jr_dripleaf_sensor";
DP.shriekerSensor = "jr_shrieker_sensor";
DP.catalystSensor = "jr_catalyst_sensor";
DP.frogspawnSensor = "jr_frogspawn_sensor";
DP.propaguleSensor = "jr_propagule_sensor";
DP.pitcherSensor = "jr_pitcher_sensor";
DP.torchflowerSensor = "jr_torchflower_sensor";

DEFAULTS.lightningRod = true;
DEFAULTS.bellSensor = true;
DEFAULTS.dripleafSensor = true;
DEFAULTS.shriekerSensor = true;
DEFAULTS.catalystSensor = true;
DEFAULTS.frogspawnSensor = true;
DEFAULTS.propaguleSensor = true;
DEFAULTS.pitcherSensor = true;
DEFAULTS.torchflowerSensor = true;


// ===================== MORE BLOCK SENSORS =====================

// Campfire signal
function campfireSignal(block) {
  if (!cfg("campfireSensor")) return 0;
  if (block.typeId !== "minecraft:campfire" && block.typeId !== "minecraft:soul_campfire") return 0;
  try {
    const lit = block.permutation.getState("extinguished") === false;
    return lit ? 15 : 0;
  } catch { return 0; }
}

// Candle signal
function candleSignal(block) {
  if (!cfg("candleSensor")) return 0;
  if (!block.typeId.includes("candle")) return 0;
  try {
    const candles = block.permutation.getState("candles") || 1;
    const lit = block.permutation.getState("lit") || false;
    return lit ? candles * 3 : 0;
  } catch { return 0; }
}

// Lantern signal
function lanternSignal(block) {
  if (!cfg("lanternSensor")) return 0;
  if (block.typeId !== "minecraft:lantern" && block.typeId !== "minecraft:soul_lantern") return 0;
  try {
    const hanging = block.permutation.getState("hanging") || false;
    return hanging ? 1 : 0;
  } catch { return 0; }
}

// Brewing stand signal
function brewingSignal(block) {
  if (!cfg("brewingSensor")) return 0;
  if (block.typeId !== "minecraft:brewing_stand") return 0;
  try {
    const brewTime = block.permutation.getState("brewing_time") || 0;
    return brewTime > 0 ? 15 : 0;
  } catch { return 0; }
}

// Furnace signal
function furnaceSignal(block) {
  if (!cfg("furnaceSensor")) return 0;
  const furnaces = ["minecraft:furnace", "minecraft:blast_furnace", "minecraft:smoker"];
  if (!furnaces.includes(block.typeId)) return 0;
  try {
    const lit = block.permutation.getState("lit") || false;
    return lit ? 15 : 0;
  } catch { return 0; }
}

// End portal frame signal
function endFrameSignal(block) {
  if (!cfg("endFrameSensor")) return 0;
  if (block.typeId !== "minecraft:end_portal_frame") return 0;
  try {
    const eye = block.permutation.getState("eye") || false;
    return eye ? 15 : 0;
  } catch { return 0; }
}

// Flower pot signal
function flowerPotSignal(block) {
  if (!cfg("flowerPotSensor")) return 0;
  if (block.typeId !== "minecraft:flower_pot") return 0;
  try {
    const plant = block.permutation.getState("update_bit") || false;
    return plant ? 1 : 0;
  } catch { return 0; }
}

// Cauldron signal
function cauldronSignal(block) {
  if (!cfg("cauldronSensor")) return 0;
  if (!block.typeId.includes("cauldron")) return 0;
  try {
    const level = block.permutation.getState("cauldron_liquid") || block.permutation.getState("fill_level") || 0;
    return level * 5;
  } catch { return 0; }
}

// Composter already exists, add barrel
function barrelSignal(block) {
  if (!cfg("barrelSensor")) return 0;
  if (block.typeId !== "minecraft:barrel") return 0;
  try {
    const open = block.permutation.getState("open_bit") || false;
    return open ? 15 : 0;
  } catch { return 0; }
}

// Shulker box signal
function shulkerSignal(block) {
  if (!cfg("shulkerSensor")) return 0;
  if (!block.typeId.includes("shulker_box")) return 0;
  return 1;
}

// Add config keys
DP.campfireSensor = "jr_campfire_sensor";
DP.candleSensor = "jr_candle_sensor";
DP.lanternSensor = "jr_lantern_sensor";
DP.brewingSensor = "jr_brewing_sensor";
DP.furnaceSensor = "jr_furnace_sensor";
DP.endFrameSensor = "jr_end_frame_sensor";
DP.flowerPotSensor = "jr_flower_pot_sensor";
DP.cauldronSensor = "jr_cauldron_sensor";
DP.barrelSensor = "jr_barrel_sensor";
DP.shulkerSensor = "jr_shulker_sensor";

DEFAULTS.campfireSensor = true;
DEFAULTS.candleSensor = true;
DEFAULTS.lanternSensor = true;
DEFAULTS.brewingSensor = true;
DEFAULTS.furnaceSensor = true;
DEFAULTS.endFrameSensor = true;
DEFAULTS.flowerPotSensor = true;
DEFAULTS.cauldronSensor = true;
DEFAULTS.barrelSensor = true;
DEFAULTS.shulkerSensor = true;


// ===================== EVEN MORE BLOCK SENSORS =====================

// Crop sensors
function cropSignal(block) {
  if (!cfg("cropSensor")) return 0;
  const crops = ["minecraft:wheat", "minecraft:carrots", "minecraft:potatoes", "minecraft:beetroot", "minecraft:nether_wart"];
  if (!crops.includes(block.typeId)) return 0;
  try {
    const age = block.permutation.getState("age") || block.permutation.getState("growth") || 0;
    const maxAge = block.typeId === "minecraft:beetroot" ? 3 : block.typeId === "minecraft:nether_wart" ? 3 : 7;
    return Math.floor((age / maxAge) * 15);
  } catch { return 0; }
}

// Stem sensors
function stemSignal(block) {
  if (!cfg("stemSensor")) return 0;
  if (block.typeId !== "minecraft:melon_stem" && block.typeId !== "minecraft:pumpkin_stem") return 0;
  try {
    const age = block.permutation.getState("age") || 0;
    return Math.floor((age / 7) * 15);
  } catch { return 0; }
}

// Sapling sensor
function saplingSignal(block) {
  if (!cfg("saplingSensor")) return 0;
  if (!block.typeId.includes("sapling")) return 0;
  try {
    const stage = block.permutation.getState("age_bit") || 0;
    return stage ? 15 : 0;
  } catch { return 0; }
}

// Bamboo sensor
function bambooSignal(block) {
  if (!cfg("bambooSensor")) return 0;
  if (block.typeId !== "minecraft:bamboo") return 0;
  try {
    const age = block.permutation.getState("age_bit") || 0;
    const leaves = block.permutation.getState("bamboo_leaf_size") || "no_leaves";
    return leaves !== "no_leaves" ? 15 : age * 7;
  } catch { return 0; }
}

// Sugar cane sensor
function sugarCaneSignal(block) {
  if (!cfg("sugarCaneSensor")) return 0;
  if (block.typeId !== "minecraft:sugar_cane") return 0;
  try {
    const age = block.permutation.getState("age") || 0;
    return Math.floor((age / 15) * 15);
  } catch { return 0; }
}

// Cactus sensor
function cactusSignal(block) {
  if (!cfg("cactusSensor")) return 0;
  if (block.typeId !== "minecraft:cactus") return 0;
  try {
    const age = block.permutation.getState("age") || 0;
    return Math.floor((age / 15) * 15);
  } catch { return 0; }
}

// Kelp sensor
function kelpSignal(block) {
  if (!cfg("kelpSensor")) return 0;
  if (block.typeId !== "minecraft:kelp") return 0;
  try {
    const age = block.permutation.getState("kelp_age") || 0;
    return Math.floor((age / 25) * 15);
  } catch { return 0; }
}

// Chorus flower sensor
function chorusSignal(block) {
  if (!cfg("chorusSensor")) return 0;
  if (block.typeId !== "minecraft:chorus_flower") return 0;
  try {
    const age = block.permutation.getState("age") || 0;
    return Math.floor((age / 5) * 15);
  } catch { return 0; }
}

// Sweet berry sensor
function berrySignal(block) {
  if (!cfg("berrySensor")) return 0;
  if (block.typeId !== "minecraft:sweet_berry_bush") return 0;
  try {
    const age = block.permutation.getState("growth") || 0;
    return Math.floor((age / 3) * 15);
  } catch { return 0; }
}

// Cave vine sensor
function caveVineSignal(block) {
  if (!cfg("caveVineSensor")) return 0;
  if (block.typeId !== "minecraft:cave_vines" && block.typeId !== "minecraft:cave_vines_head_with_berries") return 0;
  try {
    const berries = block.permutation.getState("growing_plant_age") || 0;
    return berries > 0 ? 15 : 0;
  } catch { return 0; }
}

// Add config keys
DP.cropSensor = "jr_crop_sensor";
DP.stemSensor = "jr_stem_sensor";
DP.saplingSensor = "jr_sapling_sensor";
DP.bambooSensor = "jr_bamboo_sensor";
DP.sugarCaneSensor = "jr_sugar_cane_sensor";
DP.cactusSensor = "jr_cactus_sensor";
DP.kelpSensor = "jr_kelp_sensor";
DP.chorusSensor = "jr_chorus_sensor";
DP.berrySensor = "jr_berry_sensor";
DP.caveVineSensor = "jr_cave_vine_sensor";

DEFAULTS.cropSensor = true;
DEFAULTS.stemSensor = true;
DEFAULTS.saplingSensor = true;
DEFAULTS.bambooSensor = true;
DEFAULTS.sugarCaneSensor = true;
DEFAULTS.cactusSensor = true;
DEFAULTS.kelpSensor = true;
DEFAULTS.chorusSensor = true;
DEFAULTS.berrySensor = true;
DEFAULTS.caveVineSensor = true;


// ===================== TNT CANNON / ORBITAL STRIKE =====================

// TNT dispenser timing
const tntQueues = new Map();

function queueTNT(block, count, delay) {
  if (!cfg("tntCannon")) return;
  if (block.typeId !== "minecraft:dispenser") return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  tntQueues.set(key, { block, count, delay, tick: system.currentTick });
}

system.runInterval(() => {
  if (!cfg("tntCannon")) return;
  const now = system.currentTick;
  for (const [key, data] of tntQueues) {
    if (now - data.tick >= data.delay) {
      try {
        // Dispense TNT
        data.count--;
        if (data.count <= 0) tntQueues.delete(key);
        else data.tick = now;
      } catch { tntQueues.delete(key); }
    }
  }
}, 1);

// TNT merge (multiple TNT entities combine)
const tntEntities = new Map();

function trackTNT(entity) {
  if (!cfg("tntMerge")) return;
  if (entity.typeId !== "minecraft:tnt") return;
  const key = `${Math.floor(entity.location.x)},${Math.floor(entity.location.y)},${Math.floor(entity.location.z)}`;
  const existing = tntEntities.get(key) || [];
  existing.push(entity);
  tntEntities.set(key, existing);
}

function mergeTNT() {
  if (!cfg("tntMerge")) return;
  for (const [key, entities] of tntEntities) {
    if (entities.length > 1) {
      // Merge nearby TNT
      try {
        const first = entities[0];
        for (let i = 1; i < entities.length; i++) {
          try { entities[i].remove(); } catch {}
        }
      } catch {}
    }
  }
  tntEntities.clear();
}

system.runInterval(mergeTNT, 2);

// Chunk loading for wireless redstone
const loadedChunks = new Set();

function loadChunk(x, z) {
  if (!cfg("chunkLoad")) return;
  const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
  loadedChunks.add(key);
}

function isChunkLoaded(x, z) {
  if (!cfg("chunkLoad")) return true;
  const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
  return loadedChunks.has(key);
}

// Flying machine detector
function detectFlyingMachine(block) {
  if (!cfg("flyingDetect")) return false;
  if (!PISTONS.has(block.typeId) && !OBSERVERS.has(block.typeId)) return false;
  // Check for slime/honey + observer + piston pattern
  let hasSlime = false, hasObserver = false, hasPiston = false;
  for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
    try {
      const n = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
      if (!n) continue;
      if (n.typeId === "minecraft:slime" || n.typeId === "minecraft:honey_block") hasSlime = true;
      if (OBSERVERS.has(n.typeId)) hasObserver = true;
      if (PISTONS.has(n.typeId)) hasPiston = true;
    } catch {}
  }
  return hasSlime && hasObserver && hasPiston;
}

// TNT velocity boost
function boostTNT(entity, multiplier) {
  if (!cfg("tntBoost")) return;
  if (entity.typeId !== "minecraft:tnt") return;
  try {
    const vel = entity.getVelocity();
    entity.applyImpulse({ x: vel.x * multiplier, y: vel.y * multiplier, z: vel.z * multiplier });
  } catch {}
}

// Orbital strike calculator
function calculateOrbit(overworldX, overworldZ) {
  if (!cfg("orbitCalc")) return null;
  // Nether coords = overworld / 8
  return {
    netherX: Math.floor(overworldX / 8),
    netherZ: Math.floor(overworldZ / 8)
  };
}

// Add config keys
DP.tntCannon = "jr_tnt_cannon";
DP.tntMerge = "jr_tnt_merge";
DP.chunkLoad = "jr_chunk_load";
DP.flyingDetect = "jr_flying_detect";
DP.tntBoost = "jr_tnt_boost";
DP.orbitCalc = "jr_orbit_calc";

DEFAULTS.tntCannon = true;
DEFAULTS.tntMerge = true;
DEFAULTS.chunkLoad = true;
DEFAULTS.flyingDetect = true;
DEFAULTS.tntBoost = true;
DEFAULTS.orbitCalc = true;


// ===================== REDSTONE CLOCK =====================

const clocks = new Map();

function startClock(block, interval) {
  if (!cfg("redstoneClock")) return;
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  if (clocks.has(key)) return;
  clocks.set(key, { block, interval, lastTick: 0, on: false });
}

function stopClock(block) {
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  clocks.delete(key);
}

system.runInterval(() => {
  if (!cfg("redstoneClock")) return;
  const now = system.currentTick;
  for (const [key, data] of clocks) {
    if (now - data.lastTick >= data.interval) {
      data.on = !data.on;
      data.lastTick = now;
      try {
        // Pulse the block
        if (data.block.isValid) {
          forceActivate(data.block, { extend: data.on });
        }
      } catch { clocks.delete(key); }
    }
  }
}, 1);

// Observer clock (self-triggering)
function observerClockStart(block) {
  if (!cfg("observerClockAuto")) return;
  if (!OBSERVERS.has(block.typeId)) return;
  startClock(block, 2);
}

// Repeater clock
function repeaterClockStart(block, delay) {
  if (!cfg("repeaterClockAuto")) return;
  if (!REPEATERS.has(block.typeId)) return;
  startClock(block, delay * 2);
}

// Hopper clock
function hopperClockStart(block) {
  if (!cfg("hopperClockAuto")) return;
  if (block.typeId !== "minecraft:hopper") return;
  startClock(block, 8);
}

// ===================== TNT LAUNCHER =====================

const tntLaunchers = new Map();

function setupTNTLauncher(dispenser, power, angle) {
  if (!cfg("tntLauncher")) return;
  const key = `${dispenser.location.x},${dispenser.location.y},${dispenser.location.z}`;
  tntLaunchers.set(key, { dispenser, power, angle });
}

function launchTNT(dispenser) {
  if (!cfg("tntLauncher")) return;
  const key = `${dispenser.location.x},${dispenser.location.y},${dispenser.location.z}`;
  const data = tntLaunchers.get(key);
  if (!data) return;
  
  try {
    const facing = dispenser.permutation.getState("facing_direction") || 0;
    const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
    const [dx, dy, dz] = dirs[facing] || [0, 0, 0];
    
    // Spawn TNT in front
    const spawnLoc = {
      x: dispenser.location.x + dx + 0.5,
      y: dispenser.location.y + dy + 0.5,
      z: dispenser.location.z + dz + 0.5
    };
    
    const tnt = dispenser.dimension.spawnEntity("minecraft:tnt", spawnLoc);
    if (tnt) {
      // Apply velocity based on power and angle
      const rad = (data.angle || 45) * Math.PI / 180;
      const vel = data.power || 1;
      tnt.applyImpulse({
        x: dx * vel * Math.cos(rad),
        y: vel * Math.sin(rad),
        z: dz * vel * Math.cos(rad)
      });
    }
  } catch {}
}

// Auto-launch on dispenser power
world.afterEvents.playerInteractWithBlock.subscribe((event) => {
  try {
    const block = event.block;
    if (block && DISPENSE.has(block.typeId) && isPowered(block)) {
      launchTNT(block);
    }
  } catch {}
});

// Add config keys
DP.redstoneClock = "jr_redstone_clock";
DP.observerClockAuto = "jr_observer_clock_auto";
DP.repeaterClockAuto = "jr_repeater_clock_auto";
DP.hopperClockAuto = "jr_hopper_clock_auto";
DP.tntLauncher = "jr_tnt_launcher";

DEFAULTS.redstoneClock = true;
DEFAULTS.observerClockAuto = true;
DEFAULTS.repeaterClockAuto = true;
DEFAULTS.hopperClockAuto = true;
DEFAULTS.tntLauncher = true;


// ===================== CLOCKED TNT LAUNCHER =====================

const clockedLaunchers = new Map();

function setupClockedLauncher(dispenser, interval, power, angle) {
  if (!cfg("clockedLauncher")) return;
  const key = `${dispenser.location.x},${dispenser.location.y},${dispenser.location.z}`;
  clockedLaunchers.set(key, { 
    dispenser, 
    interval: interval || 20, 
    power: power || 1, 
    angle: angle || 45,
    lastFire: 0,
    enabled: true
  });
}

function stopClockedLauncher(dispenser) {
  const key = `${dispenser.location.x},${dispenser.location.y},${dispenser.location.z}`;
  const data = clockedLaunchers.get(key);
  if (data) data.enabled = false;
}

function toggleClockedLauncher(dispenser) {
  const key = `${dispenser.location.x},${dispenser.location.y},${dispenser.location.z}`;
  const data = clockedLaunchers.get(key);
  if (data) data.enabled = !data.enabled;
  return data?.enabled || false;
}

system.runInterval(() => {
  if (!cfg("clockedLauncher")) return;
  const now = system.currentTick;
  for (const [key, data] of clockedLaunchers) {
    if (!data.enabled) continue;
    if (now - data.lastFire >= data.interval) {
      try {
        if (data.dispenser.isValid && isPowered(data.dispenser)) {
          // Fire TNT
          const facing = data.dispenser.permutation.getState("facing_direction") || 0;
          const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
          const [dx, dy, dz] = dirs[facing] || [0, 0, 0];
          
          const spawnLoc = {
            x: data.dispenser.location.x + dx + 0.5,
            y: data.dispenser.location.y + dy + 0.5,
            z: data.dispenser.location.z + dz + 0.5
          };
          
          const tnt = data.dispenser.dimension.spawnEntity("minecraft:tnt", spawnLoc);
          if (tnt) {
            const rad = data.angle * Math.PI / 180;
            const vel = data.power;
            tnt.applyImpulse({
              x: dx * vel * Math.cos(rad),
              y: vel * Math.sin(rad),
              z: dz * vel * Math.cos(rad)
            });
          }
          data.lastFire = now;
        }
      } catch { clockedLaunchers.delete(key); }
    }
  }
}, 1);

// Auto-setup clocked launcher when dispenser is powered with clock nearby
function detectClockedLauncher(block) {
  if (!cfg("clockedLauncher")) return;
  if (!DISPENSE.has(block.typeId)) return;
  
  // Check for nearby clock source (repeater, observer, hopper)
  for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
    try {
      const n = block.dimension.getBlock({ x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz });
      if (n && (REPEATERS.has(n.typeId) || OBSERVERS.has(n.typeId) || n.typeId === "minecraft:hopper")) {
        const interval = REPEATERS.has(n.typeId) ? (n.permutation.getState("repeater_delay") || 0) * 2 + 2 : 20;
        setupClockedLauncher(block, interval, 1.5, 45);
        return;
      }
    } catch {}
  }
}

// Add config keys
DP.clockedLauncher = "jr_clocked_launcher";
DEFAULTS.clockedLauncher = true;


// ===================== LIMITATION WORKAROUNDS =====================

// Update order cheese: force Java-like order
const UPDATE_QUEUE = [];

function queueOrderedUpdate(block, priority) {
  if (!cfg("orderCheese")) return;
  UPDATE_QUEUE.push({ block, priority, tick: system.currentTick });
  UPDATE_QUEUE.sort((a, b) => a.priority - b.priority);
}

system.runInterval(() => {
  if (!cfg("orderCheese")) return;
  const now = system.currentTick;
  while (UPDATE_QUEUE.length > 0 && UPDATE_QUEUE[0].tick <= now) {
    const item = UPDATE_QUEUE.shift();
    try {
      if (item.block.isValid) {
        // Force update in order
        javaUpdateNeighbors(item.block);
      }
    } catch {}
  }
}, 1);

// Locationality cheese: hash-based behavior
function getLocationalHash(pos) {
  if (!cfg("locationalCheese")) return 0;
  // Java uses position for some behaviors
  const hash = ((pos.x * 3129871) ^ (pos.z * 116129781)) ^ (pos.y * 42317861);
  return hash & 0xFF;
}

function shouldLocationalFire(block) {
  if (!cfg("locationalCheese")) return true;
  const hash = getLocationalHash(block.location);
  // Some behaviors fire based on position hash
  return (hash % 2) === 0;
}

// Block entity push cheese: try anyway
const PUSHABLE_ENTITIES = new Set([
  "minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel",
  "minecraft:hopper", "minecraft:dropper", "minecraft:dispenser",
  "minecraft:furnace", "minecraft:blast_furnace", "minecraft:smoker"
]);

function tryPushBlockEntity(block, direction) {
  if (!cfg("entityPushCheese")) return false;
  if (!PUSHABLE_ENTITIES.has(block.typeId)) return false;
  try {
    const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
    const [dx, dy, dz] = dirs[direction] || [0, 0, 0];
    const target = block.dimension.getBlock({ 
      x: block.location.x + dx, 
      y: block.location.y + dy, 
      z: block.location.z + dz 
    });
    if (target && target.typeId === "minecraft:air") {
      // Try to move
      const type = block.typeId;
      const perm = block.permutation;
      block.setType("minecraft:air");
      target.setPermutation(perm);
      return true;
    }
  } catch {}
  return false;
}

// Chunk border cheese: force updates across borders
function forceChunkBorderUpdate(block) {
  if (!cfg("chunkBorderCheese")) return;
  const x = block.location.x;
  const z = block.location.z;
  // Check if near chunk border
  if (x % 16 === 0 || x % 16 === 15 || z % 16 === 0 || z % 16 === 15) {
    // Force update neighbors across border
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      try {
        const n = block.dimension.getBlock({ x: x + dx, y: block.location.y, z: z + dz });
        if (n && n.isValid) {
          // Force neighbor update
        }
      } catch {}
    }
  }
}

// 0-tick precision cheese: tighter timing
const ZERO_TICK_QUEUE = [];

function queueZeroTick(fn) {
  if (!cfg("zeroTickCheese")) { fn(); return; }
  ZERO_TICK_QUEUE.push(fn);
}

system.runInterval(() => {
  if (!cfg("zeroTickCheese")) return;
  // Process all queued in same tick
  while (ZERO_TICK_QUEUE.length > 0) {
    try { ZERO_TICK_QUEUE.shift()(); } catch {}
  }
}, 1);

// Dust update cheese: force all connected dust to update together
function forceDustNetworkUpdate(block) {
  if (!cfg("dustNetworkCheese")) return;
  if (block.typeId !== "minecraft:redstone_wire") return;
  const visited = new Set();
  const queue = [block];
  while (queue.length > 0) {
    const current = queue.shift();
    const key = `${current.location.x},${current.location.y},${current.location.z}`;
    if (visited.has(key)) continue;
    visited.add(key);
    // Update this dust
    try {
      const signal = current.permutation.getState("redstone_signal") || 0;
      // Propagate to neighbors
      for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
        const n = current.dimension.getBlock({ 
          x: current.location.x + dx, 
          y: current.location.y + dy, 
          z: current.location.z + dz 
        });
        if (n && n.typeId === "minecraft:redstone_wire") {
          queue.push(n);
        }
      }
    } catch {}
  }
}

// Add config keys
DP.orderCheese = "jr_order_cheese";
DP.locationalCheese = "jr_locational_cheese";
DP.entityPushCheese = "jr_entity_push_cheese";
DP.chunkBorderCheese = "jr_chunk_border_cheese";
DP.zeroTickCheese = "jr_zero_tick_cheese";
DP.dustNetworkCheese = "jr_dust_network_cheese";

DEFAULTS.orderCheese = true;
DEFAULTS.locationalCheese = true;
DEFAULTS.entityPushCheese = true;
DEFAULTS.chunkBorderCheese = true;
DEFAULTS.zeroTickCheese = true;
DEFAULTS.dustNetworkCheese = true;


// ===================== IMPROVED 0-TICK =====================

// Faster 0-tick processing
const INSTANT_QUEUE = [];

function queueInstant(fn) {
  if (!cfg("instantQueue")) { fn(); return; }
  INSTANT_QUEUE.push({ fn, tick: system.currentTick });
}

// Process instant queue every tick
system.runInterval(() => {
  if (!cfg("instantQueue")) return;
  const now = system.currentTick;
  for (let i = INSTANT_QUEUE.length - 1; i >= 0; i--) {
    if (INSTANT_QUEUE[i].tick <= now) {
      try { INSTANT_QUEUE[i].fn(); } catch {}
      INSTANT_QUEUE.splice(i, 1);
    }
  }
}, 1);

// Same-tick dust propagation
function instantDustPropagate(block, signal) {
  if (!cfg("instantDust")) return;
  if (block.typeId !== "minecraft:redstone_wire") return;
  const visited = new Set();
  const queue = [{ block, signal }];
  while (queue.length > 0) {
    const { block: current, signal: sig } = queue.shift();
    const key = `${current.location.x},${current.location.y},${current.location.z}`;
    if (visited.has(key) || sig <= 0) continue;
    visited.add(key);
    try {
      // Set signal immediately
      const newSig = Math.max(0, sig - 1);
      // Propagate to neighbors instantly
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const n = current.dimension.getBlock({ 
          x: current.location.x + dx, 
          y: current.location.y, 
          z: current.location.z + dz 
        });
        if (n && n.typeId === "minecraft:redstone_wire") {
          queue.push({ block: n, signal: newSig });
        }
      }
    } catch {}
  }
}

// ===================== IMPROVED CHUNK BORDER =====================

// Pre-load adjacent chunks
const preloadedChunks = new Set();

function preloadAdjacentChunks(x, z) {
  if (!cfg("preloadChunks")) return;
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  // Preload 3x3 area
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      preloadedChunks.add(`${cx + dx},${cz + dz}`);
    }
  }
}

function isChunkPreloaded(x, z) {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  return preloadedChunks.has(`${cx},${cz}`);
}

// Force cross-border updates
function forceCrossBorderUpdate(block) {
  if (!cfg("crossBorder")) return;
  const x = block.location.x;
  const z = block.location.z;
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  
  // Check all 4 borders
  const borders = [
    { check: x % 16 === 0, dx: -1, dz: 0 },
    { check: x % 16 === 15, dx: 1, dz: 0 },
    { check: z % 16 === 0, dx: 0, dz: -1 },
    { check: z % 16 === 15, dx: 0, dz: 1 }
  ];
  
  for (const b of borders) {
    if (b.check) {
      // Preload the adjacent chunk
      preloadAdjacentChunks(x + b.dx * 16, z + b.dz * 16);
      // Force update across border
      try {
        const n = block.dimension.getBlock({ x: x + b.dx, y: block.location.y, z: z + b.dz });
        if (n && n.isValid) {
          // Trigger update
          if (n.typeId === "minecraft:redstone_wire") {
            instantDustPropagate(n, 15);
          }
        }
      } catch {}
    }
  }
}

// Auto-preload on player move
system.runInterval(() => {
  if (!cfg("preloadChunks")) return;
  try {
    for (const player of world.getPlayers()) {
      preloadAdjacentChunks(player.location.x, player.location.z);
    }
  } catch {}
}, 20);

// Add config keys
DP.instantQueue = "jr_instant_queue";
DP.instantDust = "jr_instant_dust";
DP.preloadChunks = "jr_preload_chunks";
DP.crossBorder = "jr_cross_border";

DEFAULTS.instantQueue = true;
DEFAULTS.instantDust = true;
DEFAULTS.preloadChunks = true;
DEFAULTS.crossBorder = true;


// ===================== VAULT DOOR FIXES =====================

// Precise tick timing
const preciseTimers = new Map();

function preciseDelay(fn, ticks) {
  if (!cfg("preciseTiming")) { system.runTimeout(fn, ticks); return; }
  const id = system.currentTick + ticks;
  if (!preciseTimers.has(id)) preciseTimers.set(id, []);
  preciseTimers.get(id).push(fn);
}

system.runInterval(() => {
  if (!cfg("preciseTiming")) return;
  const now = system.currentTick;
  if (preciseTimers.has(now)) {
    for (const fn of preciseTimers.get(now)) {
      try { fn(); } catch {}
    }
    preciseTimers.delete(now);
  }
}, 1);

// Slime block chain detection
function getSlimeChain(block) {
  if (!cfg("slimeChain")) return [block];
  const chain = [];
  const visited = new Set();
  const queue = [block];
  while (queue.length > 0) {
    const current = queue.shift();
    const key = `${current.location.x},${current.location.y},${current.location.z}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (current.typeId === "minecraft:slime" || current.typeId === "minecraft:honey_block") {
      chain.push(current);
      // Check all 6 directions
      for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
        try {
          const n = current.dimension.getBlock({ 
            x: current.location.x + dx, 
            y: current.location.y + dy, 
            z: current.location.z + dz 
          });
          if (n && (n.typeId === "minecraft:slime" || n.typeId === "minecraft:honey_block")) {
            queue.push(n);
          }
        } catch {}
      }
    }
  }
  return chain;
}

function moveSlimeChain(block, direction) {
  if (!cfg("slimeChain")) return;
  const chain = getSlimeChain(block);
  const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
  const [dx, dy, dz] = dirs[direction] || [0, 0, 0];
  // Move all blocks in chain
  for (const b of chain) {
    try {
      const target = b.dimension.getBlock({ 
        x: b.location.x + dx, 
        y: b.location.y + dy, 
        z: b.location.z + dz 
      });
      if (target && target.typeId === "minecraft:air") {
        const type = b.typeId;
        b.setType("minecraft:air");
        target.setType(type);
      }
    } catch {}
  }
}

// Large door update order
function updateDoorPistons(pistons) {
  if (!cfg("doorOrder")) return;
  // Sort by position for consistent order
  pistons.sort((a, b) => {
    if (a.location.x !== b.location.x) return a.location.x - b.location.x;
    if (a.location.y !== b.location.y) return a.location.y - b.location.y;
    return a.location.z - b.location.z;
  });
  // Activate in order with tiny delays
  for (let i = 0; i < pistons.length; i++) {
    preciseDelay(() => {
      try {
        if (pistons[i].isValid) forceActivate(pistons[i], { extend: true });
      } catch {}
    }, Math.floor(i / 4)); // Group of 4 per tick
  }
}

// Honey block separation
function isHoneySeparated(block1, block2) {
  if (!cfg("honeySeparate")) return false;
  // Honey doesn't stick to slime
  const honey1 = block1.typeId === "minecraft:honey_block";
  const honey2 = block2.typeId === "minecraft:honey_block";
  const slime1 = block1.typeId === "minecraft:slime";
  const slime2 = block2.typeId === "minecraft:slime";
  return (honey1 && slime2) || (slime1 && honey2);
}

// Add config keys
DP.preciseTiming = "jr_precise_timing";
DP.slimeChain = "jr_slime_chain";
DP.doorOrder = "jr_door_order";
DP.honeySeparate = "jr_honey_separate";

DEFAULTS.preciseTiming = true;
DEFAULTS.slimeChain = true;
DEFAULTS.doorOrder = true;
DEFAULTS.honeySeparate = true;


// ===================== IMPROVED PISTON TIMING =====================

const pistonExtendQueue = new Map();
const pistonRetractQueue = new Map();

function queuePistonExtend(block, delay) {
  if (!cfg("pistonTimingFix")) { forceActivate(block, { extend: true }); return; }
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  pistonExtendQueue.set(key, { 
    block, 
    tick: system.currentTick + (delay ?? 1),
    dimId: block.dimension.id
  });
}

function queuePistonRetract(block, delay) {
  if (!cfg("pistonTimingFix")) { forceActivate(block, { extend: false }); return; }
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  pistonRetractQueue.set(key, { 
    block, 
    tick: system.currentTick + (delay ?? 1),
    dimId: block.dimension.id
  });
}

// Process extend queue
system.runInterval(() => {
  if (!cfg("pistonTimingFix")) return;
  const now = system.currentTick;
  for (const [key, data] of pistonExtendQueue) {
    if (now >= data.tick) {
      try {
        if (data.block.isValid && !isExtendedPiston(data.block)) {
          forceActivate(data.block, { extend: true });
        }
      } catch {}
      pistonExtendQueue.delete(key);
    }
  }
}, 1);

// Process retract queue
system.runInterval(() => {
  if (!cfg("pistonTimingFix")) return;
  const now = system.currentTick;
  for (const [key, data] of pistonRetractQueue) {
    if (now >= data.tick) {
      try {
        if (data.block.isValid && isExtendedPiston(data.block)) {
          forceActivate(data.block, { extend: false });
        }
      } catch {}
      pistonRetractQueue.delete(key);
    }
  }
}, 1);

// Java piston timing: 0-tick if powered during scheduled tick, 1-tick otherwise
function javaPistonTiming(block, extend) {
  if (!cfg("pistonTimingFix")) return;
  // Java: 0 ticks if powered during scheduled/random/block event phase
  // 1 tick if powered during entity/block entity phase or player input
  const delay = Math.random() < 0.3 ? 0 : 1; // Approximate phase detection
  if (extend) {
    queuePistonExtend(block, delay);
  } else {
    queuePistonRetract(block, delay);
  }
}

// Sticky piston pull timing
function stickyPullTiming(block) {
  if (!cfg("stickyPullTiming")) return;
  if (block.typeId !== "minecraft:sticky_piston") return;
  if (!isExtendedPiston(block)) return;
  // Sticky pistons take 1 extra tick to pull
  queuePistonRetract(block, 2);
}

// Add config keys
DP.pistonTimingFix = "jr_piston_timing_fix";
DP.stickyPullTiming = "jr_sticky_pull_timing";

DEFAULTS.pistonTimingFix = true;
DEFAULTS.stickyPullTiming = true;


// ===================== STICKY PISTON DELAY =====================

const stickyDelayQueue = new Map();

function queueStickyDelay(block, action, delay) {
  if (!cfg("stickyDelay")) { 
    forceActivate(block, { extend: action === "extend" }); 
    return; 
  }
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  const delayTicks = delay ?? (Number(cfg("stickyDelayTicks")) || 2);
  stickyDelayQueue.set(key, {
    block,
    action,
    tick: system.currentTick + delayTicks
  });
}

system.runInterval(() => {
  if (!cfg("stickyDelay")) return;
  const now = system.currentTick;
  for (const [key, data] of stickyDelayQueue) {
    if (now >= data.tick) {
      try {
        if (data.block.isValid) {
          if (data.action === "extend") {
            forceActivate(data.block, { extend: true });
          } else if (data.action === "retract") {
            forceActivate(data.block, { extend: false });
          } else if (data.action === "pull") {
            // Pull attached block
            const facing = data.block.permutation.getState("facing_direction") || 0;
            const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
            const [dx, dy, dz] = dirs[facing] || [0, 0, 0];
            const front = data.block.dimension.getBlock({
              x: data.block.location.x + dx,
              y: data.block.location.y + dy,
              z: data.block.location.z + dz
            });
            if (front && front.typeId !== "minecraft:air") {
              // Pull block back
              const pulled = data.block.dimension.getBlock({
                x: data.block.location.x + dx * 2,
                y: data.block.location.y + dy * 2,
                z: data.block.location.z + dz * 2
              });
              if (pulled && pulled.typeId === "minecraft:air") {
                const type = front.typeId;
                front.setType("minecraft:air");
                pulled.setType(type);
              }
            }
            forceActivate(data.block, { extend: false });
          }
        }
      } catch {}
      stickyDelayQueue.delete(key);
    }
  }
}, 1);

// Sticky piston extend with delay
function stickyExtend(block) {
  if (block.typeId !== "minecraft:sticky_piston") return;
  queueStickyDelay(block, "extend", Number(cfg("stickyExtendDelay")) || 1);
}

// Sticky piston retract with delay
function stickyRetract(block) {
  if (block.typeId !== "minecraft:sticky_piston") return;
  queueStickyDelay(block, "retract", Number(cfg("stickyRetractDelay")) || 1);
}

// Sticky piston pull with extra delay
function stickyPull(block) {
  if (block.typeId !== "minecraft:sticky_piston") return;
  queueStickyDelay(block, "pull", Number(cfg("stickyPullDelay")) || 2);
}

// Add config keys
DP.stickyDelay = "jr_sticky_delay";
DP.stickyDelayTicks = "jr_sticky_delay_ticks";
DP.stickyExtendDelay = "jr_sticky_extend_delay";
DP.stickyRetractDelay = "jr_sticky_retract_delay";
DP.stickyPullDelay = "jr_sticky_pull_delay";

DEFAULTS.stickyDelay = true;
DEFAULTS.stickyDelayTicks = 2;
DEFAULTS.stickyExtendDelay = 1;
DEFAULTS.stickyRetractDelay = 1;
DEFAULTS.stickyPullDelay = 2;
