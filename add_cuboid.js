/*
 * Add Cuboid (X/Y/Z) for Blockbench 5.2+
 *
 * Adds "Add Cuboid..." to the outliner's + Add Element menu (and its right-click menu). The dialog takes a
 * width, height and depth, plus a position, and builds a Mesh box exactly that size. Vertex and face
 * order copy Blockbench's own Add Mesh ▸ Cuboid (src/js/modeling/mesh/add_mesh.ts), only stretched per
 * axis, so the faces keep the same outward winding and normals.
 *
 * cuboidGeometry(), parseTyped() and normalizeTyped() have no Blockbench dependencies, for Node tests.
 */
(function () {
	'use strict';

	const PLUGIN_ID = 'add_cuboid';
	const STORE_KEY = 'add_cuboid.last';
	const MIN_SIZE = 0.01;
	const DEFAULTS = { name: 'cuboid', width: 2, height: 2, depth: 2, anchor: 'bottom' };

	/**
	 * Corner positions relative to the origin, and faces as indices into them.
	 * anchor 'bottom' = origin at the bottom centre (y 0..h), 'center' = origin at the middle.
	 */
	function cuboidGeometry(width, height, depth, anchor) {
		const x = width / 2, z = depth / 2;
		const y0 = anchor === 'center' ? -height / 2 : 0;
		const y1 = y0 + height;
		// Same order as Blockbench's cuboid: [r,h,r], [r,h,-r], [r,0,r], [r,0,-r], [-r,h,r], [-r,h,-r], [-r,0,r], [-r,0,-r]
		const vertices = [
			[x, y1, z], [x, y1, -z], [x, y0, z], [x, y0, -z],
			[-x, y1, z], [-x, y1, -z], [-x, y0, z], [-x, y0, -z],
		];
		const faces = {
			east:  [0, 2, 1, 3],
			west:  [4, 5, 6, 7],
			up:    [0, 1, 4, 5],
			down:  [2, 6, 3, 7],
			south: [0, 4, 2, 6],
			north: [1, 3, 5, 7],
		};
		return { vertices, faces };
	}

	/**
	 * Parse a typed number ourselves: accepts "0.6", ".6" and "0,6". Blockbench's field runs text through
	 * its Molang parser, which turns a decimal comma (and some other typing) into 0.
	 */
	function parseTyped(text) {
		if (text == null) return NaN;
		const t = String(text).trim().replace(',', '.');
		return t === '' ? NaN : Number(t);
	}
	/** Rewrite "0,6" to "0.6" and ".6" to "0.6" while typing, before Blockbench parses the field. */
	function normalizeTyped(text) {
		let t = String(text).replace(',', '.');
		if (/^-?\./.test(t)) t = t.replace('.', '0.');
		return t;
	}

	const core = { cuboidGeometry, parseTyped, normalizeTyped, DEFAULTS, MIN_SIZE };

	// Outside Blockbench (Node tests) export the core and stop here.
	if (typeof Plugin === 'undefined' || typeof BARS === 'undefined') {
		if (typeof module === 'object' && module && module.exports) module.exports = core;
		return;
	}

	// ================================================================ Blockbench layer

	function loadLast() {
		try {
			const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
			return Object.assign({}, DEFAULTS, saved);
		} catch (err) {
			return Object.assign({}, DEFAULTS);
		}
	}
	function saveLast(r) {
		try {
			localStorage.setItem(STORE_KEY, JSON.stringify({
				name: r.name, width: r.width, height: r.height, depth: r.depth, anchor: r.anchor,
			}));
		} catch (err) { /* storage blocked: just don't remember */ }
	}

	function readRaw(id, fallback) {
		try {
			const el = dialog && dialog.object && dialog.object.querySelector('input#' + id);
			const v = el ? parseTyped(el.value) : NaN;
			return isFinite(v) ? v : fallback;
		} catch (err) { return fallback; }
	}
	function watchInputs(root) {
		if (!root || root._addCuboidWatch) return;
		root._addCuboidWatch = true;
		// Capture phase: runs before Blockbench's own listeners on the input.
		root.addEventListener('input', e => {
			const el = e.target;
			if (!el || el.tagName !== 'INPUT' || el.id === 'name') return;
			const fixed = normalizeTyped(el.value);
			if (fixed !== el.value) {
				const caret = el.selectionStart + (fixed.length - el.value.length);
				el.value = fixed;
				try { el.setSelectionRange(caret, caret); } catch (err) { /* not a text input */ }
			}
		}, true);
	}
	function readResult(result) {
		const r = Object.assign({}, result);
		for (const k of ['width', 'height', 'depth']) r[k] = Math.max(MIN_SIZE, readRaw(k, Number(result[k]) || 0));
		const pos = result.position || [0, 0, 0];
		r.position = [0, 1, 2].map(i => readRaw('position_' + i, Number(pos[i]) || 0));
		return r;
	}

	function addCuboid(r) {
		const width = Math.abs(r.width), height = Math.abs(r.height), depth = Math.abs(r.depth);
		const pos = (r.position || [0, 0, 0]).map(v => v || 0);
		const parent = (typeof getCurrentGroup === 'function' ? getCurrentGroup() : Group.first_selected)
			?? (typeof Armature !== 'undefined' ? Armature.selected[0] : undefined);

		const elements = [];
		Undo.initEdit({ elements, selection: true, outliner: true });

		const mesh = new Mesh({
			name: r.name || DEFAULTS.name,
			vertices: {},
			origin: pos,
			color: Math.floor(Math.random() * markerColors.length),
		});
		if (parent) {
			mesh.addTo(parent);
			if (settings.inherit_parent_color && settings.inherit_parent_color.value && 'color' in parent) {
				mesh.color = parent.color;
			}
		}

		const geo = cuboidGeometry(width, height, depth, r.anchor);
		const keys = mesh.addVertices(...geo.vertices);
		const faceObjects = Object.values(geo.faces).map(idx =>
			new MeshFace(mesh, { vertices: idx.map(i => keys[i]) }));
		mesh.addFaces(...faceObjects);

		if (Texture.all.length && Format.single_texture) {
			for (const fkey in mesh.faces) mesh.faces[fkey].texture = Texture.getDefault().uuid;
			UVEditor.loadData();
		}

		elements.push(mesh);
		mesh.init();
		unselectAllElements();
		mesh.select();
		UVEditor.setAutoSize(null, true, Object.keys(mesh.faces));
		Undo.finishEdit('Add cuboid');
		Blockbench.dispatchEvent('add_mesh', { object: mesh });
		return mesh;
	}

	let dialog = null;
	let action = null;

	Plugin.register(PLUGIN_ID, {
		title: 'Add Cuboid (X/Y/Z)',
		author: 'yarrbeard-gyps',
		description: 'Add a mesh box with an exact width, height and depth.',
		icon: 'view_in_ar',
		version: '1.0.1',
		variant: 'both',
		min_version: '5.2.0',
		tags: ['Modeling', 'Mesh'],
		onload() {
			dialog = new Dialog({
				id: 'add_cuboid_dialog',
				title: 'Add Cuboid',
				width: 400,
				form: {
					name:     { label: 'Name', type: 'text', value: DEFAULTS.name },
					width:    { label: 'Width (X)', type: 'number', value: DEFAULTS.width, min: MIN_SIZE, step: 0.05 },
					height:   { label: 'Height (Y)', type: 'number', value: DEFAULTS.height, min: MIN_SIZE, step: 0.05 },
					depth:    { label: 'Depth (Z)', type: 'number', value: DEFAULTS.depth, min: MIN_SIZE, step: 0.05 },
					position: { label: 'Position', type: 'vector', dimensions: 3, value: [0, 0, 0], step: 0.05 },
					anchor:   { label: 'Origin at', type: 'inline_select', value: DEFAULTS.anchor,
						options: { bottom: 'Bottom centre', center: 'Centre' } },
				},
				onConfirm(formResult) {
					const result = readResult(formResult);
					saveLast(result);
					const mesh = addCuboid(result);
					if (settings.create_rename && settings.create_rename.value) {
						Vue.nextTick(() => mesh.rename());
					}
				},
			});

			action = new Action('add_cuboid', {
				name: 'Add Cuboid...',
				description: 'Add a mesh box with an exact width, height and depth',
				icon: 'view_in_ar',
				category: 'edit',
				condition: { modes: ['edit'], method: () => Format && Format.meshes },
				click() {
					dialog.show();
					watchInputs(dialog.object);
					const last = loadLast();
					dialog.setFormValues({
						name: last.name, width: last.width, height: last.height, depth: last.depth,
						anchor: last.anchor, position: [0, 0, 0],
					}, false);
				},
			});

			// + Add Element menu (also used by the outliner's right-click menu), right after Add Mesh.
			const sideMenu = BarItems.add_element && BarItems.add_element.side_menu;
			if (sideMenu && Array.isArray(sideMenu.structure)) {
				const at = sideMenu.structure.indexOf('add_mesh');
				sideMenu.addAction(action, at >= 0 ? at + 1 : 0);
			} else {
				MenuBar.addAction(action, 'edit');
			}
		},
		onunload() {
			if (action) {
				const sideMenu = BarItems.add_element && BarItems.add_element.side_menu;
				if (sideMenu && Array.isArray(sideMenu.structure)) sideMenu.structure.remove(action);
				action.delete();
			}
			if (dialog) dialog.delete();
			action = dialog = null;
		},
	});
})();
