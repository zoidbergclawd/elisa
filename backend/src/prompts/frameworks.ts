/**
 * Framework-specific prompt context for builder agents.
 *
 * Each framework gets patterns and anti-patterns that guide agents
 * to produce high-quality output using the bundled library.
 */

export type FrameworkId = 'phaser' | 'p5' | 'threejs';

export interface FrameworkPrompt {
  name: string;
  libPath: string;
  scriptTag: string;
  context: string;
}

const PHASER_CONTEXT = `## Framework: Phaser 3
The Phaser 3 game engine is bundled in your workspace.

Include it in your HTML:
\`\`\`html
<script src="lib/phaser.min.js"></script>
\`\`\`

### Key Patterns
- Game config: \`new Phaser.Game({ width: 800, height: 600, scene: [BootScene, PlayScene], physics: { default: 'arcade' } })\`
- Separate scenes into Boot (preload assets) and Play (game logic)
- Preload: \`this.load.image('key', 'path')\` in \`preload()\`
- Sprites: \`this.physics.add.sprite(x, y, 'key')\` in \`create()\`
- Input: \`this.cursors = this.input.keyboard.createCursorKeys()\`
- Collision: \`this.physics.add.overlap(player, coins, collectCoin, null, this)\`
- Text: \`this.add.text(x, y, 'Score: 0', { fontSize: '24px', fill: '#fff' })\`
- Game loop: put movement/logic in \`update()\`

### Structure
- Put everything in a single HTML file with inline \`<script>\`
- Define scene classes before \`new Phaser.Game()\`
- Use Phaser's built-in graphics for shapes (no need for separate image files)
  - \`this.add.rectangle(x, y, w, h, 0xff0000)\` for colored rectangles
  - \`this.add.circle(x, y, r, 0x00ff00)\` for circles
  - Use \`Phaser.GameObjects.Graphics\` for complex shapes

### Anti-patterns
- Do NOT use raw canvas when Phaser is available
- Do NOT put all game logic in a single \`update()\` -- use scene transitions for menus/gameover
- Do NOT load assets in \`create()\` -- always use \`preload()\`
- Do NOT use \`document.createElement('canvas')\` -- Phaser creates its own canvas`;

const P5_CONTEXT = `## Framework: p5.js
The p5.js creative coding library is bundled in your workspace.

Include it in your HTML:
\`\`\`html
<script src="lib/p5.min.js"></script>
\`\`\`

### Key Patterns
- Define \`setup()\` and \`draw()\` functions globally
- Canvas: \`createCanvas(800, 600)\` in \`setup()\`
- Shapes: \`rect(x, y, w, h)\`, \`ellipse(x, y, w, h)\`, \`line(x1, y1, x2, y2)\`
- Colors: \`fill(r, g, b)\`, \`stroke(r, g, b)\`, \`background(r, g, b)\`
- Animation: \`draw()\` loops at 60fps automatically
- Input: \`mouseX\`, \`mouseY\`, \`keyPressed()\`, \`mousePressed()\`
- Text: \`textSize(24)\`, \`text('Hello', x, y)\`
- Math: \`random()\`, \`noise()\`, \`map()\`, \`sin()\`, \`cos()\`
- Transforms: \`translate()\`, \`rotate()\`, \`push()\`, \`pop()\`

### Structure
- Put everything in a single HTML file with inline \`<script>\`
- p5 runs in global mode by default -- just define \`setup()\` and \`draw()\`
- Use \`frameCount\` for animations, \`millis()\` for timing
- For interactive art: track state in global variables, update in \`draw()\`

### Anti-patterns
- Do NOT use \`new p5()\` instance mode unless explicitly needed -- use global mode
- Do NOT call \`createCanvas\` outside of \`setup()\`
- Do NOT use raw DOM manipulation -- use p5's built-in drawing functions
- Do NOT use \`setInterval\` or \`requestAnimationFrame\` -- p5's \`draw()\` loop handles this`;

const THREEJS_CONTEXT = `## Framework: Three.js
The Three.js 3D engine is bundled in your workspace as an ES module.

Include it in your HTML:
\`\`\`html
<script type="module">
import * as THREE from './lib/three.min.js';
// your code here
</script>
\`\`\`

### Key Patterns
- Scene setup: \`const scene = new THREE.Scene()\`, \`const camera = new THREE.PerspectiveCamera(75, w/h, 0.1, 1000)\`
- Renderer: \`const renderer = new THREE.WebGLRenderer({ antialias: true })\`, append \`renderer.domElement\` to document
- Geometry: \`new THREE.BoxGeometry(1,1,1)\`, \`new THREE.SphereGeometry(0.5)\`
- Material: \`new THREE.MeshStandardMaterial({ color: 0xff0000 })\`, \`MeshBasicMaterial\` for unlit
- Mesh: \`const cube = new THREE.Mesh(geometry, material)\`, \`scene.add(cube)\`
- Lighting: \`new THREE.DirectionalLight(0xffffff, 1)\`, \`new THREE.AmbientLight(0x404040)\`
- Animation: \`function animate() { requestAnimationFrame(animate); renderer.render(scene, camera); }\`
- Input: standard DOM events (\`addEventListener\`)

### Structure
- Single HTML file with \`<script type="module">\`
- Import Three.js as ES module from lib/
- Set up scene, camera, renderer in init function
- Use requestAnimationFrame loop for animation

### Anti-patterns
- Do NOT use \`<script src="...">\` -- Three.js is an ES module, use \`import\`
- Do NOT forget to add lights -- MeshStandardMaterial is black without them
- Do NOT forget \`renderer.setSize(window.innerWidth, window.innerHeight)\`
- Do NOT forget to call \`renderer.render(scene, camera)\` in the animation loop`;

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

/** Get the MetaPlanner framework selection section. */
export const META_PLANNER_FRAMEWORK_SECTION = `

## Framework Selection

The kid's project may benefit from a game or graphics framework. If the spec includes
a \`framework\` field, use that value. If not specified (or null), select the most
appropriate one based on the project goal:

- **phaser**: 2D games with sprites, physics, levels, platformers, shooters, puzzle games, RPGs
- **p5**: Creative coding, generative art, visual experiments, data visualization, educational simulations
- **threejs**: 3D games, 3D scenes, 3D visualizations, virtual worlds
- **none**: Simple apps with no heavy graphics (forms, dashboards, text-based tools, calculators)

Include your selection in the output JSON as \`"framework": "phaser"\` (or p5, threejs, none).

When a framework is selected (not "none"), the library file will be pre-loaded into the
workspace at lib/. Agents should use it instead of writing raw canvas code.

IMPORTANT: For ANY project involving games, animations, interactive graphics, or visual effects,
you MUST select a framework. Do NOT default to "none" for visual projects.`;
