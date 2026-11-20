# Add Cuboid (X/Y/Z) for Blockbench

A Blockbench 5.2+ plugin that adds a **mesh box of an exact width, height and depth**. Blockbench's own
**Add Mesh ▸ Cuboid** only asks for a diameter and a height, so it is always square from above. Mesh boxes stay
fully editable, unlike Cube elements.

## Install
In Blockbench: **File ▸ Plugins ▸ Load Plugin from File**, then pick [`add_cuboid.js`](add_cuboid.js) (optionally keep `about.md` next to it).

## Use
Edit mode, outliner **+ (Add Element) ▸ Add Cuboid...** (right under Add Mesh). It's also in the outliner's
right-click menu under Add Element.

| Field | Meaning |
|---|---|
| Name | The new mesh's name |
| Width (X), Height (Y), Depth (Z) | Exact size, in Blockbench units |
| Position | Where the origin goes (model space). Resets to 0 each time |
| Origin at | **Bottom centre** (sits on the position) or **Centre** |

Decimals work in every number box: `0.6`, `.6` and `0,6` all mean 0.6. Sizes start at 2 / 2 / 2, and the
smallest size is 0.01.

The box goes into the selected group or bone, if one is selected, and ends up selected. One Ctrl+Z removes it.
The name, sizes and origin choice are remembered for next time.

## How it's built
Same 8 vertices and 6 quad faces, in the same order, as Blockbench's own cuboid in `add_mesh.ts`, just
stretched per axis, so the normals and winding match. UVs are set the way Add Mesh sets them
(`UVEditor.setAutoSize`), so **Create Texture ▸ Texture Template** works on it.

## Tested
In Blockbench 5.2.2: loads, and the dialog builds mesh boxes (used on a real model). The 1.0.1 decimal fix is
covered by the offline tests below.

Offline:
`node tests/verify_add_cuboid.js`: compares the geometry with Blockbench's cuboid, checks the sizes and origin
choices, and runs the plugin against a mock of Blockbench (menu placement, undo, selection, remembered values,
unload).

## Credits
Written with the help of an AI coding assistant (Claude). Issues and pull requests are welcome.

## License
[MIT](LICENSE)
