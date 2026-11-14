"""Builds and renders the Alphacoat gallon can.

  blender --background --factory-startup --python can.py -- <mode> <work-folder> <site-img-folder>

  test    one frame, straight on, into the work folder
  turn    21 frames from -30 to +30 degrees, packed into one sprite sheet for the hero
  stills  one picture per label for the product panels
  shelf   nine small frames per label, in one strip, for the turning cans on the product shelf
"""
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as c  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = argv[0] if argv else "test"
WORK = argv[1] if len(argv) > 1 else os.path.join(HERE, "out")
SITE = argv[2] if len(argv) > 2 else os.path.join(HERE, "out")
os.makedirs(WORK, exist_ok=True)
os.makedirs(SITE, exist_ok=True)

FRAME_W, FRAME_H = 480, 600
SEG = 128


def lathe(scene, name, profile, segments=SEG):
    """Spin a (radius, height) outline around the vertical axis. Closed with a flat cap at each end."""
    verts = []
    for r, z in profile:
        for j in range(segments):
            a = 2 * math.pi * j / segments
            verts.append((r * math.cos(a), r * math.sin(a), z))
    faces = []
    for i in range(len(profile) - 1):
        for j in range(segments):
            k = (j + 1) % segments
            faces.append((i * segments + j, i * segments + k, (i + 1) * segments + k, (i + 1) * segments + j))
    faces.append(tuple(reversed(range(segments))))
    last = (len(profile) - 1) * segments
    faces.append(tuple(range(last, last + segments)))
    return c.mesh_object(scene, name, verts, faces, smooth=True, sharp_angle=42)


def build_can(scene, label_png):
    root = bpy.data.objects.new("Can", None)
    scene.collection.objects.link(root)

    tin = c.plain("Tin", (0.80, 0.81, 0.82), roughness=0.27, metallic=1.0)
    tin_lid = c.plain("TinLid", (0.78, 0.79, 0.80), roughness=0.34, metallic=1.0)

    # Body, beads, gutter and plug lid in one outline (radius, height), in metres.
    body = lathe(scene, "Body", [
        (0.0740, 0.0040), (0.0800, 0.0040), (0.0835, 0.0005),
        (0.0862, 0.0015), (0.0872, 0.0050), (0.0862, 0.0085), (0.0842, 0.0105),
        (0.0840, 0.0120), (0.0840, 0.1780),
        (0.0842, 0.1795), (0.0864, 0.1815), (0.0874, 0.1850), (0.0866, 0.1885), (0.0845, 0.1905),
        (0.0815, 0.1912), (0.0790, 0.1905), (0.0760, 0.1860), (0.0735, 0.1835),
        (0.0690, 0.1835), (0.0665, 0.1860), (0.0650, 0.1895), (0.0625, 0.1905),
        (0.0595, 0.1895), (0.0570, 0.1865), (0.0540, 0.1855), (0.0010, 0.1855),
    ])
    c.assign(body, tin)
    body.parent = root

    # Label: a thin sleeve just outside the body, with the artwork wrapped once around it.
    r, z0, z1 = 0.0845, 0.0200, 0.1700
    verts, faces = [], []
    for j in range(SEG):
        a = math.radians(-270.0) + 2 * math.pi * j / SEG  # the middle of the artwork faces the camera (-Y)
        x, y = r * math.cos(a), r * math.sin(a)
        verts.append((x, y, z0))
        verts.append((x, y, z1))
    for j in range(SEG):
        k = (j + 1) % SEG
        faces.append((2 * j, 2 * k, 2 * k + 1, 2 * j + 1))
    label = c.mesh_object(scene, "Label", verts, faces, smooth=True)
    uv = label.data.uv_layers.new(name="UV")
    for poly in label.data.polygons:
        j = poly.index
        corners = ((j / SEG, 0.0), ((j + 1) / SEG, 0.0), ((j + 1) / SEG, 1.0), (j / SEG, 1.0))
        for loop_index, co in zip(poly.loop_indices, corners):
            uv.data[loop_index].uv = co
    label.parent = root

    mat, nt, bsdf = c.new_material("Label")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(label_png)
    tex.extension = "REPEAT"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    c.setv(bsdf, "Roughness", 0.5)
    c.setv(bsdf, ["Specular IOR Level", "Specular"], 0.35)
    c.setv(bsdf, ["Coat Weight", "Clearcoat"], 0.18)
    c.setv(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.22)
    c.assign(label, mat)

    # Ears and wire handle.
    import bmesh
    for side in (-1, 1):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=0.0108, radius2=0.0098, depth=0.0052)
        me = bpy.data.meshes.new("Ear")
        bm.to_mesh(me)
        bm.free()
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        if hasattr(me, "set_sharp_from_angle"):
            me.set_sharp_from_angle(angle=math.radians(40))
        ear = bpy.data.objects.new("Ear", me)
        scene.collection.objects.link(ear)
        ear.rotation_euler = (0.0, math.radians(90.0 * side), 0.0)
        ear.location = (side * 0.0868, 0.0, 0.158)
        c.assign(ear, tin_lid)
        ear.parent = root

    curve = bpy.data.curves.new("Bail", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.0019
    curve.bevel_resolution = 5
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    steps = 72
    spline.points.add(steps)
    rx, rz, lean = 0.0915, 0.104, 0.030
    for i in range(steps + 1):
        t = math.pi * i / steps
        spline.points[i].co = (rx * math.cos(t), lean * math.sin(t), 0.158 + rz * math.sin(t), 1.0)
    bail = bpy.data.objects.new("Bail", curve)
    scene.collection.objects.link(bail)
    curve.materials.append(c.plain("Wire", (0.82, 0.83, 0.84), roughness=0.22, metallic=1.0))
    bail.parent = root

    return root, tex


def build_stage(scene):
    c.gradient_world(scene, [(0.0, 0.012), (0.47, 0.04), (0.58, 0.24), (1.0, 0.55)], strength=0.72)
    target = (0.0, 0.0, 0.11)
    c.area_light(scene, "Key", (-0.85, -1.1, 0.95), target, energy=24, size=1.2)
    c.area_light(scene, "Fill", (1.2, -0.8, 0.35), target, energy=8, size=1.0)
    c.area_light(scene, "Rim", (0.8, 0.95, 0.7), target, energy=34, size=0.8)
    # A tall narrow light well off to the left, so its reflection runs down the edge of the can and not across the lettering.
    c.area_light(scene, "Strip", (-1.15, -0.42, 0.2), target, energy=9, size=0.12, size_y=1.0)
    c.add_camera(scene, (0.0, -1.03, 0.315), (0.0, 0.0, 0.128), lens=108.0)


def main():
    scene = c.reset()
    c.setup_cycles(scene, FRAME_W, FRAME_H, samples=128 if MODE != "test" else 64)
    root, tex = build_can(scene, os.path.join(c.TEXTURES, "label-3130.png"))
    build_stage(scene)

    if MODE == "test":
        angle = float(argv[3]) if len(argv) > 3 else 0.0
        root.rotation_euler = (0.0, 0.0, math.radians(angle))
        c.render_to(scene, os.path.join(WORK, "can-test.png"))
        return

    if MODE == "turn":
        frames = 21
        cols, rows = 7, 3
        sheet = np.zeros((rows * FRAME_H, cols * FRAME_W, 4), dtype=np.float32)
        for f in range(frames):
            angle = -30.0 + 60.0 * f / (frames - 1)
            root.rotation_euler = (0.0, 0.0, math.radians(angle))
            path = os.path.join(WORK, "turn-%02d.png" % f)
            c.render_to(scene, path)
            px = c.read_pixels(path)
            row, col = divmod(f, cols)
            y0 = (rows - 1 - row) * FRAME_H  # pixel rows run bottom to top
            sheet[y0:y0 + FRAME_H, col * FRAME_W:(col + 1) * FRAME_W] = px
            if f == frames // 2:
                c.write_pixels(px, os.path.join(SITE, "can.webp"), quality=88)
        c.write_pixels(sheet, os.path.join(SITE, "can-turn.webp"), quality=84)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "paint-can.blend"))
        return

    if MODE == "stills":
        root.rotation_euler = (0.0, 0.0, math.radians(-13.0))
        for label_id in ("3130", "topcoat", "thinner-10", "thinner-40"):
            tex.image = bpy.data.images.load(os.path.join(c.TEXTURES, "label-%s.png" % label_id))
            path = os.path.join(WORK, "still-%s.png" % label_id)
            c.render_to(scene, path)
            c.convert(path, os.path.join(SITE, "can-%s.webp" % label_id), quality=88)

    if MODE == "shelf":
        # Small turning cans for the product shelf: nine frames per label, side by side in one strip.
        fw, fh, frames = 320, 400, 9
        scene.render.resolution_x, scene.render.resolution_y = fw, fh
        scene.cycles.samples = 96
        for label_id in ("3130", "topcoat", "thinner-10", "thinner-40"):
            tex.image = bpy.data.images.load(os.path.join(c.TEXTURES, "label-%s.png" % label_id))
            strip = np.zeros((fh, frames * fw, 4), dtype=np.float32)
            for f in range(frames):
                root.rotation_euler = (0.0, 0.0, math.radians(-24.0 + 48.0 * f / (frames - 1)))
                path = os.path.join(WORK, "shelf-%s-%d.png" % (label_id, f))
                c.render_to(scene, path)
                strip[:, f * fw:(f + 1) * fw] = c.read_pixels(path)
            c.write_pixels(strip, os.path.join(SITE, "turn-%s.webp" % label_id), quality=84)


main()
