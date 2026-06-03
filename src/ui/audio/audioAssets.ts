const MUSIC_BASE = "/assets/audio/music";
const SFX_BASE = "/assets/audio/sfx";

export const menuMusic = `${MUSIC_BASE}/terminus.ogg`;

export const gameplayMusic = [
  "day_1.ogg",
  "day_2.ogg",
  "day_3.ogg",
  "day_4.ogg",
  "day_5.ogg",
  "day_6.ogg",
  "day_7.ogg",
  "day_8.ogg",
  "night_1.ogg",
  "night_2.ogg",
  "night_3.ogg",
  "night_4.ogg"
].map((fileName) => `${MUSIC_BASE}/${fileName}`);

export const settlementMusic = {
  clear: `${MUSIC_BASE}/game_clear.ogg`,
  over: `${MUSIC_BASE}/game_over.ogg`
} as const;

export const soundEffects = {
  zombieMove: `${SFX_BASE}/zombie_attack_claw.ogg`,
  zombieCrowd: `${SFX_BASE}/zombie_crowd.ogg`,
  uiHover: `${SFX_BASE}/ui_click_s.ogg`,
  uiClick: `${SFX_BASE}/ui_click.ogg`
} as const;
