import { createDarkSoundtrack } from "./audio.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const soundtrack = createDarkSoundtrack();
const virtualButtons = Array.from(document.querySelectorAll("[data-virtual-key]"));

const WIDTH = 960;
const HEIGHT = 540;

const ARENA = { x: 260, y: 164, w: 440, h: 220 };
const DIALOG = { x: 170, y: 406, w: 620, h: 100 };
const MENU_Y = 360;
const BUTTON_W = 140;
const BUTTON_H = 34;
const LANE_ROWS = Array.from({ length: 6 }, (_, index) => ARENA.y + 14 + index * 34);

const PLAYER_STATS = {
  maxHp: 72,
  redSpeed: 208,
  blueSpeed: 182,
  jumpVelocity: -430,
  gravity: 1320,
  invulnTime: 0.55,
  itemHeal: 28,
  finalHitWindow: 0.22,
};

const COLORS = {
  arenaFill: "#090c13",
  arenaBorder: "#eff5ff",
  text: "#f4f7fb",
  muted: "#9fb0bc",
  orange: "#ff9f2e",
  yellow: "#ffe14d",
  green: "#4fff91",
  blue: "#57d2ff",
  bone: "#f7fbff",
  damage: "#ff5d5d",
  soul: "#ff4c4c",
  soulBlue: "#55bfff",
};

const MENU_OPTIONS = ["FIGHT", "ACT", "ITEM", "MERCY"];
const MENU_COLORS = [COLORS.orange, COLORS.yellow, COLORS.green, COLORS.yellow];

const MENU_PROMPTS = [
  "* 샌즈가 길을 막아섰다.",
  "* 웃음이 전혀 사라지지 않는다.",
  "* 왼쪽 눈이 짧게 번쩍인다.",
  "* 파란색과 주황색 경고가 흔들린다.",
  "* 중력이 비뚤어지는 느낌이다.",
  "* 장난이 끝나기 시작했다.",
  "* 패턴이 갑자기 서로 뒤엉킨다.",
  "* 숨 돌릴 틈을 주지 않는다.",
];

const ACT_LINES = [
  ["* 농담을 던졌다.", "* 샌즈가 어이없다는 듯 웃는다."],
  ["* 시간을 끌어 본다.", "* 샌즈는 이미 알고 있었다."],
  ["* 침착하게 호흡을 고른다.", "* 샌즈의 웃음이 아주 조금 흐려진다."],
];

const INTRO_LINES = [
  "* 헤.",
  "* 여기까지 오느라 꽤 많이 반복했나 보네.",
  "* 지나가고 싶다면...",
  "* 이번엔 끝까지 버텨 봐.",
];

const PREVENT_KEYS = new Set([" ", "arrowdown", "arrowleft", "arrowright", "arrowup", "enter"]);
const COMMAND_HINT = "timer auto on | phase next | god on | soul blue";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function normalizeKey(key) {
  return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
}

function circleRectCollision(cx, cy, radius, rect) {
  const closestX = clamp(cx, rect.x, rect.x + rect.w);
  const closestY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function cycleHits(step, modulo, count = 1, shift = 0) {
  if (!modulo || count <= 0) {
    return false;
  }

  const normalized = ((step + shift) % modulo + modulo) % modulo;
  return normalized < count;
}

function laneRowAt(step, offset = 0) {
  const index = ((step + offset) % LANE_ROWS.length + LANE_ROWS.length) % LANE_ROWS.length;
  return LANE_ROWS[index];
}

function makePattern(key, duration, soulMode, hint, options = {}) {
  return { key, duration, soulMode, hint, ...options };
}

function formatStopwatchTime(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const centiseconds = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 100);
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function createPlayer() {
  return {
    x: ARENA.x + ARENA.w / 2,
    y: ARENA.y + ARENA.h / 2,
    radius: 9,
    hp: PLAYER_STATS.maxHp,
    maxHp: PLAYER_STATS.maxHp,
    invuln: 0,
    soulMode: "red",
    vx: 0,
    vy: 0,
    moving: false,
  };
}

const inputState = {
  held: new Set(),
  pressed: new Set(),
};
const activeVirtualPointers = new Map();
const virtualHoldCounts = new Map();

function triggerVirtualKey(rawKey, hold = false) {
  const key = normalizeKey(rawKey);

  if (game.command.open) {
    if (key === "m") {
      soundtrack.toggleMute();
    }
    return;
  }

  if (hold) {
    const holdCount = virtualHoldCounts.get(key) || 0;
    virtualHoldCounts.set(key, holdCount + 1);
    if (holdCount > 0) {
      return;
    }
  }

  if (key === "m") {
    soundtrack.toggleMute();
    return;
  }

  const firstPress = !inputState.held.has(key);
  soundtrack.arm();
  if (firstPress) {
    inputState.pressed.add(key);
  }

  if (hold) {
    inputState.held.add(key);
  }
}

function releaseVirtualKey(rawKey) {
  const key = normalizeKey(rawKey);
  const holdCount = virtualHoldCounts.get(key) || 0;

  if (holdCount <= 1) {
    virtualHoldCounts.delete(key);
    inputState.held.delete(key);
    return;
  }

  virtualHoldCounts.set(key, holdCount - 1);
}

function clearActiveVirtualPointers() {
  for (const { key, button, hold } of activeVirtualPointers.values()) {
    if (hold) {
      releaseVirtualKey(key);
    }
    button.classList.remove("is-active");
  }
  activeVirtualPointers.clear();
  virtualHoldCounts.clear();
}

window.addEventListener("keydown", (event) => {
  const key = normalizeKey(event.key);
  const firstPress = !inputState.held.has(key);
  const opensCommand = key === "/" || key === "?" || key === "`";

  if (PREVENT_KEYS.has(key)) {
    event.preventDefault();
  }

  if (firstPress && opensCommand && !game.command.open) {
    event.preventDefault();
    soundtrack.arm();
    openCommandConsole();
    return;
  }

  if (game.command.open) {
    event.preventDefault();
    if (firstPress && key !== "m") {
      soundtrack.arm();
    }
    handleCommandKey(key);
    return;
  }

  if (firstPress && key === "m") {
    soundtrack.toggleMute();
  } else if (firstPress) {
    soundtrack.arm();
  }

  if (firstPress) {
    inputState.pressed.add(key);
  }
  inputState.held.add(key);
});

window.addEventListener("pointerdown", () => {
  soundtrack.arm();
});

window.addEventListener("touchstart", () => {
  soundtrack.arm();
}, { passive: true });

window.addEventListener("keyup", (event) => {
  inputState.held.delete(normalizeKey(event.key));
});

window.addEventListener("blur", () => {
  inputState.held.clear();
  inputState.pressed.clear();
  clearActiveVirtualPointers();
});

for (const button of virtualButtons) {
  const key = button.dataset.virtualKey;
  const hold = (button.dataset.virtualMode || "hold") === "hold";

  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add("is-active");
    activeVirtualPointers.set(event.pointerId, { button, hold, key });
    triggerVirtualKey(key, hold);

    if (!hold) {
      button.classList.remove("is-active");
      activeVirtualPointers.delete(event.pointerId);
    }
  });

  const releasePointer = (event) => {
    const active = activeVirtualPointers.get(event.pointerId);
    if (!active) {
      return;
    }

    if (active.hold) {
      releaseVirtualKey(active.key);
    }

    active.button.classList.remove("is-active");
    activeVirtualPointers.delete(event.pointerId);
  };

  button.addEventListener("pointerup", releasePointer);
  button.addEventListener("pointercancel", releasePointer);
}

function keyDown(...keys) {
  return keys.some((key) => inputState.held.has(key));
}

function keyPressed(...keys) {
  for (const key of keys) {
    if (inputState.pressed.has(key)) {
      inputState.pressed.delete(key);
      return true;
    }
  }
  return false;
}

const game = {
  state: "title",
  prompt: MENU_PROMPTS[0],
  menuIndex: 0,
  roundIndex: 0,
  itemUsed: false,
  player: createPlayer(),
  hazards: [],
  enemy: null,
  text: null,
  attackMeter: null,
  shake: 0,
  eyeFlash: 0,
  command: {
    open: false,
    buffer: "",
    message: "",
    timer: 0,
  },
  stopwatch: {
    elapsed: 0,
    running: false,
    visible: true,
    auto: false,
    lastStopped: 0,
  },
  stars: Array.from({ length: 56 }, () => ({
    x: Math.random() * WIDTH,
    y: Math.random() * 220,
    size: randomRange(1, 3),
    speed: randomRange(8, 22),
  })),
};

const PATTERNS = [
  makePattern("boneWalls", 6.6, "red", "* 첫 뼈 벽이다. 넓은 틈부터 읽어라.", {
    startDelay: 0.54,
    gapSize: 124,
    secondGapSize: 130,
    speed: 220,
    secondSpeedDelta: 12,
    interval: 0.86,
    pairModulo: 5,
    pairCount: 1,
    pairShift: 1,
    offset: 16,
    damage: 6,
    secondDamage: 6,
    jitter: 5,
    baseOffset: 58,
    centerStep: 29,
    centerRange: 94,
    margin: 50,
  }),
  makePattern("boneWalls", 6.9, "red", "* 같은 뼈 벽이 조금 더 빨라진다.", {
    startDelay: 0.5,
    gapSize: 110,
    secondGapSize: 118,
    speed: 245,
    secondSpeedDelta: 14,
    interval: 0.74,
    pairModulo: 4,
    pairCount: 2,
    pairShift: 1,
    offset: 18,
    damage: 7,
    secondDamage: 7,
    jitter: 6,
    baseOffset: 56,
    centerStep: 33,
    centerRange: 102,
    margin: 50,
  }),
  makePattern("blasters", 6.8, "red", "* 얇은 경고선을 보고 미리 빠져라.", {
    startDelay: 0.62,
    interval: 1.12,
    xMargin: 62,
    yMargin: 52,
    verticalStride: 71,
    horizontalStride: 39,
    vThickness: 30,
    hThickness: 26,
    vDamage: 8,
    hDamage: 7,
    vCharge: 0.68,
    hCharge: 0.62,
    vActive: 0.18,
    hActive: 0.16,
  }),
  makePattern("colorBones", 6.9, "red", "* 파랑은 멈추고 주황은 움직여라.", {
    startDelay: 0.5,
    interval: 0.88,
    telegraph: 0.28,
    active: 0.42,
    damage: 6,
    order: ["blue", "orange", "white"],
    secondModulo: 3,
    secondCount: 1,
    secondShift: 1,
    secondOffset: 3,
    secondTelegraph: 0.24,
    secondActive: 0.38,
    secondDamage: 6,
  }),
  makePattern("blueJump", 7.0, "blue", "* 낮은 뼈부터 점프 리듬을 익혀라.", {
    startDelay: 0.58,
    interval: 0.82,
    tallInterval: 0.96,
    speed: 280,
    startFromLeft: true,
    tallModulo: 4,
    tallShift: 2,
    tallHeight: 68,
    shortHeight: 52,
    tallWidth: 22,
    shortWidth: 16,
    tallDamage: 7,
    shortDamage: 6,
    extraModulo: 5,
    extraCount: 1,
    extraShift: 4,
    extraHeight: 46,
    extraWidth: 14,
    extraSpeedDelta: 24,
    extraDamage: 5,
    extraOffset: 38,
  }),
  makePattern("crossfire", 7.4, "red", "* 벽과 광선이 번갈아 교차한다.", {
    startDelay: 0.54,
    extraStart: 0.98,
    gapSize: 100,
    secondGapSize: 108,
    speed: 255,
    secondSpeedDelta: 14,
    interval: 0.78,
    pairModulo: 4,
    pairCount: 1,
    offset: 18,
    damage: 7,
    secondDamage: 6,
    baseOffset: 56,
    centerStep: 37,
    centerRange: 108,
    margin: 48,
    jitter: 6,
    beamInterval: 1.36,
    beamThickness: 34,
    beamDamage: 8,
    beamCharge: 0.54,
    beamActive: 0.16,
    beamXMargin: 58,
    beamYMargin: 44,
    beamVerticalStride: 61,
    beamHorizontalStride: 43,
  }),
  makePattern("blasters", 7.5, "red", "* 두 방향 블래스터가 겹친다.", {
    startDelay: 0.48,
    interval: 0.94,
    xMargin: 58,
    yMargin: 44,
    verticalStride: 73,
    horizontalStride: 47,
    vThickness: 34,
    hThickness: 30,
    vDamage: 9,
    hDamage: 8,
    vCharge: 0.56,
    hCharge: 0.48,
    vActive: 0.18,
    hActive: 0.17,
    extraModulo: 4,
    extraCount: 1,
    extraShift: 1,
    extraSpacing: 88,
    extraThickness: 28,
    extraDamage: 7,
    extraCharge: 0.42,
    extraActive: 0.15,
  }),
  makePattern("colorBones", 7.6, "red", "* 두 줄 색 뼈를 빠르게 읽어라.", {
    startDelay: 0.46,
    interval: 0.72,
    telegraph: 0.22,
    active: 0.44,
    damage: 7,
    order: ["blue", "orange", "white", "orange"],
    secondModulo: 1,
    secondCount: 1,
    secondOffset: 3,
    secondTelegraph: 0.2,
    secondActive: 0.42,
    secondDamage: 7,
    thirdModulo: 4,
    thirdCount: 1,
    thirdShift: 1,
    thirdOffset: 5,
    thirdTelegraph: 0.16,
    thirdActive: 0.3,
    thirdDamage: 6,
  }),
  makePattern("blueJump", 7.6, "blue", "* 높은 뼈와 낮은 뼈가 섞인다.", {
    startDelay: 0.52,
    interval: 0.74,
    tallInterval: 0.88,
    speed: 300,
    tallModulo: 4,
    tallShift: 2,
    tallHeight: 76,
    shortHeight: 58,
    tallWidth: 24,
    shortWidth: 18,
    tallDamage: 8,
    shortDamage: 6,
    extraModulo: 4,
    extraCount: 1,
    extraShift: 3,
    extraHeight: 50,
    extraWidth: 16,
    extraSpeedDelta: 26,
    extraDamage: 6,
    extraOffset: 42,
    bonusModulo: 7,
    bonusCount: 1,
    bonusShift: 1,
    bonusHeight: 64,
    bonusWidth: 16,
    bonusSpeedDelta: 40,
    bonusDamage: 7,
    bonusOffset: 76,
  }),
  makePattern("boneWalls", 7.8, "red", "* 틈이 다시 좁아진다. 중심을 잃지 마라.", {
    startDelay: 0.42,
    gapSize: 96,
    secondGapSize: 104,
    speed: 280,
    secondSpeedDelta: 18,
    interval: 0.62,
    pairModulo: 3,
    pairCount: 2,
    offset: 22,
    damage: 8,
    secondDamage: 7,
    jitter: 8,
    baseOffset: 54,
    centerStep: 37,
    centerRange: 110,
    margin: 48,
  }),
  makePattern("crossfire", 7.9, "red", "* 안쪽으로 몰아붙이기 시작한다.", {
    startDelay: 0.46,
    extraStart: 0.82,
    pulseStart: 1.28,
    gapSize: 88,
    secondGapSize: 96,
    speed: 292,
    secondSpeedDelta: 16,
    interval: 0.66,
    pairModulo: 2,
    pairCount: 1,
    offset: 20,
    damage: 8,
    secondDamage: 7,
    jitter: 8,
    baseOffset: 54,
    centerStep: 41,
    centerRange: 114,
    margin: 48,
    beamInterval: 1.04,
    beamThickness: 36,
    beamDamage: 9,
    beamCharge: 0.48,
    beamActive: 0.17,
    beamXMargin: 56,
    beamYMargin: 42,
    beamVerticalStride: 67,
    beamHorizontalStride: 47,
    pulseInterval: 1.54,
    pulseTelegraph: 0.16,
    pulseActive: 0.38,
    pulseDamage: 6,
    pulseRuleA: "orange",
    pulseRuleB: "blue",
  }),
  makePattern("blueRush", 7.9, "blue", "* 양쪽 돌진을 처음 버텨라.", {
    startDelay: 0.48,
    extraStart: 1.18,
    interval: 0.66,
    mainSpeed: 360,
    extraInterval: 1.44,
    rushHeights: [72, 92, 108, 84],
    rushWidths: [18, 22, 24, 22],
    rushDamages: [7, 8, 9, 8],
    supportHeights: [48, 62],
    supportWidth: 14,
    supportDamage: 6,
    supportOffset: 42,
    bonusHeight: 68,
    bonusWidth: 14,
    bonusDamage: 6,
    bonusOffset: 84,
    extraHeight: 72,
    extraWidth: 16,
    extraDamage: 7,
  }),
  makePattern("gauntlet", 8.0, "red", "* 벽과 색 뼈를 같이 읽어라.", {
    startDelay: 0.46,
    extraStart: 0.96,
    gapSize: 92,
    secondGapSize: 100,
    speed: 292,
    secondSpeedDelta: 16,
    interval: 0.6,
    pairModulo: 2,
    pairCount: 1,
    offset: 20,
    damage: 8,
    secondDamage: 7,
    jitter: 8,
    baseOffset: 52,
    centerStep: 45,
    centerRange: 118,
    margin: 48,
    laneInterval: 1.02,
    laneTelegraph: 0.16,
    laneActive: 0.42,
    laneDamage: 7,
    laneOrder: ["blue", "orange", "white", "orange"],
    laneOffset: 1,
    laneSecondModulo: 4,
    laneSecondCount: 1,
    laneSecondShift: 1,
    laneSecondOffset: 4,
    laneSecondTelegraph: 0.14,
    laneSecondActive: 0.32,
    laneSecondDamage: 6,
  }),
  makePattern("blasters", 8.1, "red", "* 광선이 거의 쉬지 않고 쏟아진다.", {
    startDelay: 0.42,
    interval: 0.8,
    xMargin: 56,
    yMargin: 40,
    verticalStride: 79,
    horizontalStride: 53,
    vThickness: 36,
    hThickness: 32,
    vDamage: 10,
    hDamage: 9,
    vCharge: 0.46,
    hCharge: 0.42,
    vActive: 0.18,
    hActive: 0.17,
    extraModulo: 3,
    extraCount: 1,
    extraShift: 1,
    extraSpacing: 94,
    extraThickness: 30,
    extraDamage: 8,
    extraCharge: 0.36,
    extraActive: 0.15,
  }),
  makePattern("colorBones", 8.2, "red", "* 멈춤과 이동을 계속 뒤집어라.", {
    startDelay: 0.42,
    interval: 0.6,
    telegraph: 0.16,
    active: 0.5,
    damage: 8,
    order: ["blue", "orange", "white", "orange"],
    secondModulo: 1,
    secondCount: 1,
    secondOffset: 2,
    secondTelegraph: 0.14,
    secondActive: 0.44,
    secondDamage: 8,
    thirdModulo: 2,
    thirdCount: 1,
    thirdOffset: 4,
    thirdTelegraph: 0.12,
    thirdActive: 0.34,
    thirdDamage: 7,
  }),
  makePattern("blueRush", 8.3, "blue", "* 점프 거리와 착지 타이밍을 같이 본다.", {
    startDelay: 0.44,
    extraStart: 1.02,
    interval: 0.56,
    mainSpeed: 390,
    extraInterval: 1.18,
    rushHeights: [82, 104, 118, 94],
    rushWidths: [18, 22, 24, 22],
    rushDamages: [8, 9, 10, 9],
    supportHeights: [56, 70],
    supportWidth: 16,
    supportDamage: 7,
    supportOffset: 44,
    bonusHeight: 76,
    bonusWidth: 16,
    bonusDamage: 7,
    bonusOffset: 88,
    extraHeight: 80,
    extraWidth: 18,
    extraDamage: 8,
  }),
  makePattern("gauntlet", 8.4, "red", "* 색 뼈와 벽에 이제 쉬는 틈이 적다.", {
    startDelay: 0.4,
    extraStart: 0.8,
    gapSize: 80,
    secondGapSize: 88,
    speed: 320,
    secondSpeedDelta: 20,
    interval: 0.5,
    pairModulo: 1,
    pairCount: 1,
    offset: 24,
    damage: 9,
    secondDamage: 8,
    jitter: 8,
    baseOffset: 52,
    centerStep: 49,
    centerRange: 120,
    margin: 46,
    laneInterval: 0.82,
    laneTelegraph: 0.12,
    laneActive: 0.44,
    laneDamage: 8,
    laneOrder: ["blue", "orange", "white", "orange"],
    laneOffset: 1,
    laneSecondModulo: 2,
    laneSecondCount: 1,
    laneSecondOffset: 4,
    laneSecondTelegraph: 0.1,
    laneSecondActive: 0.34,
    laneSecondDamage: 7,
    laneThirdModulo: 4,
    laneThirdCount: 1,
    laneThirdShift: 1,
    laneThirdOffset: 0,
    laneThirdTelegraph: 0.1,
    laneThirdActive: 0.28,
    laneThirdDamage: 6,
  }),
  makePattern("crossfire", 8.6, "red", "* 교차 화력이 중앙을 잠근다.", {
    startDelay: 0.4,
    extraStart: 0.72,
    pulseStart: 1.02,
    gapSize: 74,
    secondGapSize: 82,
    speed: 336,
    secondSpeedDelta: 20,
    interval: 0.52,
    pairModulo: 2,
    pairCount: 1,
    offset: 20,
    damage: 9,
    secondDamage: 8,
    jitter: 9,
    baseOffset: 50,
    centerStep: 53,
    centerRange: 122,
    margin: 46,
    beamInterval: 0.82,
    beamThickness: 38,
    beamDamage: 10,
    beamCharge: 0.42,
    beamActive: 0.17,
    beamXMargin: 54,
    beamYMargin: 40,
    beamVerticalStride: 71,
    beamHorizontalStride: 51,
    pulseInterval: 1.08,
    pulseTelegraph: 0.1,
    pulseActive: 0.34,
    pulseDamage: 7,
    pulseRuleA: "orange",
    pulseRuleB: "blue",
  }),
  makePattern("finale", 9.0, "red", "* 마지막 전초전이다.", {
    startDelay: 0.4,
    extraStart: 0.76,
    pulseStart: 1.02,
    gapSize: 74,
    secondGapSize: 80,
    speed: 348,
    secondSpeedDelta: 22,
    interval: 0.48,
    pairModulo: 2,
    pairCount: 1,
    offset: 20,
    damage: 9,
    secondDamage: 9,
    jitter: 8,
    baseOffset: 50,
    centerStep: 57,
    centerRange: 124,
    margin: 46,
    beamInterval: 0.9,
    beamThickness: 36,
    beamDamage: 10,
    beamCharge: 0.44,
    beamActive: 0.18,
    beamXMargin: 56,
    beamYMargin: 42,
    beamVerticalStride: 67,
    beamHorizontalStride: 43,
    pulseInterval: 1.1,
    pulseTelegraph: 0.12,
    pulseActive: 0.34,
    pulseDamage: 7,
    pulseOrder: ["blue", "orange", "white"],
    pulseOffset: 2,
  }),
  makePattern("finale", 10.0, "red", "* 20단계의 끝이다. 끝까지 버텨라.", {
    startDelay: 0.36,
    extraStart: 0.68,
    pulseStart: 0.94,
    gapSize: 66,
    secondGapSize: 72,
    speed: 372,
    secondSpeedDelta: 24,
    interval: 0.42,
    pairModulo: 1,
    pairCount: 1,
    offset: 22,
    damage: 10,
    secondDamage: 9,
    jitter: 9,
    baseOffset: 48,
    centerStep: 61,
    centerRange: 126,
    margin: 44,
    beamInterval: 0.82,
    beamThickness: 38,
    beamDamage: 11,
    beamCharge: 0.38,
    beamActive: 0.18,
    beamXMargin: 56,
    beamYMargin: 40,
    beamVerticalStride: 67,
    beamHorizontalStride: 41,
    pulseInterval: 0.96,
    pulseTelegraph: 0.1,
    pulseActive: 0.32,
    pulseDamage: 7,
    pulseOrder: ["blue", "orange", "white"],
    pulseOffset: 2,
  }),
];

function resetPlayer(mode = "red") {
  game.player.x = ARENA.x + ARENA.w / 2;
  game.player.y = mode === "blue" ? ARENA.y + ARENA.h - 12 : ARENA.y + ARENA.h / 2;
  game.player.vx = 0;
  game.player.vy = mode === "blue" ? 220 : 0;
  game.player.soulMode = mode;
  game.player.moving = false;
}

function resetGame() {
  game.state = "title";
  game.prompt = MENU_PROMPTS[0];
  game.menuIndex = 0;
  game.roundIndex = 0;
  game.itemUsed = false;
  game.player = createPlayer();
  game.hazards = [];
  game.enemy = null;
  game.text = null;
  game.attackMeter = null;
  game.shake = 0;
  game.eyeFlash = 0;
  game.command.open = false;
  game.command.buffer = "";
  game.command.message = "";
  game.command.timer = 0;
  game.stopwatch.elapsed = 0;
  game.stopwatch.running = false;
  game.stopwatch.lastStopped = 0;
}

function queueText(lines, onComplete) {
  game.state = "text";
  game.text = {
    index: 0,
    lines,
    onComplete,
  };
}

function setCommandMessage(message, duration = 3.4) {
  game.command.message = message;
  game.command.timer = duration;
}

function startStopwatch(reset = false) {
  if (reset) {
    game.stopwatch.elapsed = 0;
  }
  game.stopwatch.running = true;
}

function stopStopwatch() {
  game.stopwatch.running = false;
  game.stopwatch.lastStopped = game.stopwatch.elapsed;
}

function resetStopwatch() {
  game.stopwatch.elapsed = 0;
  game.stopwatch.lastStopped = 0;
  game.stopwatch.running = false;
}

function openCommandConsole() {
  game.command.open = true;
  game.command.buffer = "";
  inputState.held.clear();
  inputState.pressed.clear();
}

function closeCommandConsole(clearBuffer = true) {
  game.command.open = false;
  if (clearBuffer) {
    game.command.buffer = "";
  }
  inputState.held.clear();
  inputState.pressed.clear();
}

function jumpToPhase(phaseIndex) {
  const safeIndex = clamp(phaseIndex, 0, PATTERNS.length - 1);
  game.roundIndex = safeIndex;
  game.hazards = [];
  game.enemy = null;
  game.text = null;
  game.attackMeter = null;
  game.shake = 0;
  game.eyeFlash = 0;

  if (game.player.hp <= 0) {
    game.player.hp = game.player.maxHp;
  }

  resetPlayer(PATTERNS[safeIndex].soulMode);
  openMenu();
}

function applyDamage(amount) {
  const damage = clamp(Math.round(amount), 0, 999);

  if (damage <= 0) {
    setCommandMessage("0 데미지는 적용되지 않았다.");
    return;
  }

  game.player.hp = Math.max(0, game.player.hp - damage);
  game.shake = 8;

  if (game.player.hp <= 0) {
    game.state = "lose";
    game.hazards = [];
    game.enemy = null;
    if (game.stopwatch.auto) {
      stopStopwatch();
    }
  }

  setCommandMessage(`${damage} 데미지를 적용했다. HP ${game.player.hp}/${game.player.maxHp}`);
}

function executeCommand(rawInput) {
  const input = rawInput.trim();

  if (!input) {
    closeCommandConsole();
    return;
  }

  const [name, ...args] = input.split(/\s+/);
  const command = name.toLowerCase();

  if (["help", "도움말", "?"].includes(command)) {
    setCommandMessage("명령어: phase next, menu, damage 8, soul blue, god on, timer auto on", 6);
    closeCommandConsole();
    return;
  }

  if (["start", "시작"].includes(command)) {
    if (game.state === "title") {
      queueText(INTRO_LINES, () => openMenu());
    } else {
      openMenu();
    }
    setCommandMessage("게임을 시작했다.");
    closeCommandConsole();
    return;
  }

  if (["phase", "페이즈"].includes(command)) {
    const target = (args[0] || "").toLowerCase();

    if (["next", "다음"].includes(target)) {
      jumpToPhase(game.roundIndex + 1);
      setCommandMessage(`PHASE ${game.roundIndex + 1} 준비 완료`);
      closeCommandConsole();
      return;
    }

    if (["prev", "previous", "이전"].includes(target)) {
      jumpToPhase(game.roundIndex - 1);
      setCommandMessage(`PHASE ${game.roundIndex + 1} 준비 완료`);
      closeCommandConsole();
      return;
    }

    const phase = Number(target);
    if (!Number.isFinite(phase)) {
      setCommandMessage("사용법: phase 12 | phase next | phase prev", 4.2);
      return;
    }

    jumpToPhase(Math.floor(phase) - 1);
    setCommandMessage(`PHASE ${game.roundIndex + 1} 준비 완료`);
    closeCommandConsole();
    return;
  }

  if (["battle", "fight", "전투"].includes(command)) {
    if (game.stopwatch.auto) {
      startStopwatch(true);
    }

    if (game.state === "title") {
      queueText(INTRO_LINES, () => startEnemyTurn());
    } else {
      if (game.roundIndex >= PATTERNS.length) {
        game.roundIndex = PATTERNS.length - 1;
      }
      startEnemyTurn();
    }
    setCommandMessage(`PHASE ${game.roundIndex + 1} 전투 시작`);
    closeCommandConsole();
    return;
  }

  if (["menu", "메뉴"].includes(command)) {
    game.hazards = [];
    game.enemy = null;
    game.text = null;
    game.attackMeter = null;
    openMenu();
    setCommandMessage("메뉴로 돌아갔다.");
    closeCommandConsole();
    return;
  }

  if (["hp", "체력"].includes(command)) {
    const hp = Number(args[0]);
    if (!Number.isFinite(hp)) {
      setCommandMessage("사용법: hp 40", 3.6);
      return;
    }

    game.player.hp = clamp(Math.round(hp), 0, game.player.maxHp);
    if (game.player.hp <= 0) {
      game.state = "lose";
      game.hazards = [];
      game.enemy = null;
    } else if (game.state === "lose") {
      openMenu();
    }

    setCommandMessage(`HP를 ${game.player.hp}로 설정했다.`);
    closeCommandConsole();
    return;
  }

  if (["damage", "hurt", "데미지"].includes(command)) {
    const amount = Number(args[0]);
    if (!Number.isFinite(amount)) {
      setCommandMessage("사용법: damage 8", 3.6);
      return;
    }

    applyDamage(amount);
    closeCommandConsole();
    return;
  }

  if (["maxhp", "최대hp", "최대체력"].includes(command)) {
    const maxHp = Number(args[0]);
    if (!Number.isFinite(maxHp)) {
      setCommandMessage("사용법: maxhp 120", 3.6);
      return;
    }

    const safeMaxHp = clamp(Math.round(maxHp), 1, 999);
    PLAYER_STATS.maxHp = safeMaxHp;
    game.player.maxHp = safeMaxHp;
    game.player.hp = Math.min(game.player.hp, safeMaxHp);

    if (game.player.hp <= 0 && game.state !== "lose") {
      game.state = "lose";
      game.hazards = [];
      game.enemy = null;
    }

    setCommandMessage(`최대 HP를 ${safeMaxHp}로 설정했다.`);
    closeCommandConsole();
    return;
  }

  if (["heal", "회복"].includes(command)) {
    game.player.hp = game.player.maxHp;
    if (game.state === "lose") {
      openMenu();
    }
    setCommandMessage("HP를 모두 회복했다.");
    closeCommandConsole();
    return;
  }

  if (["item", "아이템"].includes(command)) {
    const mode = (args[0] || "status").toLowerCase();

    if (["reset", "restore", "복구"].includes(mode)) {
      game.itemUsed = false;
      setCommandMessage("파이를 다시 사용할 수 있게 했다.");
      closeCommandConsole();
      return;
    }

    if (["use", "사용"].includes(mode)) {
      game.itemUsed = true;
      setCommandMessage("아이템을 사용한 상태로 설정했다.");
      closeCommandConsole();
      return;
    }

    setCommandMessage(game.itemUsed ? "아이템은 이미 사용됨" : "아이템 사용 가능");
    closeCommandConsole();
    return;
  }

  if (["soul", "영혼"].includes(command)) {
    const mode = (args[0] || "").toLowerCase();
    if (!["red", "blue", "빨강", "파랑"].includes(mode)) {
      setCommandMessage("사용법: soul red | soul blue", 4.2);
      return;
    }

    resetPlayer(["blue", "파랑"].includes(mode) ? "blue" : "red");
    setCommandMessage(`영혼 모드를 ${game.player.soulMode.toUpperCase()}로 변경했다.`);
    closeCommandConsole();
    return;
  }

  if (["god", "무적"].includes(command)) {
    const mode = (args[0] || "toggle").toLowerCase();

    if (["on", "켜", "켬"].includes(mode)) {
      game.player.invuln = 99999;
      setCommandMessage("무적 모드를 켰다.");
      closeCommandConsole();
      return;
    }

    if (["off", "꺼", "끔"].includes(mode)) {
      game.player.invuln = 0;
      setCommandMessage("무적 모드를 껐다.");
      closeCommandConsole();
      return;
    }

    game.player.invuln = game.player.invuln > 10 ? 0 : 99999;
    setCommandMessage(game.player.invuln > 10 ? "무적 모드를 켰다." : "무적 모드를 껐다.");
    closeCommandConsole();
    return;
  }

  if (["music", "음악"].includes(command)) {
    const mode = (args[0] || "toggle").toLowerCase();

    if (["on", "켜", "켬"].includes(mode)) {
      if (soundtrack.isMuted()) {
        soundtrack.toggleMute();
      }
      soundtrack.arm();
      setCommandMessage("배경음을 켰다.");
      closeCommandConsole();
      return;
    }

    if (["off", "꺼", "끔"].includes(mode)) {
      if (!soundtrack.isMuted()) {
        soundtrack.toggleMute();
      }
      setCommandMessage("배경음을 껐다.");
      closeCommandConsole();
      return;
    }

    const muted = soundtrack.toggleMute();
    if (!muted) {
      soundtrack.arm();
    }
    setCommandMessage(muted ? "배경음을 껐다." : "배경음을 켰다.");
    closeCommandConsole();
    return;
  }

  if (["timer", "time", "stopwatch", "스톱워치", "타이머"].includes(command)) {
    const mode = (args[0] || "status").toLowerCase();

    if (["start", "run", "시작"].includes(mode)) {
      startStopwatch(false);
      setCommandMessage(`스톱워치 시작 ${formatStopwatchTime(game.stopwatch.elapsed)}`);
      closeCommandConsole();
      return;
    }

    if (["pause", "stop", "정지", "멈춤"].includes(mode)) {
      stopStopwatch();
      setCommandMessage(`스톱워치 정지 ${formatStopwatchTime(game.stopwatch.lastStopped)}`);
      closeCommandConsole();
      return;
    }

    if (["reset", "clear", "초기화"].includes(mode)) {
      resetStopwatch();
      setCommandMessage("스톱워치를 초기화했다.");
      closeCommandConsole();
      return;
    }

    if (["show", "표시"].includes(mode)) {
      game.stopwatch.visible = true;
      setCommandMessage("스톱워치를 표시한다.");
      closeCommandConsole();
      return;
    }

    if (["hide", "숨김"].includes(mode)) {
      game.stopwatch.visible = false;
      setCommandMessage("스톱워치를 숨긴다.");
      closeCommandConsole();
      return;
    }

    if (["auto"].includes(mode)) {
      const autoMode = (args[1] || "toggle").toLowerCase();
      if (["on", "켜", "켬"].includes(autoMode)) {
        game.stopwatch.auto = true;
      } else if (["off", "꺼", "끔"].includes(autoMode)) {
        game.stopwatch.auto = false;
      } else {
        game.stopwatch.auto = !game.stopwatch.auto;
      }

      setCommandMessage(game.stopwatch.auto ? "자동 스톱워치를 켰다." : "자동 스톱워치를 껐다.");
      closeCommandConsole();
      return;
    }

    setCommandMessage(
      `스톱워치 ${game.stopwatch.running ? "RUN" : "STOP"} ${formatStopwatchTime(game.stopwatch.elapsed)}${game.stopwatch.auto ? " AUTO" : ""}`,
      4.4,
    );
    closeCommandConsole();
    return;
  }

  if (["restart", "reset", "재시작"].includes(command)) {
    resetGame();
    setCommandMessage("게임을 초기화했다.");
    return;
  }

  if (["win", "승리"].includes(command)) {
    game.hazards = [];
    game.enemy = null;
    game.text = null;
    game.attackMeter = null;
    game.roundIndex = PATTERNS.length;
    game.state = "win";
    setCommandMessage("즉시 승리 상태로 전환했다.");
    closeCommandConsole();
    return;
  }

  setCommandMessage(`알 수 없는 명령어: ${input}`, 3.6);
}

function handleCommandKey(key) {
  if (key === "escape") {
    closeCommandConsole();
    return;
  }

  if (key === "enter") {
    executeCommand(game.command.buffer);
    return;
  }

  if (key === "backspace") {
    game.command.buffer = game.command.buffer.slice(0, -1);
    return;
  }

  if (key === "tab") {
    return;
  }

  if (key.length === 1) {
    game.command.buffer += key;
  }
}

function openMenu() {
  game.state = "menu";
  game.menuIndex = 0;
  game.prompt = MENU_PROMPTS[Math.min(game.roundIndex, MENU_PROMPTS.length - 1)];
  game.text = null;
}

function startAttackMeter() {
  game.state = "attack";
  game.attackMeter = {
    x: DIALOG.x + 28,
    min: DIALOG.x + 28,
    max: DIALOG.x + DIALOG.w - 28,
    dir: 1,
    speed: 540,
    locked: false,
    resolveTimer: 0,
    accuracy: 0,
  };
}

function startEnemyTurn() {
  const pattern = PATTERNS[game.roundIndex];
  if (game.stopwatch.auto && !game.stopwatch.running) {
    startStopwatch(game.roundIndex === 0 || game.stopwatch.elapsed === 0);
  }
  resetPlayer(pattern.soulMode);
  game.state = "enemy";
  game.hazards = [];
  game.enemy = {
    pattern,
    t: 0,
    step: 0,
    nextSpawn: pattern.startDelay ?? 0.45,
    nextExtra: pattern.extraStart ?? 0.88,
    nextPulse: pattern.pulseStart ?? 1.22,
    switched: false,
  };
}

function finishEnemyTurn() {
  game.hazards = [];
  game.enemy = null;
  game.roundIndex += 1;

  if (game.player.hp <= 0) {
    return;
  }

  if (game.roundIndex >= PATTERNS.length) {
    queueText(
      ["* 샌즈의 자세가 살짝 무너진다.", "* 지금이 유일한 틈이다."],
      () => {
        game.prompt = MENU_PROMPTS[MENU_PROMPTS.length - 1];
        openMenu();
      },
    );
    return;
  }

  openMenu();
}

function hurtPlayer(damage) {
  if (game.player.invuln > 0 || game.state !== "enemy") {
    return;
  }

  game.player.hp = Math.max(0, game.player.hp - damage);
  game.player.invuln = PLAYER_STATS.invulnTime;
  game.shake = 10;

  if (game.player.hp <= 0) {
    game.state = "lose";
    game.hazards = [];
    game.enemy = null;
    if (game.stopwatch.auto) {
      stopStopwatch();
    }
  }
}

function shouldDamage(rule) {
  if (rule === "blue") {
    return game.player.moving;
  }
  if (rule === "orange") {
    return !game.player.moving;
  }
  return true;
}

function spawnBoneColumn(gapCenter, gapSize, speed, fromRight = false, rule = "white", damage = 7) {
  const shaftWidth = 24;
  const x = fromRight ? ARENA.x + ARENA.w + 28 : ARENA.x - 28;
  const vx = fromRight ? -speed : speed;
  const gapTop = clamp(gapCenter - gapSize / 2, ARENA.y + 20, ARENA.y + ARENA.h - gapSize - 20);
  const gapBottom = gapTop + gapSize;
  const topHeight = gapTop - ARENA.y;
  const bottomHeight = ARENA.y + ARENA.h - gapBottom;

  if (topHeight > 12) {
    game.hazards.push({
      kind: "bone",
      x,
      y: ARENA.y,
      w: shaftWidth,
      h: topHeight,
      vx,
      vy: 0,
      rule,
      orientation: "vertical",
      damage,
    });
  }

  if (bottomHeight > 12) {
    game.hazards.push({
      kind: "bone",
      x,
      y: gapBottom,
      w: shaftWidth,
      h: bottomHeight,
      vx,
      vy: 0,
      rule,
      orientation: "vertical",
      damage,
    });
  }
}

function spawnBeam(orientation, position, thickness = 42, damage = 10, charge = 0.68, active = 0.22) {
  game.hazards.push({
    kind: "beam",
    orientation,
    position,
    thickness,
    charge,
    active,
    age: 0,
    damage,
  });
}

function spawnLane(y, rule, telegraph = 0.18, active = 0.56, damage = 7) {
  game.hazards.push({
    kind: "lane",
    x: ARENA.x,
    y,
    w: ARENA.w,
    h: 24,
    rule,
    telegraph,
    active,
    age: 0,
    damage,
  });
}

function spawnGroundBone(height, width = 20, speed = -300, damage = 8, fromLeft = false, startOffset = 0) {
  game.hazards.push({
    kind: "bone",
    x: fromLeft ? ARENA.x - width - 24 - startOffset : ARENA.x + ARENA.w + 24 + startOffset,
    y: ARENA.y + ARENA.h - height,
    w: width,
    h: height,
    vx: speed,
    vy: 0,
    rule: "white",
    orientation: "vertical",
    damage,
  });
}

function updatePlayer(dt) {
  const player = game.player;
  const previousX = player.x;
  const previousY = player.y;

  if (player.soulMode === "red") {
    const moveX = (keyDown("arrowright", "d") ? 1 : 0) - (keyDown("arrowleft", "a") ? 1 : 0);
    const moveY = (keyDown("arrowdown", "s") ? 1 : 0) - (keyDown("arrowup", "w") ? 1 : 0);
    const length = Math.hypot(moveX, moveY) || 1;
    const speed = PLAYER_STATS.redSpeed;

    player.x += (moveX / length) * speed * dt;
    player.y += (moveY / length) * speed * dt;
  } else {
    const moveX = (keyDown("arrowright", "d") ? 1 : 0) - (keyDown("arrowleft", "a") ? 1 : 0);
    const speed = PLAYER_STATS.blueSpeed;
    const floorY = ARENA.y + ARENA.h - 12;

    if (keyPressed("arrowup", "w") && player.y >= floorY - 1) {
      player.vy = PLAYER_STATS.jumpVelocity;
    }

    player.x += moveX * speed * dt;
    player.vy += PLAYER_STATS.gravity * dt;
    player.y += player.vy * dt;

    if (player.y > floorY) {
      player.y = floorY;
      player.vy = 0;
    }
  }

  player.x = clamp(player.x, ARENA.x + player.radius, ARENA.x + ARENA.w - player.radius);
  player.y = clamp(player.y, ARENA.y + player.radius, ARENA.y + ARENA.h - player.radius);
  player.moving = Math.hypot(player.x - previousX, player.y - previousY) > 0.9;

  if (player.invuln > 0) {
    player.invuln -= dt;
  }
}

function updateHazards(dt) {
  for (let index = game.hazards.length - 1; index >= 0; index -= 1) {
    const hazard = game.hazards[index];

    if (hazard.kind === "beam" || hazard.kind === "lane") {
      hazard.age += dt;
    } else {
      hazard.x += hazard.vx * dt;
      hazard.y += hazard.vy * dt;
    }

    let activeRect = null;

    if (hazard.kind === "beam") {
      const active = hazard.age >= hazard.charge && hazard.age <= hazard.charge + hazard.active;
      if (active) {
        game.eyeFlash = 0.9;
        activeRect =
          hazard.orientation === "vertical"
            ? { x: hazard.position - hazard.thickness / 2, y: ARENA.y, w: hazard.thickness, h: ARENA.h }
            : { x: ARENA.x, y: hazard.position - hazard.thickness / 2, w: ARENA.w, h: hazard.thickness };
      }
      if (hazard.age > hazard.charge + hazard.active + 0.15) {
        game.hazards.splice(index, 1);
        continue;
      }
    } else if (hazard.kind === "lane") {
      const active = hazard.age >= hazard.telegraph && hazard.age <= hazard.telegraph + hazard.active;
      if (active) {
        activeRect = { x: hazard.x, y: hazard.y, w: hazard.w, h: hazard.h };
      }
      if (hazard.age > hazard.telegraph + hazard.active) {
        game.hazards.splice(index, 1);
        continue;
      }
    } else {
      activeRect = { x: hazard.x, y: hazard.y, w: hazard.w, h: hazard.h };
      const outOfBounds =
        hazard.x + hazard.w < ARENA.x - 60 ||
        hazard.x > ARENA.x + ARENA.w + 60 ||
        hazard.y + hazard.h < ARENA.y - 60 ||
        hazard.y > ARENA.y + ARENA.h + 60;

      if (outOfBounds) {
        game.hazards.splice(index, 1);
        continue;
      }
    }

    if (activeRect && shouldDamage(hazard.rule) && circleRectCollision(game.player.x, game.player.y, game.player.radius, activeRect)) {
      hurtPlayer(hazard.damage);
    }
  }
}

function updateEnemyPattern(dt) {
  const enemy = game.enemy;
  const pattern = enemy.pattern;
  enemy.t += dt;

  if (enemy.t < pattern.duration) {
    switch (pattern.key) {
      case "boneWalls": {
        if (enemy.t >= enemy.nextSpawn) {
          const margin = pattern.margin ?? 52;
          const center = ARENA.y + (pattern.baseOffset ?? 54) + ((enemy.step * (pattern.centerStep ?? 39)) % (pattern.centerRange ?? 116));
          const gap = clamp(center + randomRange(-(pattern.jitter ?? 10), pattern.jitter ?? 10), ARENA.y + margin, ARENA.y + ARENA.h - margin);
          const fromRight = enemy.step % 2 === 1;
          const offset = (enemy.step % 4 < 2 ? 1 : -1) * (pattern.offset ?? 20);

          spawnBoneColumn(gap, pattern.gapSize ?? 78, pattern.speed ?? 300, fromRight, "white", pattern.damage ?? 8);
          if (cycleHits(enemy.step, pattern.pairModulo, pattern.pairCount ?? 0, pattern.pairShift ?? 0)) {
            spawnBoneColumn(
              clamp(gap + offset, ARENA.y + margin, ARENA.y + ARENA.h - margin),
              pattern.secondGapSize ?? (pattern.gapSize ?? 78) + 8,
              (pattern.speed ?? 300) + (pattern.secondSpeedDelta ?? 20),
              !fromRight,
              "white",
              pattern.secondDamage ?? pattern.damage ?? 8,
            );
          }
          enemy.nextSpawn += pattern.interval ?? 0.68;
          enemy.step += 1;
        }
        break;
      }
      case "blasters": {
        if (enemy.t >= enemy.nextSpawn) {
          const xMargin = pattern.xMargin ?? 56;
          const yMargin = pattern.yMargin ?? 40;
          const vertical = ARENA.x + xMargin + ((enemy.step * (pattern.verticalStride ?? 73)) % (ARENA.w - xMargin * 2));
          const horizontal = ARENA.y + yMargin + ((enemy.step * (pattern.horizontalStride ?? 47)) % (ARENA.h - yMargin * 2));

          spawnBeam("vertical", vertical, pattern.vThickness ?? 38, pattern.vDamage ?? 10, pattern.vCharge ?? 0.52, pattern.vActive ?? 0.2);
          spawnBeam("horizontal", horizontal, pattern.hThickness ?? 34, pattern.hDamage ?? 9, pattern.hCharge ?? 0.46, pattern.hActive ?? 0.18);

          if (cycleHits(enemy.step, pattern.extraModulo, pattern.extraCount ?? 0, pattern.extraShift ?? 0)) {
            const extra = clamp(
              vertical + (enemy.step % 2 === 0 ? pattern.extraSpacing ?? 88 : -(pattern.extraSpacing ?? 88)),
              ARENA.x + xMargin,
              ARENA.x + ARENA.w - xMargin,
            );
            spawnBeam(
              pattern.extraOrientation === "horizontal" ? "horizontal" : "vertical",
              pattern.extraOrientation === "horizontal"
                ? clamp(
                    horizontal + (enemy.step % 2 === 0 ? pattern.extraSpacing ?? 64 : -(pattern.extraSpacing ?? 64)),
                    ARENA.y + yMargin,
                    ARENA.y + ARENA.h - yMargin,
                  )
                : extra,
              pattern.extraThickness ?? 28,
              pattern.extraDamage ?? 8,
              pattern.extraCharge ?? 0.4,
              pattern.extraActive ?? 0.16,
            );
          }
          enemy.nextSpawn += pattern.interval ?? 1;
          enemy.step += 1;
        }
        break;
      }
      case "colorBones": {
        if (enemy.t >= enemy.nextSpawn) {
          const order = pattern.order ?? ["blue", "orange", "white", "orange"];
          spawnLane(
            laneRowAt(enemy.step, pattern.firstOffset ?? 0),
            order[enemy.step % order.length],
            pattern.telegraph ?? 0.22,
            pattern.active ?? 0.5,
            pattern.damage ?? 7,
          );

          if (cycleHits(enemy.step, pattern.secondModulo, pattern.secondCount ?? 0, pattern.secondShift ?? 0)) {
            spawnLane(
              laneRowAt(enemy.step, pattern.secondOffset ?? 3),
              order[(enemy.step + 1) % order.length],
              pattern.secondTelegraph ?? pattern.telegraph ?? 0.2,
              pattern.secondActive ?? pattern.active ?? 0.44,
              pattern.secondDamage ?? pattern.damage ?? 7,
            );
          }

          if (cycleHits(enemy.step, pattern.thirdModulo, pattern.thirdCount ?? 0, pattern.thirdShift ?? 0)) {
            spawnLane(
              laneRowAt(enemy.step, pattern.thirdOffset ?? 5),
              order[(enemy.step + 2) % order.length],
              pattern.thirdTelegraph ?? 0.14,
              pattern.thirdActive ?? 0.3,
              pattern.thirdDamage ?? 6,
            );
          }
          enemy.nextSpawn += pattern.interval ?? 0.76;
          enemy.step += 1;
        }
        break;
      }
      case "blueJump": {
        if (enemy.t >= enemy.nextSpawn) {
          const fromLeft = enemy.step % 2 === (pattern.startFromLeft ? 0 : 1);
          const speedBase = pattern.speed ?? 315;
          const speed = fromLeft ? speedBase : -speedBase;
          const tall = cycleHits(enemy.step, pattern.tallModulo ?? 4, 1, pattern.tallShift ?? 2);

          spawnGroundBone(
            tall ? pattern.tallHeight ?? 76 : pattern.shortHeight ?? 64,
            tall ? pattern.tallWidth ?? 24 : pattern.shortWidth ?? 18,
            speed,
            tall ? pattern.tallDamage ?? 9 : pattern.shortDamage ?? 7,
            fromLeft,
          );

          if (cycleHits(enemy.step, pattern.extraModulo, pattern.extraCount ?? 0, pattern.extraShift ?? 0)) {
            const extraSpeed = speedBase + (pattern.extraSpeedDelta ?? 24);
            spawnGroundBone(
              pattern.extraHeight ?? 50,
              pattern.extraWidth ?? 16,
              fromLeft ? extraSpeed : -extraSpeed,
              pattern.extraDamage ?? 6,
              fromLeft,
              pattern.extraOffset ?? 42,
            );
          }

          if (cycleHits(enemy.step, pattern.bonusModulo, pattern.bonusCount ?? 0, pattern.bonusShift ?? 0)) {
            const bonusSpeed = speedBase + (pattern.bonusSpeedDelta ?? 40);
            spawnGroundBone(
              pattern.bonusHeight ?? 72,
              pattern.bonusWidth ?? 16,
              fromLeft ? bonusSpeed : -bonusSpeed,
              pattern.bonusDamage ?? 7,
              fromLeft,
              pattern.bonusOffset ?? 82,
            );
          }
          enemy.nextSpawn += tall ? pattern.tallInterval ?? 0.92 : pattern.interval ?? 0.72;
          enemy.step += 1;
        }
        break;
      }
      case "crossfire": {
        if (enemy.t >= enemy.nextSpawn) {
          const margin = pattern.margin ?? 48;
          const center = ARENA.y + (pattern.baseOffset ?? 52) + ((enemy.step * (pattern.centerStep ?? 51)) % (pattern.centerRange ?? 118));
          const gap = clamp(center + randomRange(-(pattern.jitter ?? 6), pattern.jitter ?? 6), ARENA.y + margin, ARENA.y + ARENA.h - margin);
          const fromRight = enemy.step % 2 === 0;

          spawnBoneColumn(gap, pattern.gapSize ?? 72, pattern.speed ?? 325, fromRight, "white", pattern.damage ?? 9);
          if (cycleHits(enemy.step, pattern.pairModulo, pattern.pairCount ?? 0, pattern.pairShift ?? 0)) {
            spawnBoneColumn(
              clamp(gap + (enemy.step % 4 < 2 ? 1 : -1) * (pattern.offset ?? 22), ARENA.y + margin, ARENA.y + ARENA.h - margin),
              pattern.secondGapSize ?? (pattern.gapSize ?? 72) + 8,
              (pattern.speed ?? 325) + (pattern.secondSpeedDelta ?? 14),
              !fromRight,
              "white",
              pattern.secondDamage ?? pattern.damage ?? 8,
            );
          }
          enemy.nextSpawn += pattern.interval ?? 0.6;
          enemy.step += 1;
        }

        if (pattern.beamInterval && enemy.t >= enemy.nextExtra) {
          const orientation = enemy.switched ? "horizontal" : "vertical";
          const position =
            orientation === "vertical"
              ? ARENA.x +
                (pattern.beamXMargin ?? 52) +
                ((enemy.step * (pattern.beamVerticalStride ?? 67)) % (ARENA.w - (pattern.beamXMargin ?? 52) * 2))
              : ARENA.y +
                (pattern.beamYMargin ?? 38) +
                ((enemy.step * (pattern.beamHorizontalStride ?? 43)) % (ARENA.h - (pattern.beamYMargin ?? 38) * 2));
          spawnBeam(
            orientation,
            position,
            pattern.beamThickness ?? 36,
            pattern.beamDamage ?? 10,
            pattern.beamCharge ?? 0.46,
            pattern.beamActive ?? 0.18,
          );
          enemy.switched = !enemy.switched;
          enemy.nextExtra += pattern.beamInterval;
        }

        if (pattern.pulseInterval && enemy.t >= enemy.nextPulse) {
          spawnLane(
            laneRowAt(enemy.step, pattern.pulseOffset ?? 1),
            enemy.switched ? pattern.pulseRuleA ?? "orange" : pattern.pulseRuleB ?? "blue",
            pattern.pulseTelegraph ?? 0.12,
            pattern.pulseActive ?? 0.42,
            pattern.pulseDamage ?? 7,
          );
          enemy.nextPulse += pattern.pulseInterval;
        }
        break;
      }
      case "blueRush": {
        if (enemy.t >= enemy.nextSpawn) {
          const combo = enemy.step % 4;
          const fromLeft = enemy.step % 2 === 0;
          const speedBase = pattern.mainSpeed ?? 420;
          const speed = fromLeft ? speedBase : -speedBase;
          const rushHeights = pattern.rushHeights ?? [76, 96, 126, 96];
          const rushWidths = pattern.rushWidths ?? [18, 22, 24, 22];
          const rushDamages = pattern.rushDamages ?? [8, 9, 10, 9];
          const supportHeights = pattern.supportHeights ?? [54, 70];

          spawnGroundBone(rushHeights[combo], rushWidths[combo], speed, rushDamages[combo], fromLeft);
          spawnGroundBone(supportHeights[combo % supportHeights.length], pattern.supportWidth ?? 16, speed, pattern.supportDamage ?? 7, fromLeft, pattern.supportOffset ?? 44);
          if (combo >= 2) {
            spawnGroundBone(pattern.bonusHeight ?? 62, pattern.bonusWidth ?? 14, speed, pattern.bonusDamage ?? 7, fromLeft, pattern.bonusOffset ?? 88);
          }
          enemy.nextSpawn += combo === 3 ? pattern.tallInterval ?? 0.76 : pattern.interval ?? 0.54;
          enemy.step += 1;
        }

        if (pattern.extraInterval && enemy.t >= enemy.nextExtra) {
          const fromLeft = !enemy.switched;
          spawnGroundBone(
            pattern.extraHeight ?? 84,
            pattern.extraWidth ?? 18,
            fromLeft ? (pattern.mainSpeed ?? 340) - 20 : -((pattern.mainSpeed ?? 340) - 20),
            pattern.extraDamage ?? 8,
            fromLeft,
          );
          enemy.switched = !enemy.switched;
          enemy.nextExtra += pattern.extraInterval;
        }
        break;
      }
      case "gauntlet": {
        if (enemy.t >= enemy.nextSpawn) {
          const margin = pattern.margin ?? 46;
          const center = ARENA.y + (pattern.baseOffset ?? 50) + ((enemy.step * (pattern.centerStep ?? 49)) % (pattern.centerRange ?? 124));
          const gap = clamp(center + randomRange(-(pattern.jitter ?? 8), pattern.jitter ?? 8), ARENA.y + margin, ARENA.y + ARENA.h - margin);
          const fromRight = enemy.step % 2 === 0;

          spawnBoneColumn(gap, pattern.gapSize ?? 68, pattern.speed ?? 338, fromRight, "white", pattern.damage ?? 9);
          if (cycleHits(enemy.step, pattern.pairModulo, pattern.pairCount ?? 0, pattern.pairShift ?? 0)) {
            spawnBoneColumn(
              clamp(gap + (enemy.step % 4 < 2 ? 1 : -1) * (pattern.offset ?? 24), ARENA.y + margin, ARENA.y + ARENA.h - margin),
              pattern.secondGapSize ?? (pattern.gapSize ?? 68) + 6,
              (pattern.speed ?? 338) + (pattern.secondSpeedDelta ?? 14),
              !fromRight,
              "white",
              pattern.secondDamage ?? pattern.damage ?? 8,
            );
          }
          enemy.nextSpawn += pattern.interval ?? 0.48;
          enemy.step += 1;
        }

        if (pattern.laneInterval && enemy.t >= enemy.nextExtra) {
          const order = pattern.laneOrder ?? ["blue", "orange", "white", "orange"];
          spawnLane(
            laneRowAt(enemy.step, pattern.laneOffset ?? 1),
            order[enemy.step % order.length],
            pattern.laneTelegraph ?? 0.12,
            pattern.laneActive ?? 0.48,
            pattern.laneDamage ?? 8,
          );

          if (cycleHits(enemy.step, pattern.laneSecondModulo, pattern.laneSecondCount ?? 0, pattern.laneSecondShift ?? 0)) {
            spawnLane(
              laneRowAt(enemy.step, pattern.laneSecondOffset ?? 4),
              order[(enemy.step + 1) % order.length],
              pattern.laneSecondTelegraph ?? 0.1,
              pattern.laneSecondActive ?? 0.38,
              pattern.laneSecondDamage ?? 7,
            );
          }

          if (cycleHits(enemy.step, pattern.laneThirdModulo, pattern.laneThirdCount ?? 0, pattern.laneThirdShift ?? 0)) {
            spawnLane(
              laneRowAt(enemy.step, pattern.laneThirdOffset ?? 0),
              order[(enemy.step + 2) % order.length],
              pattern.laneThirdTelegraph ?? 0.1,
              pattern.laneThirdActive ?? 0.28,
              pattern.laneThirdDamage ?? 6,
            );
          }
          enemy.nextExtra += pattern.laneInterval;
        }
        break;
      }
      case "finale": {
        if (enemy.t >= enemy.nextSpawn) {
          const margin = pattern.margin ?? 46;
          const gap =
            ARENA.y +
            (pattern.baseOffset ?? 50) +
            ((enemy.step * (pattern.centerStep ?? 61)) % (pattern.centerRange ?? 124)) +
            randomRange(-(pattern.jitter ?? 8), pattern.jitter ?? 8);
          const shift = enemy.step % 4 < 2 ? pattern.offset ?? 22 : -(pattern.offset ?? 22);
          const fromRight = enemy.step % 2 === 0;

          spawnBoneColumn(
            clamp(gap, ARENA.y + margin, ARENA.y + ARENA.h - margin),
            pattern.gapSize ?? 66,
            pattern.speed ?? 355,
            fromRight,
            "white",
            pattern.damage ?? 9,
          );
          if (cycleHits(enemy.step, pattern.pairModulo, pattern.pairCount ?? 0, pattern.pairShift ?? 0)) {
            spawnBoneColumn(
              clamp(gap + shift, ARENA.y + margin, ARENA.y + ARENA.h - margin),
              pattern.secondGapSize ?? (pattern.gapSize ?? 66) + 6,
              (pattern.speed ?? 355) + (pattern.secondSpeedDelta ?? 24),
              !fromRight,
              "white",
              pattern.secondDamage ?? pattern.damage ?? 9,
            );
          }
          enemy.nextSpawn += pattern.interval ?? 0.44;
          enemy.step += 1;
        }

        if (pattern.beamInterval && enemy.t >= enemy.nextExtra) {
          const orientation = enemy.switched ? "horizontal" : "vertical";
          const position =
            orientation === "vertical"
              ? ARENA.x +
                (pattern.beamXMargin ?? 56) +
                ((enemy.step * (pattern.beamVerticalStride ?? 67)) % (ARENA.w - (pattern.beamXMargin ?? 56) * 2))
              : ARENA.y +
                (pattern.beamYMargin ?? 42) +
                ((enemy.step * (pattern.beamHorizontalStride ?? 41)) % (ARENA.h - (pattern.beamYMargin ?? 42) * 2));
          spawnBeam(
            orientation,
            position,
            orientation === "vertical" ? pattern.beamThickness ?? 38 : Math.max(28, (pattern.beamThickness ?? 38) - 4),
            pattern.beamDamage ?? 11,
            pattern.beamCharge ?? 0.42,
            pattern.beamActive ?? 0.18,
          );
          enemy.switched = !enemy.switched;
          enemy.nextExtra += pattern.beamInterval;
        }

        if (pattern.pulseInterval && enemy.t >= enemy.nextPulse) {
          const order = pattern.pulseOrder ?? ["blue", "orange", "white"];
          spawnLane(
            laneRowAt(enemy.step, pattern.pulseOffset ?? 2),
            order[enemy.step % order.length],
            pattern.pulseTelegraph ?? 0.1,
            pattern.pulseActive ?? 0.36,
            pattern.pulseDamage ?? 7,
          );
          enemy.nextPulse += pattern.pulseInterval;
        }
        break;
      }
      default:
        break;
    }
  }

  updatePlayer(dt);
  updateHazards(dt);

  if (enemy.t > enemy.pattern.duration && game.hazards.length === 0) {
    finishEnemyTurn();
  }
}

function resolveMenuAction() {
  const choice = MENU_OPTIONS[game.menuIndex];

  if (choice === "FIGHT") {
    startAttackMeter();
    return;
  }

  if (choice === "ACT") {
    const lines = ACT_LINES[Math.min(game.roundIndex, ACT_LINES.length - 1)];
    queueText(lines, () => {
      if (game.roundIndex >= PATTERNS.length) {
        openMenu();
      } else {
        startEnemyTurn();
      }
    });
    return;
  }

  if (choice === "ITEM") {
    if (!game.itemUsed) {
      game.itemUsed = true;
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + PLAYER_STATS.itemHeal);
      queueText(["* 버터스카치 파이를 꺼냈다.", "* HP가 크게 회복되었다."], () => {
        if (game.roundIndex >= PATTERNS.length) {
          openMenu();
        } else {
          startEnemyTurn();
        }
      });
    } else {
      queueText(["* 더 이상 쓸 아이템이 없다."], () => {
        if (game.roundIndex >= PATTERNS.length) {
          openMenu();
        } else {
          startEnemyTurn();
        }
      });
    }
    return;
  }

  queueText(
    game.roundIndex >= PATTERNS.length
      ? ["* 아직 끝낼 때가 아니다."]
      : ["* 자비를 베풀기엔 이미 너무 늦었다."],
    () => {
      if (game.roundIndex >= PATTERNS.length) {
        openMenu();
      } else {
        startEnemyTurn();
      }
    },
  );
}

function updateMenu() {
  if (keyPressed("arrowleft", "a")) {
    game.menuIndex = (game.menuIndex + MENU_OPTIONS.length - 1) % MENU_OPTIONS.length;
  }
  if (keyPressed("arrowright", "d")) {
    game.menuIndex = (game.menuIndex + 1) % MENU_OPTIONS.length;
  }
  if (keyPressed("z", "enter")) {
    resolveMenuAction();
  }
}

function updateText() {
  if (!game.text || !keyPressed("z", "enter")) {
    return;
  }

  if (game.text.index < game.text.lines.length - 1) {
    game.text.index += 1;
    return;
  }

  const onComplete = game.text.onComplete;
  game.text = null;
  if (onComplete) {
    onComplete();
  }
}

function updateAttackMeter(dt) {
  const meter = game.attackMeter;
  meter.resolveTimer = Math.max(0, meter.resolveTimer - dt);

  if (!meter.locked) {
    meter.x += meter.dir * meter.speed * dt;
    if (meter.x >= meter.max) {
      meter.x = meter.max;
      meter.dir = -1;
    } else if (meter.x <= meter.min) {
      meter.x = meter.min;
      meter.dir = 1;
    }

    if (keyPressed("z", "enter")) {
      const center = (meter.min + meter.max) / 2;
      const distance = Math.abs(meter.x - center);
      const maxDistance = (meter.max - meter.min) / 2;
      meter.accuracy = 1 - distance / maxDistance;
      meter.locked = true;
      meter.resolveTimer = 0.28;
    }
    return;
  }

  if (meter.resolveTimer > 0) {
    return;
  }

  if (game.roundIndex < PATTERNS.length) {
    const dodgeLines = [
      "* 샌즈가 가볍게 비켜 섰다.",
      "* \"좋은 타이밍이네. 아쉽지만.\"",
    ];
    game.attackMeter = null;
    queueText(dodgeLines, () => startEnemyTurn());
    return;
  }

  game.attackMeter = null;
  if (meter.accuracy < PLAYER_STATS.finalHitWindow) {
    queueText(["* 손끝이 잠깐 흔들렸다.", "* 마지막 일격이 빗나갔다."], () => openMenu());
    return;
  }

  queueText(["* 일격이 그대로 꽂혔다.", "* 샌즈의 웃음이 멎는다."], () => {
    if (game.stopwatch.auto) {
      stopStopwatch();
    }
    game.state = "win";
  });
}

function updateTitle() {
  if (keyPressed("z", "enter")) {
    queueText(INTRO_LINES, () => openMenu());
  }
}

function updateWinLose() {
  if (keyPressed("z", "enter")) {
    resetGame();
  }
}

function update(dt) {
  for (const star of game.stars) {
    star.y += star.speed * dt;
    if (star.y > 240) {
      star.y = -8;
      star.x = Math.random() * WIDTH;
    }
  }

  game.eyeFlash = Math.max(0, game.eyeFlash - dt * 1.8);
  game.shake = Math.max(0, game.shake - dt * 26);
  game.command.timer = Math.max(0, game.command.timer - dt);
  if (game.stopwatch.running) {
    game.stopwatch.elapsed += dt;
  }

  if (game.command.open) {
    soundtrack.setStage(game.state, game.roundIndex, PATTERNS.length);
    inputState.pressed.clear();
    return;
  }

  switch (game.state) {
    case "title":
      updateTitle();
      break;
    case "menu":
      updateMenu();
      break;
    case "text":
      updateText();
      break;
    case "attack":
      updateAttackMeter(dt);
      break;
    case "enemy":
      updateEnemyPattern(dt);
      break;
    case "win":
    case "lose":
      updateWinLose();
      break;
    default:
      break;
  }

  soundtrack.setStage(game.state, game.roundIndex, PATTERNS.length);
  inputState.pressed.clear();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "#071019");
  gradient.addColorStop(0.6, "#05070a");
  gradient.addColorStop(1, "#020305");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  for (const star of game.stars) {
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }

  ctx.fillStyle = "rgba(85, 213, 255, 0.06)";
  ctx.fillRect(0, 0, WIDTH, 145);

  ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
  ctx.fillRect(0, 145, WIDTH, 4);
}

function drawSans() {
  const x = 480;
  const y = 104 + Math.sin(performance.now() * 0.0022) * 4;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = "#1b6f8d";
  ctx.beginPath();
  ctx.moveTo(-54, 74);
  ctx.lineTo(-76, 130);
  ctx.lineTo(76, 130);
  ctx.lineTo(54, 74);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#111827";
  ctx.fillRect(-48, 74, 96, 58);

  ctx.fillStyle = "#f8fbff";
  ctx.beginPath();
  ctx.arc(0, 38, 42, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillRect(-28, 72, 56, 18);

  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.ellipse(-15, 32, 10, 14, 0, 0, Math.PI * 2);
  ctx.ellipse(15, 32, 10, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  if (game.eyeFlash > 0.05) {
    ctx.fillStyle = `rgba(85, 210, 255, ${0.5 + game.eyeFlash * 0.4})`;
    ctx.beginPath();
    ctx.arc(-15, 32, 11 + game.eyeFlash * 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-20, 54);
  ctx.quadraticCurveTo(0, 64, 20, 54);
  ctx.stroke();

  ctx.lineWidth = 2;
  for (let offset = -16; offset <= 16; offset += 8) {
    ctx.beginPath();
    ctx.moveTo(offset, 52);
    ctx.lineTo(offset, 58);
    ctx.stroke();
  }

  ctx.restore();
}

function drawHeart(x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 18, size / 18);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(0, -3, -10, -3, -10, 6);
  ctx.bezierCurveTo(-10, 12, -4, 16, 0, 20);
  ctx.bezierCurveTo(4, 16, 10, 12, 10, 6);
  ctx.bezierCurveTo(10, -3, 0, -3, 0, 6);
  ctx.fill();
  ctx.restore();
}

function drawBone(hazard) {
  const color =
    hazard.rule === "blue" ? COLORS.blue : hazard.rule === "orange" ? COLORS.orange : COLORS.bone;

  ctx.fillStyle = color;
  if (hazard.orientation === "vertical") {
    ctx.fillRect(hazard.x + 5, hazard.y, hazard.w - 10, hazard.h);
    ctx.beginPath();
    ctx.arc(hazard.x + hazard.w / 2, hazard.y + 5, 9, 0, Math.PI * 2);
    ctx.arc(hazard.x + hazard.w / 2, hazard.y + hazard.h - 5, 9, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(hazard.x, hazard.y + 5, hazard.w, hazard.h - 10);
    ctx.beginPath();
    ctx.arc(hazard.x + 5, hazard.y + hazard.h / 2, 9, 0, Math.PI * 2);
    ctx.arc(hazard.x + hazard.w - 5, hazard.y + hazard.h / 2, 9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBeam(hazard) {
  const warningAlpha = 0.2 + Math.abs(Math.sin(hazard.age * 28)) * 0.26;

  if (hazard.age < hazard.charge) {
    ctx.fillStyle = `rgba(255, 255, 255, ${warningAlpha})`;
    if (hazard.orientation === "vertical") {
      ctx.fillRect(hazard.position - 3, ARENA.y, 6, ARENA.h);
      ctx.fillStyle = "rgba(85, 210, 255, 0.7)";
      ctx.fillRect(hazard.position - 14, ARENA.y - 18, 28, 10);
    } else {
      ctx.fillRect(ARENA.x, hazard.position - 3, ARENA.w, 6);
      ctx.fillStyle = "rgba(85, 210, 255, 0.7)";
      ctx.fillRect(ARENA.x - 18, hazard.position - 14, 10, 28);
    }
    return;
  }

  ctx.save();
  ctx.shadowColor = "rgba(85, 210, 255, 0.9)";
  ctx.shadowBlur = 28;
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  if (hazard.orientation === "vertical") {
    ctx.fillRect(hazard.position - hazard.thickness / 2, ARENA.y, hazard.thickness, ARENA.h);
  } else {
    ctx.fillRect(ARENA.x, hazard.position - hazard.thickness / 2, ARENA.w, hazard.thickness);
  }
  ctx.restore();
}

function drawLane(hazard) {
  const color =
    hazard.rule === "blue" ? "rgba(87, 210, 255, 0.85)" : hazard.rule === "orange" ? "rgba(255, 159, 46, 0.88)" : "rgba(247, 251, 255, 0.9)";

  const alpha = hazard.age < hazard.telegraph ? 0.22 + hazard.age / hazard.telegraph : 0.95;
  ctx.fillStyle = color.replace("0.85", alpha.toFixed(2)).replace("0.88", alpha.toFixed(2)).replace("0.9", alpha.toFixed(2));
  ctx.fillRect(hazard.x, hazard.y, hazard.w, hazard.h);

  ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
  for (let x = hazard.x; x < hazard.x + hazard.w; x += 20) {
    ctx.fillRect(x, hazard.y, 10, hazard.h);
  }
}

function drawArena() {
  ctx.fillStyle = COLORS.arenaFill;
  ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  ctx.strokeStyle = COLORS.arenaBorder;
  ctx.lineWidth = 4;
  ctx.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);

  ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
  ctx.fillRect(ARENA.x, ARENA.y + ARENA.h - 12, ARENA.w, 12);

  if (game.state === "enemy") {
    for (const hazard of game.hazards) {
      if (hazard.kind === "beam") {
        drawBeam(hazard);
      } else if (hazard.kind === "lane") {
        drawLane(hazard);
      } else {
        drawBone(hazard);
      }
    }

    if (!(game.player.invuln > 0 && Math.floor(performance.now() / 70) % 2 === 0)) {
      drawHeart(game.player.x, game.player.y, 16, game.player.soulMode === "blue" ? COLORS.soulBlue : COLORS.soul);
    }
  }
}

function drawEnemyInfo() {
  ctx.fillStyle = COLORS.text;
  ctx.font = '700 24px "SF Mono", "Menlo", monospace';
  ctx.fillText("SANS", 206, 118);

  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(310, 98, 208, 16);

  ctx.fillStyle = game.roundIndex >= PATTERNS.length ? COLORS.orange : COLORS.yellow;
  const width = game.roundIndex >= PATTERNS.length ? 32 : Math.max(28, 208 * (1 - game.roundIndex / PATTERNS.length));
  ctx.fillRect(310, 98, width, 16);

  ctx.fillStyle = COLORS.muted;
  ctx.font = '700 14px "SF Mono", "Menlo", monospace';
  ctx.fillText(game.roundIndex >= PATTERNS.length ? "FINAL" : `PHASE ${game.roundIndex + 1}/${PATTERNS.length}`, 542, 111);
}

function drawMenu() {
  const startX = 184;

  for (let index = 0; index < MENU_OPTIONS.length; index += 1) {
    const x = startX + index * 148;
    const selected = game.menuIndex === index && game.state === "menu";

    ctx.strokeStyle = selected ? MENU_COLORS[index] : "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, MENU_Y, BUTTON_W, BUTTON_H);

    if (selected) {
      drawHeart(x + 18, MENU_Y + 17, 10, COLORS.soul);
    }

    ctx.fillStyle = MENU_COLORS[index];
    ctx.font = '700 20px "SF Mono", "Menlo", monospace';
    ctx.fillText(MENU_OPTIONS[index], x + 34, MENU_Y + 23);
  }
}

function drawDialogBox() {
  ctx.fillStyle = "#000000";
  ctx.fillRect(DIALOG.x, DIALOG.y, DIALOG.w, DIALOG.h);
  ctx.strokeStyle = COLORS.arenaBorder;
  ctx.lineWidth = 4;
  ctx.strokeRect(DIALOG.x, DIALOG.y, DIALOG.w, DIALOG.h);

  let line = "";
  if (game.state === "title") {
    line = "* Z 또는 Enter를 눌러 시작";
  } else if (game.state === "menu") {
    line = game.prompt;
  } else if (game.state === "text" && game.text) {
    line = game.text.lines[game.text.index];
  } else if (game.state === "attack") {
    line = "* 가운데에 맞춰 공격해라.";
  } else if (game.state === "enemy" && game.enemy) {
    line = game.enemy.pattern.hint;
  } else if (game.state === "win") {
    line = "* 승리했다. Z 또는 Enter로 다시 시작";
  } else if (game.state === "lose") {
    line = "* 쓰러졌다. Z 또는 Enter로 다시 시작";
  }

  ctx.fillStyle = COLORS.text;
  ctx.font = '700 24px "SF Mono", "Menlo", monospace';
  ctx.fillText(line, DIALOG.x + 28, DIALOG.y + 42);
}

function drawAttackMeter() {
  if (game.state !== "attack" || !game.attackMeter) {
    return;
  }

  const meter = game.attackMeter;
  const y = DIALOG.y + 64;
  const h = 16;
  const center = (meter.min + meter.max) / 2;

  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(meter.min, y, meter.max - meter.min, h);
  ctx.fillStyle = COLORS.yellow;
  ctx.fillRect(center - 18, y, 36, h);
  ctx.fillStyle = COLORS.orange;
  ctx.fillRect(meter.x - 4, y - 6, 8, h + 12);
}

function drawPlayerInfo() {
  const hpRatio = game.player.hp / game.player.maxHp;
  const hudX = 744;
  const hudY = 88;
  const hudW = 154;
  const hudH = 52;
  const timerY = hudY + hudH + 10;

  ctx.fillStyle = COLORS.text;
  ctx.font = '700 20px "SF Mono", "Menlo", monospace';
  ctx.fillText("FRISK", 170, 332);
  ctx.fillText("HP", 312, 332);

  ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(352, 316, 180, 22);
  ctx.fillStyle = hpRatio <= 0.3 ? COLORS.damage : COLORS.orange;
  ctx.fillRect(352, 316, 180 * hpRatio, 22);

  ctx.fillStyle = COLORS.text;
  ctx.fillText(`${game.player.hp} / ${game.player.maxHp}`, 548, 332);

  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.fillRect(hudX, hudY, hudW, hudH);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(hudX, hudY, hudW, hudH);

  ctx.fillStyle = COLORS.muted;
  ctx.font = '700 13px "SF Mono", "Menlo", monospace';
  ctx.fillText("CURRENT HP", hudX + 12, hudY + 17);

  ctx.fillStyle = hpRatio <= 0.3 ? COLORS.damage : COLORS.text;
  ctx.font = '700 26px "SF Mono", "Menlo", monospace';
  ctx.fillText(`${game.player.hp}`, hudX + 12, hudY + 42);

  ctx.fillStyle = COLORS.muted;
  ctx.font = '700 14px "SF Mono", "Menlo", monospace';
  ctx.fillText(`/ ${game.player.maxHp}`, hudX + 58, hudY + 42);

  if (!game.stopwatch.visible) {
    return;
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.fillRect(hudX, timerY, hudW, hudH);
  ctx.strokeStyle = game.stopwatch.running ? "rgba(85, 213, 255, 0.34)" : "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(hudX, timerY, hudW, hudH);

  ctx.fillStyle = game.stopwatch.running ? COLORS.blue : COLORS.muted;
  ctx.font = '700 13px "SF Mono", "Menlo", monospace';
  ctx.fillText(game.stopwatch.auto ? "STOPWATCH AUTO" : "STOPWATCH", hudX + 12, timerY + 17);

  ctx.fillStyle = COLORS.text;
  ctx.font = '700 24px "SF Mono", "Menlo", monospace';
  ctx.fillText(formatStopwatchTime(game.stopwatch.elapsed), hudX + 12, timerY + 42);
}

function drawOverlay() {
  if (game.state === "title") {
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.font = '700 48px "SF Mono", "Menlo", monospace';
    ctx.fillText("SANS BOSS FIGHT", WIDTH / 2, 270);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '700 20px "SF Mono", "Menlo", monospace';
    ctx.fillText(`확장된 ${PATTERNS.length}단계 패턴과 혼합 공격을 버텨라.`, WIDTH / 2, 308);
    ctx.fillText("아무 키나 클릭으로 음악 시작, M 키로 음소거", WIDTH / 2, 338);
    ctx.fillText("/ 키로 명령어 콘솔 열기", WIDTH / 2, 368);
    ctx.textAlign = "left";
  }

  if (game.state === "win") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.font = '700 44px "SF Mono", "Menlo", monospace';
    ctx.fillText("YOU WON", WIDTH / 2, 238);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '700 20px "SF Mono", "Menlo", monospace';
    ctx.fillText("마지막 타이밍까지 맞췄다.", WIDTH / 2, 276);
    ctx.textAlign = "left";
  }

  if (game.state === "lose") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = COLORS.damage;
    ctx.textAlign = "center";
    ctx.font = '700 44px "SF Mono", "Menlo", monospace';
    ctx.fillText("YOU DIED", WIDTH / 2, 238);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '700 20px "SF Mono", "Menlo", monospace';
    ctx.fillText("패턴을 다시 외워서 버텨라.", WIDTH / 2, 276);
    ctx.textAlign = "left";
  }
}

function drawCommandOverlay() {
  if (game.command.open) {
    const x = 138;
    const y = 376;
    const w = 684;
    const h = 118;
    const cursor = Math.floor(performance.now() / 380) % 2 === 0 ? "_" : " ";

    ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(87, 210, 255, 0.58)";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = COLORS.blue;
    ctx.font = '700 14px "SF Mono", "Menlo", monospace';
    ctx.fillText("COMMAND", x + 18, y + 22);

    ctx.fillStyle = COLORS.text;
    ctx.font = '700 24px "SF Mono", "Menlo", monospace';
    ctx.fillText(`> ${game.command.buffer}${cursor}`, x + 18, y + 54);

    ctx.fillStyle = game.command.message ? COLORS.yellow : COLORS.muted;
    ctx.font = '700 15px "SF Mono", "Menlo", monospace';
    ctx.fillText(game.command.message || "명령어를 입력하고 Enter를 누르세요.", x + 18, y + 82);

    ctx.fillStyle = COLORS.muted;
    ctx.font = '700 14px "SF Mono", "Menlo", monospace';
    ctx.fillText(COMMAND_HINT, x + 18, y + 104);
    return;
  }

  if (game.command.timer <= 0 || !game.command.message) {
    return;
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.74)";
  ctx.fillRect(156, 26, 648, 34);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(156, 26, 648, 34);

  ctx.fillStyle = COLORS.text;
  ctx.font = '700 14px "SF Mono", "Menlo", monospace';
  ctx.fillText(game.command.message, 172, 48);
}

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();

  ctx.save();
  if (game.shake > 0) {
    ctx.translate(randomRange(-game.shake, game.shake), randomRange(-game.shake, game.shake));
  }

  drawSans();
  drawEnemyInfo();
  drawPlayerInfo();
  drawArena();
  drawMenu();
  drawDialogBox();
  drawAttackMeter();
  ctx.restore();

  drawOverlay();
  drawCommandOverlay();
}

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  update(dt);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

window.addEventListener("beforeunload", () => {
  soundtrack.dispose();
});
