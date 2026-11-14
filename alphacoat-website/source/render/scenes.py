"""Renders the three scenes used by the color explorer, plus the before/after pair.

  blender --background --factory-startup --python scenes.py -- <scene> <mode> <work-folder> <site-img-folder>

  scene   steel | gate | wall | tank | machine | building
  mode    test     quick look at the base picture only
          full     the three layers the website stacks: base (paint in white), mask (where the paint is), gloss (highlights only)
          compare  steel only: bare rusty steel and the same frame in gloss green

The website colors the paint by multiplying a flat color over the white base inside the mask, then
fades the gloss layer in and out for the finish slider. So the paint here must stay neutral white.
"""
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as c  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SCENE = argv[0] if argv else "steel"
MODE = argv[1] if len(argv) > 1 else "test"
WORK = argv[2] if len(argv) > 2 else os.path.join(HERE, "out")
SITE = argv[3] if len(argv) > 3 else os.path.join(HERE, "out")
os.makedirs(WORK, exist_ok=True)
os.makedirs(SITE, exist_ok=True)

SUN_WARM = (1.0, 0.95, 0.87)   # low afternoon sun
SKY_COOL = (0.84, 0.91, 1.0)   # open sky filling the shadows

# Plastered walls are never perfectly flat. scale is in metres of object space, strength is the bump height.
PAINT_BUMP = {"wall": (1.7, 0.05), "building": (1.7, 0.05)}

# How the gloss layer is made for each scene. Beams and bars look right with a crisp, mirror-like shine.
# A big flat wall does not: a crisp reflection puts the floor's horizon across it as a hard line, and the wall's
# unevenness turns that line ragged. So the wall gets a soft shine, no unevenness in the gloss layer, and it
# reflects the real room (lit floor included) instead of a blacked-out one.
GLOSS = {
    "wall": {"roughness": 0.32, "coat_roughness": 0.3, "specular": 0.4, "bump": False, "reflect_room": True},
    "building": {"roughness": 0.32, "coat_roughness": 0.3, "specular": 0.4, "bump": False, "reflect_room": True},
    "tank": {"roughness": 0.16, "coat_roughness": 0.12, "reflect_room": True},
    "machine": {"roughness": 0.12, "coat_roughness": 0.06, "reflect_room": True},
}


# ---------- materials ----------

def concrete(name, grey, scale=1.2, rough=0.9, bump=0.1, contrast=0.08, tint=(1.0, 0.99, 0.96)):
    """Cast concrete: a slow tonal drift with fine grain, faint weather streaks, and a rough surface."""
    mat, nt, bsdf = c.new_material(name)
    coord = nt.nodes.new("ShaderNodeTexCoord")

    broad = nt.nodes.new("ShaderNodeTexNoise")
    broad.inputs["Scale"].default_value = scale
    broad.inputs["Detail"].default_value = 13.0
    broad.inputs["Roughness"].default_value = 0.8

    stretch = nt.nodes.new("ShaderNodeMapping")
    stretch.inputs["Scale"].default_value = (4.0, 4.0, 0.3)   # squeezed across, long down the wall
    streak = nt.nodes.new("ShaderNodeTexNoise")
    streak.inputs["Scale"].default_value = 1.0
    streak.inputs["Detail"].default_value = 5.0

    weight = nt.nodes.new("ShaderNodeMath")
    weight.operation = "MULTIPLY"
    weight.inputs[1].default_value = 0.3
    blend = nt.nodes.new("ShaderNodeMath")
    blend.operation = "MULTIPLY_ADD"
    blend.inputs[1].default_value = 0.7

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    lo, hi = grey * (1.0 - contrast), grey * (1.0 + contrast * 0.8)
    ramp.color_ramp.elements[0].position = 0.34
    ramp.color_ramp.elements[0].color = (lo * tint[0], lo * tint[1], lo * tint[2], 1.0)
    ramp.color_ramp.elements[1].position = 0.66
    ramp.color_ramp.elements[1].color = (hi * tint[0], hi * tint[1], hi * tint[2], 1.0)

    grain = nt.nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 70.0
    grain.inputs["Detail"].default_value = 6.0
    bmp = nt.nodes.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = bump

    nt.links.new(coord.outputs["Object"], broad.inputs["Vector"])
    nt.links.new(coord.outputs["Object"], stretch.inputs["Vector"])
    nt.links.new(stretch.outputs["Vector"], streak.inputs["Vector"])
    nt.links.new(streak.outputs[0], weight.inputs[0])
    nt.links.new(broad.outputs[0], blend.inputs[0])
    nt.links.new(weight.outputs[0], blend.inputs[2])
    nt.links.new(blend.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(coord.outputs["Object"], grain.inputs["Vector"])
    nt.links.new(grain.outputs[0], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
    c.setv(bsdf, "Roughness", rough)
    c.setv(bsdf, ["Specular IOR Level", "Specular"], 0.3)
    return mat


def paint_material(name, color, roughness, specular, coat=0.0, coat_roughness=0.03, bump=None):
    """Paint for one of the passes. bump = (scale, strength) adds the gentle unevenness of a plastered wall."""
    mat, nt, bsdf = c.new_material(name)
    c.setv(bsdf, "Base Color", (color[0], color[1], color[2], 1.0))
    c.setv(bsdf, "Roughness", roughness)
    c.setv(bsdf, ["Specular IOR Level", "Specular"], specular)
    c.setv(bsdf, ["Coat Weight", "Clearcoat"], coat)
    c.setv(bsdf, ["Coat Roughness", "Clearcoat Roughness"], coat_roughness)
    if bump:
        coord = nt.nodes.new("ShaderNodeTexCoord")
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = bump[0]
        noise.inputs["Detail"].default_value = 3.0
        bmp = nt.nodes.new("ShaderNodeBump")
        bmp.inputs["Strength"].default_value = bump[1]
        bmp.inputs["Distance"].default_value = 0.4
        nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
        nt.links.new(noise.outputs[0], bmp.inputs["Height"])
        nt.links.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def rusty_steel(name):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix = nt.nodes.new("ShaderNodeMixShader")
    steel = nt.nodes.new("ShaderNodeBsdfPrincipled")
    rust = nt.nodes.new("ShaderNodeBsdfPrincipled")
    coord = nt.nodes.new("ShaderNodeTexCoord")

    c.setv(steel, "Base Color", (0.10, 0.11, 0.12, 1.0))
    c.setv(steel, "Metallic", 0.85)
    c.setv(steel, "Roughness", 0.52)

    patches = nt.nodes.new("ShaderNodeTexNoise")
    patches.inputs["Scale"].default_value = 2.6
    patches.inputs["Detail"].default_value = 11.0
    patches.inputs["Roughness"].default_value = 0.68
    where = nt.nodes.new("ShaderNodeValToRGB")
    where.color_ramp.elements[0].position = 0.36
    where.color_ramp.elements[1].position = 0.56

    grain = nt.nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 26.0
    grain.inputs["Detail"].default_value = 8.0
    tone = nt.nodes.new("ShaderNodeValToRGB")
    tone.color_ramp.elements[0].position = 0.3
    tone.color_ramp.elements[0].color = (0.11, 0.035, 0.014, 1.0)
    tone.color_ramp.elements[1].position = 0.72
    tone.color_ramp.elements[1].color = (0.42, 0.15, 0.045, 1.0)
    bmp = nt.nodes.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = 0.35

    c.setv(rust, "Roughness", 0.94)
    c.setv(rust, ["Specular IOR Level", "Specular"], 0.2)

    for tex in (patches, grain):
        nt.links.new(coord.outputs["Object"], tex.inputs["Vector"])
    nt.links.new(patches.outputs[0], where.inputs[0])
    nt.links.new(grain.outputs[0], tone.inputs[0])
    nt.links.new(tone.outputs["Color"], rust.inputs["Base Color"])
    nt.links.new(grain.outputs[0], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], rust.inputs["Normal"])
    nt.links.new(where.outputs["Color"], mix.inputs[0])
    nt.links.new(steel.outputs[0], mix.inputs[1])
    nt.links.new(rust.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def leaf_canopy(scene, center, size, scale=1.0):
    """A sheet of leaves high above the scene and out of shot. Sunlight coming through the gaps dapples the ground,
    the way it does under a tree. It is not listed with the scene's objects, so every pass keeps it as it is."""
    mat = bpy.data.materials.new("Leaves")
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix = nt.nodes.new("ShaderNodeMixShader")
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    leaf = nt.nodes.new("ShaderNodeBsdfDiffuse")
    leaf.inputs["Color"].default_value = (0.02, 0.04, 0.015, 1.0)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 6.0
    noise.inputs["Roughness"].default_value = 0.62
    gaps = nt.nodes.new("ShaderNodeValToRGB")
    gaps.color_ramp.elements[0].position = 0.47
    gaps.color_ramp.elements[1].position = 0.53
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs[0], gaps.inputs[0])
    nt.links.new(gaps.outputs["Color"], mix.inputs[0])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(leaf.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])

    sheet = c.box(scene, "Canopy", center, (size, size, 0.01))
    c.assign(sheet, mat)
    for flag in ("visible_camera", "visible_glossy"):
        try:
            setattr(sheet, flag, False)
        except Exception:
            pass
    return sheet


# ---------- shapes ----------

def h_section(depth, width, flange, web):
    """Outline of an I or H section: depth along the first axis, flange width along the second."""
    d, b = depth / 2.0, width / 2.0
    return [(-d, -b), (-d + flange, -b), (-d + flange, -web / 2), (d - flange, -web / 2), (d - flange, -b), (d, -b),
            (d, b), (d - flange, b), (d - flange, web / 2), (-d + flange, web / 2), (-d + flange, b), (-d, b)]


def hex_bolts(scene, name, positions, axis, radius=0.019, depth=0.016):
    """Hex bolt heads with washers, sharing one mesh. axis is the direction the head points: 'X', 'Y' or 'Z'."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=radius, radius2=radius, depth=depth)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=radius * 1.5, radius2=radius * 1.5, depth=depth * 0.25,
                          matrix=Matrix.Translation((0, 0, -depth * 0.6)))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    # "Y" points the head at the camera (towards -Y), with the washer against the plate behind it.
    rot = {"Z": (0, 0, 0), "X": (0, math.radians(90), 0), "Y": (math.radians(90), 0, 0)}[axis]
    obs = []
    for p in positions:
        ob = bpy.data.objects.new(name, me)
        scene.collection.objects.link(ob)
        ob.location = p
        ob.rotation_euler = rot
        obs.append(ob)
    return obs


def cast_wall_details(scene, y_face, x_range, z_range, panel=(2.4, 1.2)):
    """Formwork joints and tie holes on a concrete wall whose visible face is at y = y_face (facing the camera)."""
    joint = c.plain("FormJoint", (0.2, 0.2, 0.195), roughness=1.0, specular=0.0)
    hole = c.plain("TieHole", (0.07, 0.07, 0.07), roughness=1.0, specular=0.0)
    x0, x1 = x_range
    z0, z1 = z_range
    y = y_face - 0.001
    nx = int(round((x1 - x0) / panel[0]))
    nz = int(round((z1 - z0) / panel[1]))
    obs = []
    for i in range(nx + 1):
        obs.append(c.box(scene, "Joint", (x0 + i * panel[0], y, (z0 + z1) / 2), (0.007, 0.002, z1 - z0)))
    for k in range(1, nz + 1):
        obs.append(c.box(scene, "Joint", ((x0 + x1) / 2, y, z0 + k * panel[1]), (x1 - x0, 0.002, 0.007)))
    for ob in obs:
        c.assign(ob, joint)

    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=18, radius1=0.014, radius2=0.014, depth=0.003)
    me = bpy.data.meshes.new("TieHole")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(hole)
    for i in range(nx):
        for k in range(nz):
            for fx in (0.25, 0.75):
                ob = bpy.data.objects.new("TieHole", me)
                scene.collection.objects.link(ob)
                ob.location = (x0 + (i + fx) * panel[0], y, z0 + (k + 0.5) * panel[1])
                ob.rotation_euler = (math.radians(90), 0, 0)
                obs.append(ob)
    return obs


def slab_joints(scene, x_range, y_range, spacing=3.0):
    """Saw-cut joints in a concrete floor."""
    mat = c.plain("SlabJoint", (0.1, 0.1, 0.1), roughness=1.0, specular=0.0)
    obs = []
    x0, x1 = x_range
    y0, y1 = y_range
    x = x0
    while x <= x1 + 1e-6:
        obs.append(c.box(scene, "SlabJoint", (x, (y0 + y1) / 2, 0.0006), (0.008, y1 - y0, 0.0012)))
        x += spacing
    y = y0
    while y <= y1 + 1e-6:
        obs.append(c.box(scene, "SlabJoint", ((x0 + x1) / 2, y, 0.0006), (x1 - x0, 0.008, 0.0012)))
        y += spacing
    for ob in obs:
        c.assign(ob, mat)
    return obs


def floor_line(scene, center, size):
    """A painted walkway line, a little worn."""
    ob = c.box(scene, "FloorLine", center, size)
    mat, nt, bsdf = c.new_material("FloorLine")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9.0
    noise.inputs["Detail"].default_value = 8.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.42, 0.33, 0.1, 1.0)
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[1].color = (0.8, 0.56, 0.03, 1.0)
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    c.setv(bsdf, "Roughness", 0.8)
    c.assign(ob, mat)
    return ob


def sun(scene, direction, strength=2.6, angle=3.0, color=SUN_WARM):
    light = bpy.data.lights.new("Sun", "SUN")
    light.energy = strength
    light.color = color
    light.angle = math.radians(angle)
    ob = bpy.data.objects.new("Sun", light)
    scene.collection.objects.link(ob)
    d = Vector(direction).normalized()
    ob.location = (-d.x * 20, -d.y * 20, -d.z * 20)
    c.look_at(ob, (0, 0, 0))
    return ob


# ---------- scenes ----------

def build_steel(scene):
    """A small portal frame bolted to a slab, in front of a cast concrete wall that catches its shadow."""
    paint, other = [], []
    floor = c.box(scene, "Floor", (0, 0, -0.1), (40, 40, 0.2))
    c.assign(floor, concrete("Slab", 0.4, scale=1.0, bump=0.12))
    wall = c.box(scene, "Wall", (0, 1.25, 4.0), (40, 0.3, 8.0))
    c.assign(wall, concrete("CastWall", 0.5, scale=0.8, bump=0.06, contrast=0.07))
    other += [floor, wall]
    other += cast_wall_details(scene, 1.1, (-7.2, 7.2), (0.0, 6.0))
    other += slab_joints(scene, (-7.5, 7.5), (-7.4, 0.2), spacing=3.8)
    other.append(floor_line(scene, (0.0, -1.3, 0.0012), (16.0, 0.1, 0.0024)))

    col_h, span = 2.75, 1.75
    for sx in (-1, 1):
        x = sx * span
        col = c.extrude_profile(scene, "Column", h_section(0.25, 0.25, 0.014, 0.009), col_h, axis="Z")
        col.location = (x, 0, col_h / 2 + 0.02)
        c.add_bevel(col, 0.003, segments=2)
        base = c.box(scene, "BasePlate", (x, 0, 0.01), (0.46, 0.46, 0.02), bevel=0.003)
        cap = c.box(scene, "CapPlate", (x, 0, col_h + 0.02 + 0.008), (0.30, 0.28, 0.016), bevel=0.002)
        bolts = hex_bolts(scene, "Anchor", [(x + dx, dy, 0.03) for dx in (-0.17, 0.17) for dy in (-0.17, 0.17)], "Z", radius=0.022, depth=0.022)
        # Knee brace from the column up to the beam, with a gusset plate at each end.
        inner = -sx
        brace = c.box(scene, "Brace", (0, 0, 0), (1.05, 0.07, 0.07), bevel=0.004)
        brace.location = (x + inner * 0.46, 0, 2.32)
        brace.rotation_euler = (0, math.radians(-45.0 * inner), 0)
        g1 = c.box(scene, "Gusset", (x + inner * 0.2, 0, 2.03), (0.22, 0.012, 0.26), bevel=0.002)
        g2 = c.box(scene, "Gusset", (x + inner * 0.76, 0, 2.686), (0.26, 0.012, 0.2), bevel=0.002)
        # Stiffener plates in the column web, level with the brace.
        s1 = c.box(scene, "Stiffener", (x, 0.064, 2.03), (0.222, 0.118, 0.01), bevel=0.0015)
        s2 = c.box(scene, "Stiffener", (x, -0.064, 2.03), (0.222, 0.118, 0.01), bevel=0.0015)
        paint += [col, base, cap, brace, g1, g2, s1, s2] + bolts

    beam_z = col_h + 0.02 + 0.016 + 0.15
    beam = c.extrude_profile(scene, "Beam", [(b, a) for a, b in h_section(0.30, 0.16, 0.012, 0.008)], 4.3, axis="X")
    beam.location = (0, 0, beam_z)
    c.add_bevel(beam, 0.003, segments=2)
    paint.append(beam)
    for sx in (-1, 1):
        paint.append(c.box(scene, "EndPlate", (sx * 2.156, 0, beam_z), (0.012, 0.18, 0.32), bevel=0.002))
    paint += hex_bolts(scene, "CapBolt", [(sx * span + dx, dy, beam_z - 0.15 + 0.012 + 0.008)
                                           for sx in (-1, 1) for dx in (-0.09, 0.09) for dy in (-0.055, 0.055)], "Z", radius=0.015, depth=0.014)
    paint += hex_bolts(scene, "GussetBolt", [(sx * span - sx * 0.2 + dx, -0.012, 2.03 + dz)
                                             for sx in (-1, 1) for dx in (-0.05, 0.05) for dz in (-0.07, 0.07)], "Y", radius=0.013, depth=0.012)

    sun(scene, (0.5, 0.62, -0.6), strength=2.75, angle=2.2)
    c.gradient_world(scene, [(0.0, 0.2), (0.5, 0.3), (1.0, 0.44)], strength=1.0, tint=SKY_COOL)
    c.add_camera(scene, (-2.9, -6.6, 1.25), (0.15, 0.0, 1.62), lens=44.0)
    return paint, other


def build_gate(scene):
    """A double steel gate between two concrete posts, half in the shade of a tree."""
    paint, other = [], []
    ground = c.box(scene, "Ground", (0, 0, -0.1), (60, 60, 0.2))
    c.assign(ground, concrete("Driveway", 0.44, scale=1.0, bump=0.14))
    far = c.box(scene, "FarWall", (0, 9.0, 4.0), (60, 0.3, 8.0))
    c.assign(far, concrete("FarWall", 0.52, scale=0.7, bump=0.05, contrast=0.07))
    other += [ground, far]
    other += cast_wall_details(scene, 8.85, (-9.6, 9.6), (0.0, 6.0))
    other += slab_joints(scene, (-9.0, 9.0), (-8.0, 8.0), spacing=2.0)

    post_mat = concrete("Post", 0.55, scale=2.2, bump=0.1, contrast=0.06)
    for sx in (-1, 1):
        post = c.box(scene, "Post", (sx * 1.74, 0, 1.15), (0.42, 0.42, 2.3), bevel=0.012)
        cap = c.box(scene, "PostCap", (sx * 1.74, 0, 2.34), (0.52, 0.52, 0.08), bevel=0.012)
        side = c.box(scene, "SideWall", (sx * 5.95, 0.02, 1.0), (8.0, 0.2, 2.0), bevel=0.006)
        coping = c.box(scene, "Coping", (sx * 5.95, 0.02, 2.03), (8.0, 0.28, 0.06), bevel=0.006)
        for ob in (post, cap, side, coping):
            c.assign(ob, post_mat)
        other += [post, cap, side, coping]

    dark = c.plain("Hardware", (0.03, 0.03, 0.035), roughness=0.4, metallic=0.9)
    tube, zb, zt, zm = 0.05, 0.085, 2.0, 0.72
    for sx in (-1, 1):
        x0, x1 = sx * 0.012, sx * 1.50
        xc, w = (x0 + x1) / 2, abs(x1 - x0)
        parts = [
            c.box(scene, "Stile", (x0 + sx * tube / 2, 0, (zb + zt) / 2), (tube, tube, zt - zb), bevel=0.004),
            c.box(scene, "Stile", (x1 - sx * tube / 2, 0, (zb + zt) / 2), (tube, tube, zt - zb), bevel=0.004),
            c.box(scene, "Rail", (xc, 0, zb + tube / 2), (w, tube, tube), bevel=0.004),
            c.box(scene, "Rail", (xc, 0, zm), (w, tube, tube), bevel=0.004),
            c.box(scene, "Rail", (xc, 0, zt - tube / 2), (w, tube, tube), bevel=0.004),
            c.box(scene, "Panel", (xc, 0, (zb + zm) / 2), (w - tube, 0.006, zm - zb - tube), bevel=0.0),
        ]
        bars = 11
        for i in range(bars):
            bx = x0 + sx * (tube + (w - 2 * tube) * (i + 1) / (bars + 1))
            parts.append(c.box(scene, "Bar", (bx, 0, (zm + zt) / 2), (0.02, 0.02, zt - zm - tube), bevel=0.002))
        paint += parts
        for hz in (0.42, 1.68):
            hinge = c.box(scene, "Hinge", (sx * 1.52, -0.005, hz), (0.03, 0.06, 0.13), bevel=0.004)
            c.assign(hinge, dark)
            other.append(hinge)
    latch = c.box(scene, "Latch", (0.0, -0.034, 1.02), (0.2, 0.02, 0.07), bevel=0.004)
    c.assign(latch, dark)
    other.append(latch)

    direction = Vector((0.5, 0.56, -0.66)).normalized()
    sun(scene, direction, strength=2.9, angle=2.2)
    # Tree shade over the left part of the gate and wall; the right side stays in full sun.
    shade_at = Vector((-2.0, 0.0, 1.0))
    leaf_canopy(scene, tuple(shade_at - direction * 9.5), 5.2, scale=1.25)
    c.gradient_world(scene, [(0.0, 0.2), (0.5, 0.32), (1.0, 0.48)], strength=1.0, tint=SKY_COOL)
    c.add_camera(scene, (2.15, -5.3, 1.22), (-0.12, 0.0, 1.08), lens=40.0)
    return paint, other


def build_wall(scene):
    """A plant wall with sunlight coming through tall windows off to the left."""
    paint, other = [], []
    floor = c.box(scene, "Floor", (0, -10, -0.1), (40, 30, 0.2))
    c.assign(floor, concrete("PlantFloor", 0.44, scale=0.8, rough=0.6, bump=0.04, contrast=0.06))
    other.append(floor)
    other += slab_joints(scene, (-6.0, 9.0), (-9.0, -0.05), spacing=3.0)
    other.append(floor_line(scene, (1.0, -1.05, 0.0012), (16.0, 0.09, 0.0024)))

    wall = c.box(scene, "PaintedWall", (1.0, 0.15, 3.0), (16.0, 0.3, 6.0))
    paint.append(wall)
    for px in (-2.05, 1.25):
        paint.append(c.box(scene, "Pilaster", (px, -0.06, 3.0), (0.36, 0.12, 6.0), bevel=0.006))

    skirting = c.box(scene, "Skirting", (1.0, -0.012, 0.075), (16.0, 0.024, 0.15))
    c.assign(skirting, c.plain("Skirting", (0.03, 0.03, 0.03), roughness=0.5))
    other.append(skirting)

    door_mat = c.plain("Door", (0.33, 0.35, 0.36), roughness=0.45, metallic=0.0)
    frame_mat = c.plain("DoorFrame", (0.09, 0.09, 0.1), roughness=0.4, metallic=0.6)
    dx = 2.45
    door = c.box(scene, "Door", (dx, -0.02, 1.06), (0.94, 0.045, 2.1), bevel=0.003)
    c.assign(door, door_mat)
    other.append(door)
    for part in (c.box(scene, "Jamb", (dx - 0.5, -0.03, 1.08), (0.06, 0.07, 2.2), bevel=0.003),
                 c.box(scene, "Jamb", (dx + 0.5, -0.03, 1.08), (0.06, 0.07, 2.2), bevel=0.003),
                 c.box(scene, "Head", (dx, -0.03, 2.15), (1.06, 0.07, 0.06), bevel=0.003),
                 c.box(scene, "Handle", (dx - 0.36, -0.06, 1.02), (0.03, 0.03, 0.18), bevel=0.006)):
        c.assign(part, frame_mat)
        other.append(part)

    # A conduit run high on the wall, on small standoffs.
    galv = c.plain("Galvanised", (0.62, 0.64, 0.65), roughness=0.38, metallic=1.0)

    def tube(name, length, radius, location, rotation):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=radius, radius2=radius, depth=length)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        ob = bpy.data.objects.new(name, me)
        scene.collection.objects.link(ob)
        ob.rotation_euler = rotation
        ob.location = location
        c.assign(ob, galv)
        other.append(ob)

    tube("Conduit", 16.0, 0.03, (1.0, -0.2, 2.86), (0, math.radians(90), 0))
    for bx in (-2.9, -1.3, 0.3, 1.9, 3.5):
        clip = c.box(scene, "Clip", (bx, -0.12, 2.86), (0.03, 0.24, 0.085), bevel=0.003)
        c.assign(clip, galv)
        other.append(clip)

    # Side wall with two tall industrial windows. It is out of shot; only its light reaches the painted wall.
    shade = c.plain("SideWall", (0.4, 0.4, 0.4), roughness=0.9)
    xw, t = -4.6, 0.3
    solids = [((xw, -12.0, 5.0), (t, 16.5, 10.0)),            # from far behind the camera up to the first window
              ((xw, -2.5, 1.3), (t, 2.6, 2.6)),               # below the windows
              ((xw, -2.5, 7.1), (t, 2.6, 5.8)),               # above the windows
              ((xw, -2.5, 3.4), (t, 0.2, 1.6)),               # pier between them
              ((xw, -0.55, 5.0), (t, 1.3, 10.0))]             # between the windows and the painted wall
    for center, size in solids:
        ob = c.box(scene, "SideWall", center, size)
        c.assign(ob, shade)
        other.append(ob)
    for y0 in (-3.7, -2.4):
        for k in range(1, 3):
            other.append(_bar(scene, shade, (xw, y0 + 0.55, 2.6 + 1.6 * k / 3), (0.06, 1.1, 0.045)))
        other.append(_bar(scene, shade, (xw, y0 + 0.55, 3.4), (0.06, 0.045, 1.6)))

    sun(scene, (0.75, 0.5, -0.36), strength=4.1, angle=1.2)
    c.gradient_world(scene, [(0.0, 0.16), (0.5, 0.2), (1.0, 0.3)], strength=1.7, tint=SKY_COOL)
    c.add_camera(scene, (-1.75, -5.6, 1.45), (0.35, 0.0, 1.58), lens=35.0)
    return paint, other


def tube(scene, name, radius, length, location, axis="Z", segments=48, radius2=None, caps=True, spin=0.0):
    """A cylinder, or a cone when radius2 is given, lying along X, Y or Z. caps=False leaves an open band.
    spin turns an X-axis tube around the vertical, to point it outward from a round tank."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=segments, radius1=radius,
                          radius2=radius if radius2 is None else radius2, depth=length)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    if hasattr(me, "set_sharp_from_angle"):
        me.set_sharp_from_angle(angle=math.radians(40))
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.rotation_euler = {"Z": (0, 0, spin), "X": (0, math.radians(90), spin), "Y": (math.radians(90), 0, spin)}[axis]
    ob.location = location
    return ob


SKY = [(0.48, (0.86, 0.9, 0.95)), (0.56, (0.62, 0.76, 0.93)), (1.0, (0.2, 0.4, 0.78))]


def build_tank(scene):
    """A storage tank and its pipework in a concrete yard."""
    paint, other = [], []
    ground = c.box(scene, "Yard", (0, 0, -0.1), (80, 80, 0.2))
    c.assign(ground, concrete("Yard", 0.43, scale=0.9, bump=0.14))
    bund = c.box(scene, "Bund", (2.0, 4.4, 0.55), (40.0, 0.25, 1.1), bevel=0.01)
    c.assign(bund, concrete("Bund", 0.52, scale=0.8, bump=0.06, contrast=0.06))
    far = c.box(scene, "FarWall", (0, 14.0, 3.5), (80, 0.3, 7.0))
    c.assign(far, concrete("FarWall", 0.5, scale=0.7, bump=0.05, contrast=0.07))
    other += [ground, bund, far]
    other += cast_wall_details(scene, 13.85, (-14.4, 16.8), (0.0, 7.2))
    other += slab_joints(scene, (-9.0, 12.0), (-9.0, 3.0), spacing=3.0)

    plinth = tube(scene, "Plinth", 1.8, 0.3, (0, 0, 0.15), segments=96)
    c.assign(plinth, concrete("Plinth", 0.56, scale=1.5, bump=0.08, contrast=0.05))
    other.append(plinth)
    galv = c.plain("Galvanised", (0.6, 0.62, 0.63), roughness=0.4, metallic=1.0)
    red = c.plain("HandWheel", (0.45, 0.04, 0.03), roughness=0.45)

    base = 0.3
    paint.append(tube(scene, "Shell", 1.5, 3.2, (0, 0, base + 1.6), segments=128))
    paint.append(tube(scene, "Roof", 1.5, 0.42, (0, 0, base + 3.2 + 0.21), radius2=0.22, segments=128))
    paint.append(tube(scene, "Vent", 0.2, 0.26, (0, 0, base + 3.62 + 0.11)))
    for z in (base + 1.08, base + 2.14, base + 3.18):          # welded course seams and the top angle
        paint.append(tube(scene, "Seam", 1.509, 0.022, (0, 0, z), segments=128))

    # Manhole on the side facing the camera.
    a = math.radians(-64.0)
    out = (math.cos(a), math.sin(a))
    paint.append(tube(scene, "ManholeNeck", 0.31, 0.2, (out[0] * 1.55, out[1] * 1.55, base + 0.75), axis="X", spin=a))
    paint.append(tube(scene, "ManholeCover", 0.37, 0.035, (out[0] * 1.665, out[1] * 1.665, base + 0.75), axis="X", spin=a))

    # Outlet line: out of the shell, through a valve, along pipe supports.
    pz = 0.72
    paint.append(tube(scene, "Outlet", 0.11, 5.6, (1.4 + 2.8, 0, pz), axis="X"))
    for x in (1.72, 3.34, 3.42, 5.3, 5.38):
        paint.append(tube(scene, "Flange", 0.2, 0.036, (x, 0, pz), axis="X"))
    paint.append(tube(scene, "ValveBody", 0.17, 0.44, (4.36, 0, pz), axis="X"))
    paint.append(tube(scene, "Bonnet", 0.085, 0.5, (4.36, 0, pz + 0.36)))
    wheel = tube(scene, "HandWheel", 0.2, 0.03, (4.36, 0, pz + 0.64))
    c.assign(wheel, red)
    other.append(wheel)
    for x in (2.55, 6.1):
        sleeper = c.box(scene, "PipeSupport", (x, 0, (pz - 0.115) / 2), (0.3, 0.55, pz - 0.115), bevel=0.01)
        c.assign(sleeper, plinth.data.materials[0])
        other.append(sleeper)

    # Fill line up the shell and over the roof edge.
    b = math.radians(-22.0)
    fx, fy = math.cos(b) * 1.62, math.sin(b) * 1.62
    paint.append(tube(scene, "FillLine", 0.055, 3.3, (fx, fy, base + 0.35 + 1.65)))
    paint.append(tube(scene, "FillTop", 0.055, 0.5, (math.cos(b) * 1.4, math.sin(b) * 1.4, base + 3.62), axis="X", spin=b))
    for z in (base + 1.1, base + 2.3):
        clip = tube(scene, "Clip", 0.075, 0.05, (fx, fy, z))
        c.assign(clip, galv)
        other.append(clip)

    # Access ladder and roof handrail, galvanized and left unpainted.
    la = math.radians(-118.0)
    radial = (math.cos(la), math.sin(la))
    tangent = (-math.sin(la), math.cos(la))
    for side in (-0.2, 0.2):
        s = tube(scene, "Stringer", 0.022, 4.3, (radial[0] * 1.66 + tangent[0] * side, radial[1] * 1.66 + tangent[1] * side, 2.2), segments=16)
        c.assign(s, galv)
        other.append(s)
    for k in range(13):
        r = tube(scene, "Rung", 0.014, 0.4, (radial[0] * 1.66, radial[1] * 1.66, 0.45 + k * 0.3), axis="Y", segments=12, spin=la)
        c.assign(r, galv)
        other.append(r)
    for z in (base + 3.2 + 0.55, base + 3.2 + 1.05):
        rail = tube(scene, "Handrail", 1.46, 0.04, (0, 0, z), segments=96, caps=False)
        c.assign(rail, galv)
        other.append(rail)
    for k in range(14):
        t = 2 * math.pi * k / 14
        post = tube(scene, "Post", 0.02, 1.08, (math.cos(t) * 1.46, math.sin(t) * 1.46, base + 3.2 + 0.54), segments=12)
        c.assign(post, galv)
        other.append(post)

    sun(scene, (-0.42, 0.62, -0.66), strength=2.85, angle=2.2)
    c.gradient_world(scene, [(0.0, 0.2), (0.5, 0.32), (1.0, 0.48)], strength=1.0, tint=SKY_COOL, sky=SKY)
    c.add_camera(scene, (5.9, -8.4, 1.65), (1.35, 0.0, 2.05), lens=38.0)
    return paint, other


def build_machine(scene):
    """A motor and pump set on its base frame, on a plant floor."""
    paint, other = [], []
    floor = c.box(scene, "Floor", (0, 0, -0.1), (40, 40, 0.2))
    c.assign(floor, concrete("PlantFloor", 0.44, scale=0.8, rough=0.6, bump=0.04, contrast=0.06))
    wall = c.box(scene, "Wall", (0, 2.05, 4.0), (40, 0.3, 8.0))
    c.assign(wall, concrete("CastWall", 0.5, scale=0.8, bump=0.06, contrast=0.07))
    other += [floor, wall]
    other += cast_wall_details(scene, 1.9, (-7.2, 7.2), (0.0, 6.0))
    other += slab_joints(scene, (-6.0, 6.0), (-6.0, 1.5), spacing=3.0)
    other.append(floor_line(scene, (0.0, -1.25, 0.0012), (16.0, 0.09, 0.0024)))

    plinth = c.box(scene, "Plinth", (0.05, 0, 0.075), (2.6, 1.0, 0.15), bevel=0.012)
    c.assign(plinth, concrete("Plinth", 0.58, scale=2.0, bump=0.08, contrast=0.05))
    other.append(plinth)
    steel = c.plain("BrightSteel", (0.62, 0.63, 0.64), roughness=0.3, metallic=1.0)
    galv = c.plain("Galvanised", (0.6, 0.62, 0.63), roughness=0.4, metallic=1.0)
    guard_yellow = c.plain("Guard", (0.8, 0.52, 0.02), roughness=0.5)

    # Base frame.
    for y in (-0.33, 0.33):
        paint.append(c.box(scene, "Rail", (0.05, y, 0.21), (2.35, 0.09, 0.12), bevel=0.006))
    for x in (-0.95, 0.05, 1.0):
        paint.append(c.box(scene, "Cross", (x, 0, 0.2), (0.09, 0.75, 0.1), bevel=0.005))

    z = 0.63   # shaft height
    # Motor.
    paint.append(tube(scene, "MotorBody", 0.24, 0.62, (-0.62, 0, z), axis="X", segments=64))
    for i in range(20):
        paint.append(tube(scene, "Fin", 0.272, 0.011, (-0.9 + i * 0.029, 0, z), axis="X", segments=64))
    paint.append(tube(scene, "DriveEnd", 0.235, 0.1, (-0.26, 0, z), axis="X", radius2=0.16, segments=64))
    paint.append(tube(scene, "FanCowl", 0.266, 0.2, (-1.03, 0, z), axis="X", segments=64))
    paint.append(c.box(scene, "TerminalBox", (-0.62, 0, z + 0.3), (0.22, 0.2, 0.13), bevel=0.01))
    for x in (-0.82, -0.42):
        for y in (-0.2, 0.2):
            paint.append(c.box(scene, "MotorFoot", (x, y, 0.345), (0.12, 0.14, 0.15), bevel=0.006))

    shaft = tube(scene, "Shaft", 0.035, 0.5, (0.0, 0, z), axis="X", segments=24)
    c.assign(shaft, steel)
    guard = tube(scene, "CouplingGuard", 0.135, 0.26, (-0.03, 0, z), axis="X", segments=48)
    c.assign(guard, guard_yellow)
    other += [shaft, guard]

    # Pump.
    paint.append(tube(scene, "BearingHousing", 0.13, 0.36, (0.3, 0, z), axis="X", segments=48))
    paint.append(c.box(scene, "BearingFoot", (0.3, 0, 0.4), (0.2, 0.3, 0.26), bevel=0.008))
    paint.append(tube(scene, "BackPlate", 0.37, 0.03, (0.485, 0, z), axis="X", segments=96))
    paint.append(tube(scene, "Casing", 0.34, 0.2, (0.6, 0, z), axis="X", segments=96))
    paint.append(tube(scene, "FrontCover", 0.3, 0.05, (0.725, 0, z), axis="X", segments=96))
    paint.append(tube(scene, "Suction", 0.12, 0.3, (0.9, 0, z), axis="X", segments=48))
    paint.append(tube(scene, "SuctionFlange", 0.2, 0.036, (1.05, 0, z), axis="X", segments=64))
    paint.append(tube(scene, "Discharge", 0.095, 0.4, (0.6, 0.17, z + 0.44), segments=48))
    paint.append(tube(scene, "DischargeFlange", 0.17, 0.036, (0.6, 0.17, z + 0.64), segments=64))
    paint.append(c.box(scene, "CasingFoot", (0.6, 0, 0.33), (0.26, 0.34, 0.14), bevel=0.008))

    # Pipework beyond the pump flanges, left as bare galvanized pipe.
    for name, r, length, loc, axis in (
            ("SuctionPipe", 0.12, 3.2, (1.07 + 1.6, 0, z), "X"),
            ("PipeFlange", 0.2, 0.036, (1.09, 0, z), "X"),
            ("Riser", 0.095, 2.2, (0.6, 0.17, z + 0.66 + 1.1), "Z"),
            ("RiserFlange", 0.17, 0.036, (0.6, 0.17, z + 0.68), "Z"),
            ("Header", 0.095, 1.9, (0.6, 0.17 + 0.9, z + 2.86), "Y")):
        ob = tube(scene, name, r, length, loc, axis=axis, segments=48)
        c.assign(ob, galv)
        other.append(ob)
    other += hex_bolts(scene, "FootBolt", [(x, y, 0.428) for x in (-0.82, -0.42) for y in (-0.2, 0.2)], "Z", radius=0.014, depth=0.014)
    for ob in other[-4:]:
        c.assign(ob, steel)

    sun(scene, (-0.5, 0.6, -0.62), strength=2.9, angle=3.0)
    c.gradient_world(scene, [(0.0, 0.2), (0.5, 0.3), (1.0, 0.44)], strength=1.0, tint=SKY_COOL)
    c.add_camera(scene, (2.45, -3.15, 1.3), (0.02, 0.0, 0.52), lens=42.0)
    return paint, other


def build_building(scene):
    """The street side of a small plant or warehouse building."""
    paint, other = [], []
    ground = c.box(scene, "Paving", (0, 0, -0.1), (120, 120, 0.2))
    c.assign(ground, concrete("Paving", 0.5, scale=0.9, bump=0.12, contrast=0.07))
    other.append(ground)
    other += slab_joints(scene, (-16.0, 12.0), (-9.0, -0.1), spacing=2.5)
    road = c.box(scene, "Road", (0, -19.0, 0.001), (120, 20.0, 0.002))
    c.assign(road, c.plain("Asphalt", (0.06, 0.06, 0.065), roughness=0.85))
    other.append(road)

    width, height = 13.0, 6.6
    dark = c.plain("Frame", (0.035, 0.037, 0.04), roughness=0.4, metallic=0.7)
    glass = c.plain("Glass", (0.015, 0.025, 0.035), roughness=0.04, specular=0.9, coat=1.0, coat_roughness=0.02)
    stone = concrete("Coping", 0.6, scale=2.0, bump=0.06, contrast=0.05)
    base_mat = c.plain("Base", (0.1, 0.1, 0.105), roughness=0.7)

    paint.append(c.box(scene, "Facade", (0, 0.15, height / 2), (width, 0.3, height)))
    paint.append(c.box(scene, "SideWall", (-width / 2 + 0.15, 5.15, height / 2), (0.3, 10.0, height)))
    for x in (-6.3, -2.2, 1.9, 6.3):
        paint.append(c.box(scene, "Pilaster", (x, -0.06, height / 2), (0.4, 0.12, height), bevel=0.006))
    paint.append(c.box(scene, "FloorBand", (0, -0.04, 3.35), (width, 0.08, 0.26), bevel=0.004))

    for ob in (c.box(scene, "Base", (0, -0.075, 0.28), (width + 0.02, 0.16, 0.56)),
               c.box(scene, "SideBase", (-width / 2 - 0.012, 5.0, 0.28), (0.03, 10.3, 0.56))):
        c.assign(ob, base_mat)
        other.append(ob)
    for ob in (c.box(scene, "Coping", (0, 0.1, height + 0.06), (width + 0.24, 0.56, 0.12), bevel=0.01),
               c.box(scene, "SideCoping", (-width / 2 + 0.1, 5.1, height + 0.06), (0.56, 10.4, 0.12), bevel=0.01)):
        c.assign(ob, stone)
        other.append(ob)

    def window(x, zc, w, h):
        pane = c.box(scene, "Glass", (x, -0.005, zc), (w, 0.03, h))
        c.assign(pane, glass)
        other.append(pane)
        bars = [((x, -0.03, zc + h / 2), (w + 0.1, 0.06, 0.06)), ((x, -0.03, zc - h / 2), (w + 0.1, 0.06, 0.06)),
                ((x - w / 2, -0.03, zc), (0.06, 0.06, h)), ((x + w / 2, -0.03, zc), (0.06, 0.06, h)),
                ((x, -0.03, zc), (0.045, 0.05, h))]
        for center, size in bars:
            bar = c.box(scene, "WindowFrame", center, size)
            c.assign(bar, dark)
            other.append(bar)
        sill = c.box(scene, "Sill", (x, -0.09, zc - h / 2 - 0.07), (w + 0.26, 0.2, 0.07), bevel=0.006)
        c.assign(sill, stone)
        other.append(sill)

    for x in (-4.25, -0.15, 4.1):
        window(x, 4.75, 2.3, 1.35)
    window(-4.25, 1.75, 2.3, 1.35)

    # Entrance with a canopy.
    door = c.box(scene, "Door", (-0.15, -0.005, 1.12), (1.3, 0.04, 2.24))
    c.assign(door, glass)
    other.append(door)
    for center, size in (((-0.83, -0.03, 1.15), (0.07, 0.07, 2.3)), ((0.53, -0.03, 1.15), (0.07, 0.07, 2.3)),
                         ((-0.15, -0.03, 2.28), (1.43, 0.07, 0.07)), ((-0.15, -0.03, 1.12), (0.05, 0.06, 2.24))):
        bar = c.box(scene, "DoorFrame", center, size)
        c.assign(bar, dark)
        other.append(bar)
    for ob in (c.box(scene, "Canopy", (-0.15, -0.8, 2.62), (2.3, 1.6, 0.12), bevel=0.01),
               c.box(scene, "Step", (-0.15, -0.65, 0.07), (2.1, 1.3, 0.14), bevel=0.01)):
        c.assign(ob, stone)
        other.append(ob)

    # Roller shutter.
    shutter_mat = c.plain("Shutter", (0.42, 0.44, 0.45), roughness=0.45, metallic=0.6)
    shutter = c.box(scene, "Shutter", (4.1, -0.01, 1.5), (3.3, 0.05, 3.0))
    c.assign(shutter, shutter_mat)
    other.append(shutter)
    for k in range(1, 30):
        slat = c.box(scene, "Slat", (4.1, -0.038, k * 0.1), (3.3, 0.006, 0.014))
        c.assign(slat, dark)
        other.append(slat)
    for center, size in (((4.1, -0.1, 3.13), (3.5, 0.2, 0.26)), ((2.42, -0.04, 1.5), (0.08, 0.1, 3.0)), ((5.78, -0.04, 1.5), (0.08, 0.1, 3.0))):
        ob = c.box(scene, "ShutterFrame", center, size, bevel=0.006)
        c.assign(ob, dark)
        other.append(ob)

    direction = Vector((0.5, 0.62, -0.62)).normalized()
    sun(scene, direction, strength=2.9, angle=2.0)
    leaf_canopy(scene, tuple(Vector((-6.5, -1.0, 2.0)) - direction * 11.0), 6.0, scale=1.1)
    c.gradient_world(scene, [(0.0, 0.2), (0.5, 0.32), (1.0, 0.48)], strength=1.0, tint=SKY_COOL, sky=SKY)
    c.add_camera(scene, (-9.2, -12.5, 1.65), (0.2, 0.0, 3.05), lens=33.0)
    return paint, other


def _bar(scene, mat, center, size):
    ob = c.box(scene, "GlazingBar", center, size)
    c.assign(ob, mat)
    return ob


# ---------- passes ----------

def flatten(px):
    """Composite a render over black. Used for layers the site blends with 'screen' or shows opaque."""
    out = px.copy()
    out[..., :3] *= out[..., 3:4]
    out[..., 3] = 1.0
    return out


def main():
    scene = c.reset()
    test = MODE == "test"
    w, h = (1500, 1000)
    if test:
        w, h = 900, 600
    c.setup_cycles(scene, w, h, samples=48 if test else 224, transparent=False)

    builders = {"steel": build_steel, "gate": build_gate, "wall": build_wall,
                "tank": build_tank, "machine": build_machine, "building": build_building}
    paint, other = builders[SCENE](scene)
    bump = PAINT_BUMP.get(SCENE)
    work = lambda name: os.path.join(WORK, "%s-%s.png" % (SCENE, name))  # noqa: E731
    site = lambda name: os.path.join(SITE, "%s-%s.webp" % (SCENE, name))  # noqa: E731

    if MODE == "compare":
        for name, mat in (("before", rusty_steel("Rust")),
                          ("after", c.plain("Enamel", c.srgb("#0f6b3c"), roughness=0.16, coat=0.6, coat_roughness=0.04))):
            for ob in paint:
                c.assign(ob, mat)
            c.render_to(scene, work(name))
            c.write_pixels(flatten(c.read_pixels(work(name))), site(name), quality=86)
        return

    white = paint_material("PaintWhite", (0.86, 0.86, 0.86), roughness=1.0, specular=0.0, bump=bump)
    for ob in paint:
        c.assign(ob, white)
    c.render_to(scene, work("base"))
    base = c.read_pixels(work("base"))
    lum = base[..., :3].mean(axis=2)
    print("[stats] base luminance  mean %.3f  p50 %.3f  p95 %.3f  p99 %.3f  max %.3f" % (
        lum.mean(), np.percentile(lum, 50), np.percentile(lum, 95), np.percentile(lum, 99), lum.max()))
    if test:
        return
    c.write_pixels(flatten(base), site("base"), quality=86)

    # Highlights only: gloss black paint, everything else dead black, so 'screen' adds nothing but the shine.
    g = GLOSS.get(SCENE, {})
    gloss = paint_material("PaintGloss", (0.0, 0.0, 0.0), roughness=g.get("roughness", 0.1), specular=g.get("specular", 0.5),
                           coat=1.0, coat_roughness=g.get("coat_roughness", 0.03), bump=bump if g.get("bump", True) else None)
    dead = c.plain("Dead", (0.0, 0.0, 0.0), roughness=1.0, specular=0.0)
    for ob in paint:
        c.assign(ob, gloss)
    for ob in other:
        if g.get("reflect_room"):
            ob.is_holdout = True      # a hole for the camera, but still itself in the paint's reflections
        else:
            c.assign(ob, dead)
    scene.render.film_transparent = True
    c.render_to(scene, work("gloss"))
    c.write_pixels(flatten(c.read_pixels(work("gloss"))), site("gloss"), quality=82)

    # Where the paint is: white with see-through everywhere else.
    mask = c.emission("PaintMask")
    for ob in paint:
        c.assign(ob, mask)
    for ob in other:
        ob.is_holdout = True
    scene.cycles.samples = 48
    scene.cycles.use_denoising = False
    c.render_to(scene, work("mask"))
    px = c.read_pixels(work("mask"))
    px[..., :3] = 1.0
    c.write_pixels(px, site("mask"), quality=90)


main()
