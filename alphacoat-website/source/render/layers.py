"""Renders the coating cutaway for "How the coats work together": a steel plate, then primer, then topcoat.

  blender --background --factory-startup --python layers.py -- <test|full> <work-folder> <site-img-folder>

Three pictures from the same camera, each adding one coat. The website shows them one over the other.
Film thickness is exaggerated on purpose so the layers can be seen.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as c  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = argv[0] if argv else "test"
WORK = argv[1] if len(argv) > 1 else os.path.join(HERE, "out")
SITE = argv[2] if len(argv) > 2 else os.path.join(HERE, "out")
os.makedirs(WORK, exist_ok=True)
os.makedirs(SITE, exist_ok=True)

W, H = 1300, 900
LENGTH, DEPTH = 0.62, 0.44      # plate, in metres
PRIMER_SHARE, TOP_SHARE = 0.74, 0.47


def textured(name, color, roughness, metallic, grain_scale, bump, speckle=0.0):
    """A surface with fine grain: blasted steel, or the zinc dust in a primer."""
    mat, nt, bsdf = c.new_material(name)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = grain_scale
    noise.inputs["Detail"].default_value = 4.0
    bmp = nt.nodes.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = bump
    bmp.inputs["Distance"].default_value = 0.002
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs[0], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
    if speckle > 0:
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        lo = [v * (1.0 - speckle) for v in color]
        hi = [v * (1.0 + speckle) for v in color]
        ramp.color_ramp.elements[0].position = 0.35
        ramp.color_ramp.elements[0].color = (lo[0], lo[1], lo[2], 1.0)
        ramp.color_ramp.elements[1].position = 0.65
        ramp.color_ramp.elements[1].color = (hi[0], hi[1], hi[2], 1.0)
        nt.links.new(noise.outputs[0], ramp.inputs[0])
        nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        c.setv(bsdf, "Base Color", (color[0], color[1], color[2], 1.0))
    c.setv(bsdf, "Roughness", roughness)
    c.setv(bsdf, "Metallic", metallic)
    return mat


def main():
    scene = c.reset()
    test = MODE == "test"
    c.setup_cycles(scene, W if not test else 780, H if not test else 540, samples=64 if test else 240, transparent=True)

    steel_t, primer_t, top_t = 0.05, 0.013, 0.011
    steel = c.box(scene, "Steel", (0, 0, -steel_t / 2), (LENGTH, DEPTH, steel_t), bevel=0.0025)
    c.assign(steel, textured("Steel", (0.36, 0.38, 0.41), roughness=0.48, metallic=1.0, grain_scale=900.0, bump=0.3))

    primer_len = LENGTH * PRIMER_SHARE
    primer = c.box(scene, "Primer", (-LENGTH / 2 + primer_len / 2, 0, primer_t / 2), (primer_len, DEPTH, primer_t), bevel=0.004)
    c.assign(primer, textured("Primer", (0.4, 0.47, 0.42), roughness=0.85, metallic=0.25, grain_scale=1400.0, bump=0.12, speckle=0.09))

    top_len = LENGTH * TOP_SHARE
    top = c.box(scene, "Topcoat", (-LENGTH / 2 + top_len / 2, 0, primer_t + top_t / 2), (top_len, DEPTH, top_t), bevel=0.004)
    c.assign(top, c.plain("Topcoat", c.srgb("#0f6b3c"), roughness=0.07, coat=1.0, coat_roughness=0.03))

    ground = c.box(scene, "Ground", (0, 0, -steel_t - 0.001), (4.0, 4.0, 0.002))
    ground.is_shadow_catcher = True

    # Orthographic view from the front right, so the stepped ends of the coats face the viewer.
    target = Vector((0.03, 0.0, -0.012))
    view = Vector((0.6, -0.8, 0.56)).normalized()
    cam = bpy.data.cameras.new("Camera")
    cam.type = "ORTHO"
    cam.ortho_scale = 0.9
    cam_ob = bpy.data.objects.new("Camera", cam)
    scene.collection.objects.link(cam_ob)
    cam_ob.location = target + view * 3.0
    c.look_at(cam_ob, target)
    scene.camera = cam_ob

    c.gradient_world(scene, [(0.0, 0.08), (0.5, 0.22), (1.0, 0.55)], strength=0.5)
    c.area_light(scene, "Key", (0.9, -0.7, 1.3), target, energy=13, size=1.1)
    c.area_light(scene, "Fill", (-1.0, -1.0, 0.6), target, energy=3.5, size=1.0)
    # A long strip light placed where the camera sees its reflection in the topcoat: the band of shine that says "gloss".
    mirror = Vector((-view.x, -view.y, view.z))
    c.area_light(scene, "Shine", tuple(Vector((-0.12, 0.0, 0.03)) + mirror * 1.6), (-0.12, 0.0, 0.03), energy=0.42, size=0.9, size_y=0.035)

    # The ground shadow is rendered on its own, with the plate switched to a holdout so that no light bounces
    # off it onto the ground. Bounce light can only brighten, which a see-through picture cannot store; left in,
    # it showed up on the page as a pale box around the plate.
    for ob in (steel, primer, top):
        ob.is_holdout = True
    shadow_path = os.path.join(WORK, "layers-shadow.png")
    c.render_to(scene, shadow_path)
    shadow = c.read_pixels(shadow_path)[..., 3:4] * 0.85
    for ob in (steel, primer, top):
        ob.is_holdout = False
    ground.hide_render = True

    for stage, hidden in ((1, (primer, top)), (2, (top,)), (3, ())):
        primer.hide_render = primer in hidden
        top.hide_render = top in hidden
        path = os.path.join(WORK, "layers-%d.png" % stage)
        c.render_to(scene, path)
        px = c.read_pixels(path)
        alpha = px[..., 3:4]
        under = shadow * (1.0 - alpha)                 # shadow only where the plate does not cover it
        out_alpha = alpha + under
        out = px.copy()
        out[..., :3] = px[..., :3] * alpha / np.maximum(out_alpha, 1e-5)
        out[..., 3:4] = out_alpha
        if not test:
            c.write_pixels(out, os.path.join(SITE, "stage-%d.webp" % stage), quality=88)


main()
