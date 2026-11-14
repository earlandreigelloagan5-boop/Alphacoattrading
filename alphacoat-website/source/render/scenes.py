"""Renders the three scenes used by the color explorer, plus the before/after pair.

  blender --background --factory-startup --python scenes.py -- <scene> <mode> <work-folder> <site-img-folder>

  scene   steel | gate | wall
  mode    test   quick look at the base picture only
          full   the three layers the website stacks: base (paint in white), mask (where the paint is), gloss (highlights only)
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


# ---------- materials ----------

def concrete(name, grey, scale=5.0, rough=0.9, bump=0.12):
    mat, nt, bsdf = c.new_material(name)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    bmp = nt.nodes.new("ShaderNodeBump")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 9.0
    noise.inputs["Roughness"].default_value = 0.62
    lo, hi = grey * 0.78, grey * 1.12
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (lo, lo, lo * 0.98, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (hi, hi, hi * 0.97, 1.0)
    bmp.inputs["Strength"].default_value = bump
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(noise.outputs[0], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
    c.setv(bsdf, "Roughness", rough)
    c.setv(bsdf, ["Specular IOR Level", "Specular"], 0.3)
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


# ---------- shapes ----------

def h_section(depth, width, flange, web):
    """Outline of an I or H section: depth along the first axis, flange width along the second."""
    d, b = depth / 2.0, width / 2.0
    return [(-d, -b), (-d + flange, -b), (-d + flange, -web / 2), (d - flange, -web / 2), (d - flange, -b), (d, -b),
            (d, b), (d - flange, b), (d - flange, web / 2), (-d + flange, web / 2), (-d + flange, b), (-d, b)]


def hex_bolts(scene, name, positions, axis, radius=0.019, depth=0.016):
    """Hex bolt heads sharing one mesh. axis is the direction the head points: 'X', 'Y' or 'Z'."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=radius, radius2=radius, depth=depth)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=radius * 1.5, radius2=radius * 1.5, depth=depth * 0.25,
                          matrix=__import__("mathutils").Matrix.Translation((0, 0, -depth * 0.6)))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    rot = {"Z": (0, 0, 0), "X": (0, math.radians(90), 0), "Y": (math.radians(-90), 0, 0)}[axis]
    obs = []
    for p in positions:
        ob = bpy.data.objects.new(name, me)
        scene.collection.objects.link(ob)
        ob.location = p
        ob.rotation_euler = rot
        obs.append(ob)
    return obs


def sun(scene, direction, strength=2.6, angle=3.0):
    light = bpy.data.lights.new("Sun", "SUN")
    light.energy = strength
    light.angle = math.radians(angle)
    ob = bpy.data.objects.new("Sun", light)
    scene.collection.objects.link(ob)
    from mathutils import Vector
    d = Vector(direction).normalized()
    ob.location = (-d.x * 20, -d.y * 20, -d.z * 20)
    c.look_at(ob, (0, 0, 0))
    return ob


# ---------- scenes ----------

def build_steel(scene):
    """A small portal frame bolted to a slab, in front of a block wall that catches its shadow."""
    paint, other = [], []
    floor = c.box(scene, "Floor", (0, 0, -0.1), (40, 40, 0.2))
    c.assign(floor, concrete("Slab", 0.36, scale=3.0))
    wall = c.box(scene, "Wall", (0, 1.25, 4.0), (40, 0.3, 8.0))
    c.assign(wall, concrete("BlockWall", 0.46, scale=2.2, bump=0.06))
    other += [floor, wall]

    col_h, span = 2.75, 1.75
    for sx in (-1, 1):
        x = sx * span
        col = c.extrude_profile(scene, "Column", h_section(0.25, 0.25, 0.014, 0.009), col_h, axis="Z")
        col.location = (x, 0, col_h / 2 + 0.02)
        base = c.box(scene, "BasePlate", (x, 0, 0.01), (0.46, 0.46, 0.02), bevel=0.003)
        cap = c.box(scene, "CapPlate", (x, 0, col_h + 0.02 + 0.008), (0.30, 0.28, 0.016), bevel=0.002)
        bolts = hex_bolts(scene, "Anchor", [(x + dx, dy, 0.03) for dx in (-0.17, 0.17) for dy in (-0.17, 0.17)], "Z", radius=0.022, depth=0.022)
        # Knee brace from the column up to the beam, with a gusset plate at each end.
        inner = -sx
        brace_len = 1.05
        brace = c.box(scene, "Brace", (0, 0, 0), (brace_len, 0.07, 0.07), bevel=0.004)
        brace.location = (x + inner * 0.46, 0, 2.32)
        brace.rotation_euler = (0, math.radians(-45.0 * inner), 0)
        g1 = c.box(scene, "Gusset", (x + inner * 0.2, 0, 2.03), (0.22, 0.012, 0.26), bevel=0.002)
        g2 = c.box(scene, "Gusset", (x + inner * 0.76, 0, 2.686), (0.26, 0.012, 0.2), bevel=0.002)
        paint += [col, base, cap, brace, g1, g2] + bolts

    beam_z = col_h + 0.02 + 0.016 + 0.15
    beam = c.extrude_profile(scene, "Beam", [(b, a) for a, b in h_section(0.30, 0.16, 0.012, 0.008)], 4.3, axis="X")
    beam.location = (0, 0, beam_z)
    paint.append(beam)
    paint += hex_bolts(scene, "CapBolt", [(sx * span + dx, dy, beam_z - 0.15 + 0.012 + 0.008)
                                           for sx in (-1, 1) for dx in (-0.09, 0.09) for dy in (-0.055, 0.055)], "Z", radius=0.015, depth=0.014)

    sun(scene, (0.5, 0.62, -0.6), strength=2.7, angle=2.5)
    c.gradient_world(scene, [(0.0, 0.2), (0.5, 0.3), (1.0, 0.42)], strength=1.0)
    c.add_camera(scene, (-2.9, -6.6, 1.25), (0.15, 0.0, 1.62), lens=44.0)
    return paint, other


def build_gate(scene):
    """A double steel gate between two concrete posts."""
    paint, other = [], []
    ground = c.box(scene, "Ground", (0, 0, -0.1), (60, 60, 0.2))
    c.assign(ground, concrete("Driveway", 0.4, scale=2.4))
    far = c.box(scene, "FarWall", (0, 9.0, 4.0), (60, 0.3, 8.0))
    c.assign(far, concrete("FarWall", 0.5, scale=1.6, bump=0.05))
    other += [ground, far]

    post_mat = concrete("Post", 0.52, scale=7.0, bump=0.1)
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

    sun(scene, (0.5, 0.56, -0.66), strength=2.7, angle=2.5)
    c.gradient_world(scene, [(0.0, 0.2), (0.5, 0.32), (1.0, 0.46)], strength=1.0)
    c.add_camera(scene, (2.15, -5.3, 1.22), (-0.12, 0.0, 1.08), lens=40.0)
    return paint, other


def build_wall(scene):
    """A plant wall with sunlight coming through tall windows off to the left."""
    paint, other = [], []
    floor = c.box(scene, "Floor", (0, -10, -0.1), (40, 30, 0.2))
    c.assign(floor, concrete("PlantFloor", 0.44, scale=1.8, rough=0.62, bump=0.04))
    other.append(floor)

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
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.03, radius2=0.03, depth=16.0)
    me = bpy.data.meshes.new("Conduit")
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    conduit = bpy.data.objects.new("Conduit", me)
    scene.collection.objects.link(conduit)
    conduit.rotation_euler = (0, math.radians(90), 0)
    conduit.location = (1.0, -0.2, 2.86)
    c.assign(conduit, galv)
    other.append(conduit)
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

    sun(scene, (0.75, 0.5, -0.36), strength=4.0, angle=1.2)
    c.gradient_world(scene, [(0.0, 0.16), (0.5, 0.2), (1.0, 0.3)], strength=1.7)
    c.add_camera(scene, (-1.75, -5.6, 1.45), (0.35, 0.0, 1.58), lens=35.0)
    return paint, other


def _bar(scene, mat, center, size):
    ob = c.box(scene, "GlazingBar", center, size)
    c.assign(ob, mat)
    return ob


# ---------- passes ----------

def flatten(px, keep_alpha=False):
    """Composite a render over black. Used for layers the site blends with 'screen' or shows opaque."""
    out = px.copy()
    if not keep_alpha:
        out[..., :3] *= out[..., 3:4]
        out[..., 3] = 1.0
    return out


def main():
    scene = c.reset()
    test = MODE == "test"
    w, h = (1440, 960) if MODE == "compare" else (1200, 800)
    if test:
        w, h = 900, 600
    c.setup_cycles(scene, w, h, samples=48 if test else 192, transparent=False)

    paint, other = {"steel": build_steel, "gate": build_gate, "wall": build_wall}[SCENE](scene)
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

    white = c.plain("PaintWhite", (0.86, 0.86, 0.86), roughness=1.0, specular=0.0)
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
    gloss = c.plain("PaintGloss", (0.0, 0.0, 0.0), roughness=0.1, specular=0.5, coat=1.0, coat_roughness=0.03)
    dead = c.plain("Dead", (0.0, 0.0, 0.0), roughness=1.0, specular=0.0)
    for ob in paint:
        c.assign(ob, gloss)
    for ob in other:
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
