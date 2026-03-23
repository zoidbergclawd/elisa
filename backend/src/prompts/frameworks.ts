/**
 * Framework-specific prompt context for builder agents.
 *
 * Each framework gets:
 * 1. Multi-file architecture rules (prevents concurrent agent file collisions)
 * 2. API patterns and anti-patterns
 * 3. MetaPlanner task planning guidance
 */

export type FrameworkId = 'phaser' | 'p5' | 'threejs';

export interface FrameworkPrompt {
  name: string;
  libPath: string;
  scriptTag: string;
  context: string;
}

// ---------------------------------------------------------------------------
// Shared preamble injected into all framework contexts
// ---------------------------------------------------------------------------

const MULTI_FILE_PREAMBLE = `
### CRITICAL: Multi-File Architecture
Multiple agents work in parallel. If two agents edit the same file, one overwrites
the other and the project breaks. Every feature MUST live in its own .js file.
The scaffold task creates ALL files with stubs. Feature tasks fill in stubs via Edit.
Shared constants go in src/config.js. NEVER put all code in one file.`;

// ---------------------------------------------------------------------------
// Phaser 3
// ---------------------------------------------------------------------------

const PHASER_CONTEXT = `## Framework: Phaser 3
The Phaser 3 game engine is bundled in your workspace.
${MULTI_FILE_PREAMBLE}

Required file structure:
\`\`\`
index.html              -- loads Phaser + all scene scripts, creates game
src/config.js           -- shared constants (colors, speeds, sizes, keys)
scenes/BootScene.js     -- preloads assets, shows loading bar
scenes/GameScene.js     -- core gameplay loop (player, enemies, physics)
scenes/UIScene.js       -- HUD overlay (score, lives, powerup indicators)
scenes/GameOverScene.js -- game over screen with restart
\`\`\`

index.html loads scenes via separate script tags:
\`\`\`html
<script src="lib/phaser.min.js"></script>
<script src="src/config.js"></script>
<script src="scenes/BootScene.js"></script>
<script src="scenes/GameScene.js"></script>
<script src="scenes/UIScene.js"></script>
<script src="scenes/GameOverScene.js"></script>
<script>
  new Phaser.Game({
    width: 800, height: 600,
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
    scene: [BootScene, GameScene, UIScene, GameOverScene],
    parent: 'game',
    backgroundColor: '#000000'
  });
</script>
\`\`\`

Each scene file defines a single class on the global scope:
\`\`\`js
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }
  create() { }
  update() { }
}
\`\`\`

### Key Patterns
- Preload assets ONLY in BootScene: \`this.load.image('key', 'path')\`
- Start scenes: \`this.scene.start('GameScene')\`
- Parallel UI: \`this.scene.launch('UIScene')\` runs alongside GameScene
- Cross-scene comms: \`this.scene.get('UIScene').updateScore(val)\`
  or events: \`this.events.emit('scoreChanged', val)\`
- Sprites: \`this.physics.add.sprite(x, y, 'key')\`
- Input: \`this.cursors = this.input.keyboard.createCursorKeys()\`
- Collision: \`this.physics.add.overlap(player, coins, collect, null, this)\`
- Text: \`this.add.text(x, y, 'Score: 0', { fontSize: '24px', fill: '#fff' })\`
- Built-in shapes (no images needed): \`this.add.rectangle()\`, \`this.add.circle()\`

### Anti-patterns
- NEVER put multiple scenes in one file
- NEVER put all game logic in one update() -- split across scenes
- Do NOT use raw canvas -- Phaser creates its own
- Do NOT load assets in create() -- use preload() in BootScene
- Do NOT define shared constants inside scene files -- use src/config.js`;

// ---------------------------------------------------------------------------
// p5.js
// ---------------------------------------------------------------------------

const P5_CONTEXT = `## Framework: p5.js
The p5.js creative coding library is bundled in your workspace.
${MULTI_FILE_PREAMBLE}

Required file structure:
\`\`\`
index.html              -- loads p5 + all module scripts
src/config.js           -- shared constants (colors, sizes, speeds)
src/sketch.js           -- setup() and draw() entry point, orchestrates modules
src/player.js           -- Player class (movement, input, rendering)
src/enemies.js          -- Enemy/obstacle classes (spawning, update, rendering)
src/particles.js        -- Particle system (effects, trails, explosions)
src/ui.js               -- UI drawing (score, menus, game over screen)
\`\`\`

index.html loads modules via separate script tags (order matters):
\`\`\`html
<script src="lib/p5.min.js"></script>
<script src="src/config.js"></script>
<script src="src/player.js"></script>
<script src="src/enemies.js"></script>
<script src="src/particles.js"></script>
<script src="src/ui.js"></script>
<script src="src/sketch.js"></script>
\`\`\`

Each module file defines classes/functions on the global scope:
\`\`\`js
// src/player.js
class Player {
  constructor(x, y) { this.x = x; this.y = y; }
  update() { /* movement logic */ }
  draw() { /* p5 drawing: fill(...); ellipse(this.x, this.y, 30); */ }
}
\`\`\`

sketch.js is the entry point -- it calls into module classes:
\`\`\`js
// src/sketch.js
let player, enemies, ui;
function setup() {
  createCanvas(800, 600);
  player = new Player(width/2, height - 50);
  enemies = new EnemyManager();
  ui = new GameUI();
}
function draw() {
  background(CONFIG.BG_COLOR);
  player.update();
  enemies.update();
  player.draw();
  enemies.draw();
  ui.draw();
}
\`\`\`

### Key Patterns
- Canvas: \`createCanvas(800, 600)\` in setup()
- Shapes: \`rect(x, y, w, h)\`, \`ellipse(x, y, w, h)\`, \`triangle()\`, \`bezier()\`
- Colors: \`fill(r, g, b)\`, \`stroke(r, g, b)\`, \`background(r, g, b)\`
- Animation: draw() loops at 60fps automatically
- Input: \`mouseX\`, \`mouseY\`, \`keyIsDown(LEFT_ARROW)\`, \`keyPressed()\`
- Text: \`textSize(24)\`, \`textAlign(CENTER)\`, \`text('Hello', x, y)\`
- Math: \`random()\`, \`noise()\`, \`map()\`, \`lerp()\`, \`sin()\`, \`cos()\`
- Transforms: \`translate()\`, \`rotate()\`, \`push()\`, \`pop()\`
- State machine: use a \`gameState\` variable ('menu', 'playing', 'gameover')
  and switch on it in draw()

### Anti-patterns
- NEVER put all code in sketch.js -- split classes into separate module files
- Do NOT use new p5() instance mode -- use global mode
- Do NOT call createCanvas outside setup()
- Do NOT use setInterval/requestAnimationFrame -- p5's draw() handles this
- Do NOT use raw DOM manipulation -- use p5 drawing functions`;

// ---------------------------------------------------------------------------
// Three.js
// ---------------------------------------------------------------------------

const THREEJS_CONTEXT = `## Framework: Three.js
The Three.js 3D engine is bundled as an ES module in your workspace.
${MULTI_FILE_PREAMBLE}

Required file structure:
\`\`\`
index.html              -- minimal HTML, loads main.js as module
src/config.js           -- shared constants (colors, sizes, speeds) as ES module
src/main.js             -- scene/camera/renderer setup, animation loop, imports modules
src/player.js           -- Player class (mesh, controls, update)
src/world.js            -- Environment (terrain, skybox, obstacles, lighting)
src/effects.js          -- Visual effects (particles, trails, post-processing)
src/ui.js               -- HTML overlay UI (score, menus) via DOM
\`\`\`

index.html is minimal:
\`\`\`html
<style>body { margin: 0; overflow: hidden; }</style>
<div id="ui-overlay"></div>
<script type="module" src="src/main.js"></script>
\`\`\`

Files use ES module imports:
\`\`\`js
// src/main.js
import * as THREE from '../lib/three.min.js';
import { CONFIG } from './config.js';
import { Player } from './player.js';
import { World } from './world.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const world = new World(scene);
const player = new Player(scene);

function animate() {
  requestAnimationFrame(animate);
  player.update();
  world.update();
  renderer.render(scene, camera);
}
animate();
\`\`\`

Each module exports a class:
\`\`\`js
// src/player.js
import * as THREE from '../lib/three.min.js';
export class Player {
  constructor(scene) {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x4488ff })
    );
    scene.add(this.mesh);
  }
  update() { /* movement logic */ }
}
\`\`\`

### Key Patterns
- Scene: \`new THREE.Scene()\`, Camera: \`new THREE.PerspectiveCamera()\`
- Renderer: \`new THREE.WebGLRenderer({ antialias: true })\`
- Geometry: \`BoxGeometry\`, \`SphereGeometry\`, \`PlaneGeometry\`, \`CylinderGeometry\`
- Material: \`MeshStandardMaterial\` (lit), \`MeshBasicMaterial\` (unlit)
- Mesh: \`new THREE.Mesh(geometry, material)\`, add to scene
- Lighting: \`DirectionalLight\`, \`AmbientLight\`, \`PointLight\`
- Groups: \`new THREE.Group()\` to compose objects
- Input: standard DOM events on window
- Resize: \`window.addEventListener('resize', () => { ... })\`

### Anti-patterns
- NEVER put all code in main.js -- split into module files
- Do NOT forget lights -- MeshStandardMaterial renders black without them
- Do NOT forget renderer.setSize()
- Do NOT use non-module script tags -- Three.js requires ES module imports
- Do NOT import Three.js in every file redundantly if avoidable --
  pass the scene/THREE reference via constructor params when practical`;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const FRAMEWORK_PROMPTS: Record<FrameworkId, FrameworkPrompt> = {
  phaser: {
    name: 'Phaser 3',
    libPath: 'lib/phaser.min.js',
    scriptTag: '<script src="lib/phaser.min.js"></script>',
    context: PHASER_CONTEXT,
  },
  p5: {
    name: 'p5.js',
    libPath: 'lib/p5.min.js',
    scriptTag: '<script src="lib/p5.min.js"></script>',
    context: P5_CONTEXT,
  },
  threejs: {
    name: 'Three.js',
    libPath: 'lib/three.min.js',
    scriptTag: '<script type="module">import * as THREE from \'./lib/three.min.js\';</script>',
    context: THREEJS_CONTEXT,
  },
};

/** Get framework prompt context for a builder agent. Returns null if framework is not recognized. */
export function getFrameworkPrompt(frameworkId: string): FrameworkPrompt | null {
  return FRAMEWORK_PROMPTS[frameworkId as FrameworkId] ?? null;
}

// ---------------------------------------------------------------------------
// MetaPlanner section
// ---------------------------------------------------------------------------

/** Get the MetaPlanner framework selection section. */
export const META_PLANNER_FRAMEWORK_SECTION = `

## Framework Selection

The kid's project may benefit from a game or graphics framework. If the spec includes
a \`framework\` field, use that value. If not specified (or null), select the most
appropriate one based on the project goal:

- **phaser**: 2D games with sprites, physics, levels, platformers, shooters, puzzle games, RPGs
- **p5**: Creative coding, generative art, visual experiments, data visualization, educational simulations, simple 2D games
- **threejs**: 3D games, 3D scenes, 3D visualizations, virtual worlds
- **none**: Simple apps with no heavy graphics (forms, dashboards, text-based tools, calculators)

Include your selection in the output JSON as \`"framework": "phaser"\` (or p5, threejs, none).

When a framework is selected (not "none"), the library file will be pre-loaded into the
workspace at lib/. Agents should use it instead of writing raw canvas code.

IMPORTANT: For ANY project involving games, animations, interactive graphics, or visual effects,
you MUST select a framework. Do NOT default to "none" for visual projects.

## Multi-File Task Planning (ALL frameworks)

When ANY framework is selected, you MUST plan tasks so that **no two concurrent tasks
edit the same file**. Multiple agents run in parallel. If two agents edit the same file,
one overwrites the other and the project breaks.

Universal rules:
- Keep total tasks to **5-8** (fewer tasks = fewer conflicts = working games)
- Task 1 is ALWAYS a **scaffold** that creates ALL files with stub classes/functions
- Each subsequent task fills in ONE module file via Edit (never Write from scratch)
- Shared constants (colors, speeds, sizes) go in **src/config.js** (created by scaffold)
- NEVER assign two concurrent tasks to edit the same file
- Set each agent's \`allowed_paths\` to the specific files they own
- Test and review tasks come last (after all feature tasks complete)

### Phaser: split by scene
\`\`\`
scenes/BootScene.js     -- scaffold task
scenes/GameScene.js     -- core gameplay task
scenes/UIScene.js       -- UI/HUD task
scenes/GameOverScene.js -- game over task
\`\`\`
- Each scene is a separate Phaser.Scene class in its own file
- UIScene runs in parallel via \`this.scene.launch('UIScene')\`
- Cross-scene communication via \`this.scene.get()\` or events

### p5.js: split by module
\`\`\`
src/sketch.js     -- scaffold creates setup()/draw() orchestrator
src/player.js     -- player task
src/enemies.js    -- enemies task
src/particles.js  -- effects task (if needed)
src/ui.js         -- UI task (menus, score, game over)
\`\`\`
- sketch.js is the entry point; it instantiates and calls module classes
- Each module defines classes on the global scope (loaded via script tags)
- State machine in sketch.js: \`gameState\` variable ('menu', 'playing', 'gameover')
- sketch.js is created by scaffold and should NOT be heavily edited by later tasks

### Three.js: split by component
\`\`\`
src/main.js     -- scaffold creates scene/camera/renderer/loop
src/player.js   -- player task
src/world.js    -- environment task
src/effects.js  -- effects task (if needed)
src/ui.js       -- UI overlay task (HTML DOM elements)
\`\`\`
- Uses ES module imports (import/export)
- main.js imports and orchestrates all components
- Each component exports a class that receives the scene in its constructor
- main.js is created by scaffold and should NOT be heavily edited by later tasks`;
