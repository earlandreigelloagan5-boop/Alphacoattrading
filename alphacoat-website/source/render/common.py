"""Shared helpers for the Alphacoat render scripts (run inside Blender, in background mode)."""
import math
import os

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
TEXTURES = os.path.join(HERE, "textures")


# ---------- scene and render ----------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def setup_cycles(scene, width, height, samples=128, transparent=True):
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    device = "CPU"
    for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
        try:
            prefs.compute_device_type = kind
            for fn in ("refresh_devices", "get_devices"):
                if hasattr(prefs, fn):
                    try:
                        getattr(prefs, fn)()
                    except Exception:
                        pass
            matching = [d for d in prefs.devices if d.type == kind]
            if matching:
                for d in prefs.devices:
                    d.use = d.type == kind
                device = "GPU"
                print("[render] using", kind, [d.name for d in matching])
                break
        except Exception:
            continue
    scene.cycles.device = device
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    for attr, value in (("view_transform", "Standard"), ("look", "None")):
        try:
            setattr(scene.view_settings, attr, value)
        except Exception as err:
            print("[render] view setting skipped:", attr, err)
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    return device


def render_to(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("[render] wrote", path)


def add_camera(scene, location, target, lens=85.0):
    cam = bpy.data.cameras.new("Camera")
    cam.lens = lens
    cam.sensor_width = 36.0
    ob = bpy.data.objects.new("Camera", cam)
    scene.collection.objects.link(ob)
    ob.location = location
    look_at(ob, target)
    scene.camera = ob
    return ob


def look_at(ob, target):
    direction = Vector(target) - Vector(ob.location)
    ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def area_light(scene, name, location, target, energy, size, size_y=None, color=(1.0, 1.0, 1.0)):
    light = bpy.data.lights.new(name, "AREA")
    light.energy = energy
    light.color = color
    light.size = size
    if size_y:
        light.shape = "RECTANGLE"
        light.size_y = size_y
    ob = bpy.data.objects.new(name, light)
    scene.collection.objects.link(ob)
    ob.location = location
    look_at(ob, target)
    return ob


def gradient_world(scene, stops, strength=1.0):
    """Studio-style backdrop for reflections: stops is a list of (position 0..1 from floor to ceiling, grey value)."""
    world = bpy.data.worlds.new("World")
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    rng = nt.nodes.new("ShaderNodeMapRange")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    rng.inputs["From Min"].default_value = -1.0
    rng.inputs["From Max"].default_value = 1.0
    elements = ramp.color_ramp.elements
    while len(elements) < len(stops):
        elements.new(0.5)
    for el, (pos, grey) in zip(elements, stops):
        el.position = pos
        el.color = (grey, grey, grey, 1.0)
    nt.links.new(coord.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs[2], rng.inputs["Value"])
    nt.links.new(rng.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    nt.links.new(bg.outputs[0], out.inputs["Surface"])
    return world


# ---------- materials ----------

def setv(node, names, value):
    """Set the first input that exists; Principled BSDF input names differ between Blender versions."""
    if isinstance(names, str):
        names = [names]
    for name in names:
        if name in node.inputs:
            node.inputs[name].default_value = value
            return True
    return False


def new_material(name):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    return mat, nt, bsdf


def plain(name, color, roughness=0.5, metallic=0.0, specular=0.5, coat=0.0, coat_roughness=0.05):
    mat, nt, bsdf = new_material(name)
    setv(bsdf, "Base Color", (color[0], color[1], color[2], 1.0))
    setv(bsdf, "Roughness", roughness)
    setv(bsdf, "Metallic", metallic)
    setv(bsdf, ["Specular IOR Level", "Specular"], specular)
    setv(bsdf, ["Coat Weight", "Clearcoat"], coat)
    setv(bsdf, ["Coat Roughness", "Clearcoat Roughness"], coat_roughness)
    return mat


def emission(name, color=(1.0, 1.0, 1.0), strength=1.0):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (color[0], color[1], color[2], 1.0)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return mat


def srgb(hex_color):
    """'#0f6b3c' -> linear RGB tuple, so a material matches the same hex on the website."""
    hex_color = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(hex_color[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


# ---------- meshes ----------

def mesh_object(scene, name, verts, faces, smooth=False, sharp_angle=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if smooth:
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        if sharp_angle is not None and hasattr(me, "set_sharp_from_angle"):
            try:
                me.set_sharp_from_angle(angle=math.radians(sharp_angle))
            except Exception as err:
                print("[mesh] sharp angle skipped:", err)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def box(scene, name, center, size, bevel=0.0):
    cx, cy, cz = center
    sx, sy, sz = (size[0] / 2.0, size[1] / 2.0, size[2] / 2.0)
    verts = [(cx + dx * sx, cy + dy * sy, cz + dz * sz)
             for dz in (-1, 1) for dy in (-1, 1) for dx in (-1, 1)]
    faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    ob = mesh_object(scene, name, verts, faces)
    if bevel > 0:
        add_bevel(ob, bevel)
    return ob


def add_bevel(ob, width, segments=3):
    mod = ob.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(40)
    try:
        mod.harden_normals = False
    except Exception:
        pass
    ob.data.polygons.foreach_set("use_smooth", [True] * len(ob.data.polygons))
    if hasattr(ob.data, "set_sharp_from_angle"):
        try:
            ob.data.set_sharp_from_angle(angle=math.radians(40))
        except Exception:
            pass
    return mod


def extrude_profile(scene, name, profile, length, axis="Y"):
    """Extrude a closed 2D outline (list of (a, b) points, counter-clockwise) along an axis, centred on it."""
    n = len(profile)
    half = length / 2.0

    def place(a, b, d):
        if axis == "Y":
            return (a, d, b)
        if axis == "Z":
            return (a, b, d)
        return (d, a, b)

    verts = [place(a, b, -half) for a, b in profile] + [place(a, b, half) for a, b in profile]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    ob = mesh_object(scene, name, verts, faces)
    # Normals depend on the axis mapping; let Blender make them consistent.
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def assign(ob, material):
    ob.data.materials.clear()
    ob.data.materials.append(material)


# ---------- images ----------

def read_pixels(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)
    return arr.reshape(h, w, 4)


def write_pixels(arr, path, file_format="WEBP", quality=86):
    h, w = arr.shape[0], arr.shape[1]
    img = bpy.data.images.new("out", w, h, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    img.filepath_raw = path
    img.file_format = file_format
    try:
        img.save(quality=quality)
    except TypeError:
        img.save()
    bpy.data.images.remove(img)
    print("[image] wrote", path, w, "x", h)


def convert(src_png, dst, quality=86):
    write_pixels(read_pixels(src_png), dst, "WEBP", quality)
