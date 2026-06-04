const MUSIC_BASE = "/assets/audio/music";
const SFX_BASE = "/assets/audio/sfx";

export interface AudioAssetSource {
  src: string;
  type: string;
}

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

function sfxSources(fileName: string): readonly AudioAssetSource[] {
  return [
    { src: `${SFX_BASE}/${fileName}.ogg`, type: "audio/ogg; codecs=vorbis" },
    { src: `${SFX_BASE}/${fileName}.m4a`, type: "audio/mp4; codecs=mp4a.40.2" }
  ];
}

export const soundEffects = {
  zombieMove: sfxSources("zombie_attack_claw"),
  zombieCrowd: sfxSources("zombie_crowd"),
  uiHover: sfxSources("ui_click_s"),
  uiClick: sfxSources("ui_click")
} as const satisfies Record<string, readonly AudioAssetSource[]>;
