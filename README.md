# Minecraft Bedrock Addons

## Java PvP Addon (10.3.42)
Location: `JavaPvP/`

### Fixes
- `/jk:config` and the combat loop load again (removed a stray `}` that broke `config.js`)
- Entity-hurt combat handler parse error fixed (`hit.js` try/catch + `handleDamage` return)
- Personal config form now saves the correct control values (`shield_side_pose`, offhand swap, etc.)
- Custom shield raise delay now actually applies (was always 1 tick)
- Side shield pose reads `shield_side_pose`
- Fishing item retrieval + true armor durability honor live `cfg` values

### New / restored Java parity
- Ender pearl cooldown (default 20 ticks)
- Hit interrupts eating / charging use
- Crit coyote air window
- Egg / snowball throw spacing
- Config menu: Combat → Java Parity

Features:
- Java-style combat mechanics, offhand, mace techniques
- Saturation shower HUD, emote hotbar swap
- CPvP / advanced sword / redstone-adjacent combat extras


### Follow-up wiring (10.3.42 / 1.22.2)
- Weapon cooldown config now applies to shovel / pickaxe / hoe / spear / fist
- Cobweb waterlog mechanics respect `cobweb_enabled`
- Legacy `sat` / `shield` config aliases sync to `java_saturation_enabled` / `custom_shield_enabled`
- Mobile saturation offset toggle wired into HUD platform selection
- Sticky piston QC path uses sticky delay queue when enabled

## Java Redstone Addon (v1.22.2)
Location: `JavaRedstone/`

### Fixes / wiring
- Piston timing `runInterval` try/catch parse break fixed
- Features that existed as dead helpers are now scanned/wired:
  torch burnout, rail updates, instant wire, sticky double-retract,
  comparator subtract pass, copper bulb checks, note-block observer pulse
- `!jr help` / status updated for the wired feature set
- New toggles: `!jr torch|rails|wire|retract|bulb|sticky|pushlimit|note`

### Core cheese still included
- Quasi-connectivity, soft/hard power, 0-tick pulses
- Dust decay, piston timing, sticky short-pulse drop

## Usage
Each addon has:
- `BP/` - Behavior pack (scripts, manifests)
- `RP/` - Resource pack (textures, manifests)

In-game:
- Java PvP: `/jk:config world` or `/jk:config personal`
- Java Redstone: `!jr help` or `/scriptevent jr:help`
