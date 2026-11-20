// Offline checks for add_cuboid.js. Run: node tests/verify_add_cuboid.js
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const FILE = path.resolve(__dirname, '..', 'add_cuboid.js');
let pass = 0;
const ok = (cond, msg) => { assert(cond, msg); pass++; console.log('ok  ' + msg); };

// ---- 1. Geometry matches Blockbench's own Add Mesh ▸ Cuboid (add_mesh.ts), only stretched.
const { cuboidGeometry, normalizeTyped, parseTyped } = require(FILE);
function bbCuboid(diameter, h) { // copied from Blockbench 5.2.2 add_mesh.ts
	const r = diameter / 2;
	return {
		vertices: [[r, h, r], [r, h, -r], [r, 0, r], [r, 0, -r], [-r, h, r], [-r, h, -r], [-r, 0, r], [-r, 0, -r]],
		faces: [[0, 2, 1, 3], [4, 5, 6, 7], [0, 1, 4, 5], [2, 6, 3, 7], [0, 4, 2, 6], [1, 3, 5, 7]],
	};
}
const ref = bbCuboid(4, 3), mine = cuboidGeometry(4, 3, 4, 'bottom');
ok(JSON.stringify(ref.vertices) === JSON.stringify(mine.vertices), 'square cuboid has the same vertices as Blockbench');
ok(JSON.stringify(ref.faces) === JSON.stringify(Object.values(mine.faces)), 'faces use the same vertex order as Blockbench');

// Each face: its 4 corners lie on one side of the box, and the faces cover all six sides once.
function sideOf(geo, idx) {
	const vs = idx.map(i => geo.vertices[i]);
	for (let a = 0; a < 3; a++) if (vs.every(v => v[a] === vs[0][a])) return 'xyz'[a] + (vs[0][a] > 0 ? '+' : '-');
	return null;
}
const g = cuboidGeometry(1.2, 0.5, 6, 'center');
const sides = Object.values(g.faces).map(f => sideOf(g, f)).sort();
ok(JSON.stringify(sides) === JSON.stringify(['x+', 'x-', 'y+', 'y-', 'z+', 'z-']), 'six faces, one per side');
const span = a => Math.max(...g.vertices.map(v => v[a])) - Math.min(...g.vertices.map(v => v[a]));
ok(Math.abs(span(0) - 1.2) < 1e-9 && Math.abs(span(1) - 0.5) < 1e-9 && Math.abs(span(2) - 6) < 1e-9, 'size 1.2 x 0.5 x 6');
ok(Math.min(...g.vertices.map(v => v[1])) === -0.25, 'centre anchor puts the middle at the origin');
ok(Math.min(...cuboidGeometry(1, 2, 1, 'bottom').vertices.map(v => v[1])) === 0, 'bottom anchor puts the base at the origin');

// ---- 1b. Decimal typing
ok(normalizeTyped('0,6') === '0.6' && normalizeTyped('.6') === '0.6' && normalizeTyped('-.5') === '-0.5' && normalizeTyped('1.25') === '1.25', 'comma and leading-dot decimals normalised');
ok(parseTyped('0,6') === 0.6 && parseTyped(' 0.05 ') === 0.05 && isNaN(parseTyped('')), 'typed decimals parse exactly');

// ---- 2. Plugin layer against a mock of Blockbench.
const calls = [];
const inputs = {}; let captureInput = null;
const dom = {
	addEventListener: (type, fn, capture) => { if (type === 'input' && capture) captureInput = fn; },
	querySelector: sel => inputs[sel.replace('input#', '')] || null,
};
function typeInto(id, text) { // simulate typing: our capture listener runs first
	const el = inputs[id] || (inputs[id] = { tagName: 'INPUT', id, value: '', selectionStart: 0, setSelectionRange() {} });
	el.value = text; el.selectionStart = text.length;
	captureInput({ target: el });
	return el.value;
}
const store = {};
let registered, action, dialog, sideMenu = ['add_mesh', 'add_cube'];
const g1 = { uuid: 'g1', color: 3, children: [] };
class Mesh {
	constructor(o) { Object.assign(this, { vertices: {}, faces: {} }, o); this._n = 0; }
	addTo(p) { this.parent = p; p.children.push(this); }
	addVertices(...vs) { return vs.map(v => { const k = 'v' + this._n++; this.vertices[k] = v; return k; }); }
	addFaces(...fs) { fs.forEach((f, i) => { this.faces['f' + Object.keys(this.faces).length] = f; }); }
	init() { calls.push('init'); } select() { calls.push('select'); } rename() {}
}
class MeshFace { constructor(m, o) { Object.assign(this, o); } }
const ctx = {
	Plugin: { register: (id, o) => { registered = { id, o }; } },
	BARS: {}, Format: { meshes: true, single_texture: false }, Texture: { all: [] },
	Mesh, MeshFace, markerColors: [1, 2, 3, 4],
	Group: { first_selected: g1 }, getCurrentGroup: () => g1, Armature: { selected: [] },
	settings: { inherit_parent_color: { value: false }, create_rename: { value: false } },
	Undo: { initEdit: (o) => calls.push('initEdit'), finishEdit: (n) => calls.push('finishEdit:' + n) },
	UVEditor: { setAutoSize: (a, b, faces) => calls.push('autosize:' + faces.length), loadData() {} },
	unselectAllElements: () => calls.push('unselect'),
	Blockbench: { dispatchEvent: (n) => calls.push('event:' + n) },
	Vue: { nextTick: f => f() },
	localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
	Dialog: class { constructor(o) { dialog = this; this.o = o; this.values = {}; this.object = dom; } show() {} setFormValues(v) { this.values = v; } delete() { calls.push('dialog.delete'); } },
	Action: class { constructor(id, o) { action = this; this.id = id; Object.assign(this, o); } delete() { calls.push('action.delete'); } },
	BarItems: { add_element: { side_menu: { structure: sideMenu, addAction(a, i) { sideMenu.splice(i, 0, a); } } } },
	MenuBar: { addAction() {} },
};
Array.prototype.remove = function (x) { const i = this.indexOf(x); if (i >= 0) this.splice(i, 1); };
new Function(...Object.keys(ctx), fs.readFileSync(FILE, 'utf8'))(...Object.values(ctx));
registered.o.onload();
ok(registered.id === 'add_cuboid', 'registers as add_cuboid');
ok(sideMenu[1] === action, 'action sits right after Add Mesh in + Add Element');

action.click();
ok(dialog.values.width === 2 && dialog.values.height === 2 && dialog.values.depth === 2 && dialog.values.anchor === 'bottom', 'first open shows 2/2/2 defaults');
ok(typeInto('height', '0,6') === '0.6' && typeInto('width', '.6') === '0.6', 'typing a comma or leading dot becomes a normal decimal');
typeInto('name', 'a,b');
ok(inputs.name.value === 'a,b', 'the Name field is left alone');
// Blockbench's form returns 0 for the height (as the user saw); the typed text must win.
dialog.o.onConfirm({ name: 'peg', width: 0, height: 0, depth: 0.25, position: [0, 0, 0], anchor: 'center' });
const peg = g1.children[0];
const ys = Object.values(peg.vertices).map(v => v[1]), xs = Object.values(peg.vertices).map(v => v[0]);
ok(Math.abs(Math.max(...ys) - Math.min(...ys) - 0.6) < 1e-9 && Math.abs(Math.max(...xs) - Math.min(...xs) - 0.6) < 1e-9, 'typed 0,6 and .6 give a 0.6 size');
typeInto('position_1', '-1,5');
dialog.o.onConfirm({ name: 'tiny', width: 0, height: 0, depth: 0, position: [0, 0, 0], anchor: 'center' });
const tiny = g1.children[1];
ok(tiny.origin[1] === -1.5, 'typed position decimals kept');
for (const k in inputs) delete inputs[k];
g1.children.length = 0; calls.length = 0;
dialog.o.onConfirm({ name: 'flat', width: 1, height: 0, depth: 1, position: [0, 0, 0], anchor: 'bottom' });
ok(Math.max(...Object.values(g1.children[0].vertices).map(v => v[1])) === 0.01, 'zero size is raised to the 0.01 minimum');
g1.children.length = 0; calls.length = 0;
action.click();
dialog.o.onConfirm({ name: 'blade', width: 1.2, height: 0.5, depth: 6, position: [1, 2, 3], anchor: 'bottom' });
const mesh = g1.children[0];
ok(mesh.name === 'blade', 'blade added');
ok(mesh instanceof Mesh && mesh.name === 'blade', 'mesh created and named');
ok(JSON.stringify(mesh.origin) === '[1,2,3]', 'origin set to the position');
ok(Object.keys(mesh.vertices).length === 8 && Object.keys(mesh.faces).length === 6, '8 vertices, 6 faces');
ok(Object.values(mesh.faces).every(f => f.vertices.length === 4), 'all faces are quads');
ok(calls.join() === 'initEdit,init,unselect,select,autosize:6,finishEdit:Add cuboid,event:add_mesh', 'undo, select and UV order match Add Mesh');
action.click();
ok(dialog.values.width === 1.2 && dialog.values.depth === 6 && dialog.values.name === 'blade', 'last sizes remembered');
ok(JSON.stringify(dialog.values.position) === '[0,0,0]', 'position resets to 0');
registered.o.onunload();
ok(!sideMenu.includes(action) && calls.includes('action.delete') && calls.includes('dialog.delete'), 'unload removes the action and dialog');
console.log(`\n${pass} checks passed`);
