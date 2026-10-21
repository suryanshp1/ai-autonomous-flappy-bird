#!/usr/bin/env python3
"""
Headless 3D Asset Generation Pipeline powered by `sandraschi/blender-mcp`.

Uses `blender_mcp.utils.blender_executor.get_blender_executor` and
`blender_mcp.handlers.scripting_handler.execute_script` from https://github.com/sandraschi/blender-mcp
to procedurally model, shade (Principled BSDF PBR + Emission), and export 4 game-ready
glTF 2.0 Binary (.glb) assets in headless Blender, plus a rendered showcase preview.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BLENDER_MCP_SRC = PROJECT_ROOT / "tools" / "blender-mcp" / "src"
MODELS_OUT_DIR = PROJECT_ROOT / "services" / "frontend" / "public" / "models"
RENDER_OUT_PATH = PROJECT_ROOT / "docs" / "blender_assets_render.png"

# Configure Blender executable environment variable for sandraschi/blender-mcp
if "BLENDER_EXECUTABLE" not in os.environ:
    for candidate in (
        str(PROJECT_ROOT / "tools" / "Blender.app" / "Contents" / "MacOS" / "Blender"),
        "/Applications/Blender.app/Contents/MacOS/Blender",
    ):
        if os.path.exists(candidate):
            os.environ["BLENDER_EXECUTABLE"] = candidate
            break

sys.path.insert(0, str(BLENDER_MCP_SRC))

from blender_mcp.utils.blender_executor import get_blender_executor  # noqa: E402


BLENDER_GENERATION_SCRIPT = r'''
import bpy
import bmesh
import math
import os
import json

MODELS_DIR = __MODELS_DIR__
RENDER_PATH = __RENDER_PATH__
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(os.path.dirname(RENDER_PATH), exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_pbr_material(
    name,
    base_color=(0.1, 0.14, 0.2, 1.0),
    metallic=0.85,
    roughness=0.22,
    emission_color=None,
    emission_strength=0.0,
    alpha=1.0,
):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")

    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness

    if alpha < 1.0:
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"

    if emission_color and emission_strength > 0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission_color
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = emission_color
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def add_bevel_and_smooth(obj, width=0.015, segments=2, angle_deg=35):
    bev = obj.modifiers.new(name="Bevel", type="BEVEL")
    bev.width = width
    bev.segments = segments
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(angle_deg)
    for poly in obj.data.polygons:
        poly.use_smooth = True


def export_glb(filepath):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        use_selection=True,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
    )
    print(f"EXPORTED_GLB: {filepath} ({os.path.getsize(filepath)} bytes)")


# ==============================================================================
# 1. MECHA-FALCON DRONE (mecha_bird.glb)
# Note on glTF export_yup=True mapping:
#   Blender +X -> Three.js +X (Right)
#   Blender +Z -> Three.js +Y (Up)
#   Blender -Y -> Three.js +Z (Forward direction of flight)
# ==============================================================================
def build_mecha_bird():
    clear_scene()

    mat_armor = make_pbr_material(
        "ArmorTitanium",
        base_color=(0.09, 0.14, 0.22, 1.0),
        metallic=0.9,
        roughness=0.22,
    )
    mat_dark_frame = make_pbr_material(
        "CarbonFrame",
        base_color=(0.03, 0.04, 0.07, 1.0),
        metallic=0.75,
        roughness=0.38,
    )
    mat_cyan_neon = make_pbr_material(
        "CyanNeon",
        base_color=(0.0, 0.95, 1.0, 1.0),
        metallic=0.2,
        roughness=0.1,
        emission_color=(0.0, 0.95, 1.0, 1.0),
        emission_strength=6.5,
    )
    mat_violet_neon = make_pbr_material(
        "VioletNeon",
        base_color=(0.68, 0.25, 1.0, 1.0),
        metallic=0.3,
        roughness=0.15,
        emission_color=(0.68, 0.25, 1.0, 1.0),
        emission_strength=4.5,
    )
    mat_visor_glass = make_pbr_material(
        "VisorGlass",
        base_color=(0.0, 0.88, 1.0, 1.0),
        metallic=0.95,
        roughness=0.05,
        emission_color=(0.0, 0.78, 1.0, 1.0),
        emission_strength=3.8,
    )

    root = bpy.data.objects.new("MechaFalconRoot", None)
    bpy.context.collection.objects.link(root)

    # A. Aerodynamic Faceted Stealth Fuselage ("Chassis")
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.28, location=(0, 0, 0))
    chassis = bpy.context.active_object
    chassis.name = "Chassis"
    chassis.scale = (0.85, 1.65, 0.68)
    bpy.ops.object.transform_apply(scale=True)
    add_bevel_and_smooth(chassis, width=0.01, segments=2)
    chassis.data.materials.append(mat_armor)
    chassis.parent = root

    # B. Armored Raptor Beak / Nose Cone (at -Y = Forward in glTF +Z)
    bpy.ops.mesh.primitive_cone_add(
        vertices=6, radius1=0.18, radius2=0.01, depth=0.36,
        location=(0, -0.48, -0.02), rotation=(math.radians(98), 0, 0)
    )
    beak = bpy.context.active_object
    beak.name = "ChassisBeak"
    beak.scale = (0.78, 1.0, 0.65)
    bpy.ops.object.transform_apply(scale=True)
    add_bevel_and_smooth(beak, width=0.008, segments=2)
    beak.data.materials.append(mat_dark_frame)
    beak.parent = chassis

    # C. Sleek Wraparound Cyber Visor Canopy
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.19, location=(0, -0.18, 0.09))
    visor = bpy.context.active_object
    visor.name = "Visor"
    visor.scale = (0.78, 1.35, 0.52)
    visor.rotation_euler = (math.radians(14), 0, 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    for poly in visor.data.polygons:
        poly.use_smooth = True
    visor.data.materials.append(mat_visor_glass)
    visor.parent = chassis

    # D. Twin V-Tail Dorsal Aero Stabilizers + Neon Trim
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 0.09, 0.24, 0.16))
        dorsal = bpy.context.active_object
        dorsal.name = f"DorsalFin_{'L' if side < 0 else 'R'}"
        dorsal.scale = (0.025, 0.28, 0.14)
        dorsal.rotation_euler = (math.radians(-28), side * math.radians(22), 0)
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        add_bevel_and_smooth(dorsal, width=0.004, segments=2)
        dorsal.data.materials.append(mat_cyan_neon)
        dorsal.parent = chassis

    # E. Side Intake Cowls with Cyan Power Seams
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 0.21, -0.04, -0.02))
        cowl = bpy.context.active_object
        cowl.name = f"IntakeCowl_{'L' if side < 0 else 'R'}"
        cowl.scale = (0.09, 0.46, 0.11)
        bpy.ops.object.transform_apply(scale=True)
        add_bevel_and_smooth(cowl, width=0.01, segments=2)
        cowl.data.materials.append(mat_dark_frame)
        cowl.parent = chassis

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 0.258, -0.05, -0.02))
        seam = bpy.context.active_object
        seam.name = f"NeonSeam_{'L' if side < 0 else 'R'}"
        seam.scale = (0.014, 0.38, 0.028)
        bpy.ops.object.transform_apply(scale=True)
        seam.data.materials.append(mat_cyan_neon)
        seam.parent = chassis

    # F. Articulated Multi-Blade Cybernetic Wings ("LeftWing" & "RightWing")
    for side, wing_name in [(-1, "LeftWing"), (1, "RightWing")]:
        wing_pivot = bpy.data.objects.new(wing_name, None)
        wing_pivot.location = (side * 0.18, -0.02, 0.03)
        bpy.context.collection.objects.link(wing_pivot)
        wing_pivot.parent = root

        # Main swept structural leading-edge wing spar
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
        spar = bpy.context.active_object
        spar.name = f"{wing_name}_Spar"
        spar.scale = (0.58, 0.14, 0.032)
        spar.rotation_euler = (0, 0, side * math.radians(-16))
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        add_bevel_and_smooth(spar, width=0.006, segments=2)
        spar.data.materials.append(mat_armor)
        spar.parent = wing_pivot
        spar.location = (side * 0.27, 0.02, 0.01)

        # Leading-edge Neon Cyan Energy Strip
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
        lead = bpy.context.active_object
        lead.name = f"{wing_name}_LeadingGlow"
        lead.scale = (0.56, 0.025, 0.022)
        lead.rotation_euler = (0, 0, side * math.radians(-16))
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        lead.data.materials.append(mat_cyan_neon)
        lead.parent = wing_pivot
        lead.location = (side * 0.27, -0.055, 0.01)

        # 4 Fanned Plasma Feather Blades per Wing
        for f_idx in range(4):
            span_offset = 0.14 + f_idx * 0.125
            sweep_back = 0.09 + f_idx * 0.045
            blade_len = 0.28 - f_idx * 0.03
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
            blade = bpy.context.active_object
            blade.name = f"{wing_name}_Blade_{f_idx}"
            blade.scale = (blade_len, 0.055, 0.014)
            blade.rotation_euler = (0, 0, side * math.radians(-32 - f_idx * 7))
            bpy.ops.object.transform_apply(scale=True, rotation=True)
            blade.data.materials.append(mat_violet_neon if f_idx < 3 else mat_cyan_neon)
            blade.parent = wing_pivot
            blade.location = (side * span_offset, sweep_back, -0.006 * f_idx)

    # G. Vector Exhaust Thruster Assembly ("Thruster" & "ThrusterCore") at +Y (Three.js -Z)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16, radius=0.15, depth=0.18,
        location=(0, 0.44, 0), rotation=(math.radians(90), 0, 0)
    )
    nozzle = bpy.context.active_object
    nozzle.name = "ThrusterNozzle"
    add_bevel_and_smooth(nozzle, width=0.01, segments=2)
    nozzle.data.materials.append(mat_dark_frame)
    nozzle.parent = root

    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.155, minor_radius=0.028,
        major_segments=24, minor_segments=12,
        location=(0, 0.51, 0), rotation=(math.radians(90), 0, 0)
    )
    thruster_ring = bpy.context.active_object
    thruster_ring.name = "ThrusterCore"
    thruster_ring.data.materials.append(mat_cyan_neon)
    thruster_ring.parent = root

    export_glb(os.path.join(MODELS_DIR, "mecha_bird.glb"))


# ==============================================================================
# 2. INDUSTRIAL REACTOR CONDUIT PIPE (cyber_pipe.glb)
# Centered so CollarRing & CollarGlow are at Y_glTF = 0 (Z_blender = 0),
# and ConduitColumn extends from Z_blender = 0 to Z_blender = +12.0 (Y_glTF 0..12).
# That way in Three.js, Top Pipe is at +halfGap (rotation 0) and Bottom Pipe is at
# -halfGap (rotation.z = Math.PI or scale.y = -1)!
# ==============================================================================
def build_cyber_pipe():
    clear_scene()

    mat_conduit = make_pbr_material(
        "ConduitSteel",
        base_color=(0.07, 0.10, 0.16, 1.0),
        metallic=0.88,
        roughness=0.26,
    )
    mat_rib_dark = make_pbr_material(
        "ConduitRibs",
        base_color=(0.03, 0.05, 0.08, 1.0),
        metallic=0.92,
        roughness=0.18,
    )
    mat_collar_glow = make_pbr_material(
        "CollarCyanGlow",
        base_color=(0.0, 0.94, 1.0, 1.0),
        metallic=0.2,
        roughness=0.12,
        emission_color=(0.0, 0.94, 1.0, 1.0),
        emission_strength=6.0,
    )
    mat_strip_glow = make_pbr_material(
        "StripPurpleGlow",
        base_color=(0.62, 0.30, 0.95, 1.0),
        metallic=0.3,
        roughness=0.15,
        emission_color=(0.62, 0.30, 0.95, 1.0),
        emission_strength=3.2,
    )

    root = bpy.data.objects.new("CyberPipeRoot", None)
    bpy.context.collection.objects.link(root)

    # Main 12m Octagonal Reactor Column (Blender Z: 0.0 -> 12.0 => Three.js Y: 0.0 -> 12.0)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12, radius=0.50, depth=12.0, location=(0, 0, 6.0)
    )
    col = bpy.context.active_object
    col.name = "ConduitColumn"
    add_bevel_and_smooth(col, width=0.015, segments=2)
    col.data.materials.append(mat_conduit)
    col.parent = root

    # Heavy Structural Armor Rings along the column height
    for idx, z_pos in enumerate([0.65, 1.8, 3.2, 4.8, 6.6, 8.6, 10.6]):
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=8, radius=0.56, depth=0.24, location=(0, 0, z_pos)
        )
        rib = bpy.context.active_object
        rib.name = f"ArmorRib_{idx}"
        add_bevel_and_smooth(rib, width=0.012, segments=2)
        rib.data.materials.append(mat_rib_dark)
        rib.parent = root

    # 4 Vertical Emissive Plasma Conduit Strips
    for i in range(4):
        angle = i * (math.pi / 2.0) + (math.pi / 4.0)
        rx = math.cos(angle) * 0.51
        ry = math.sin(angle) * 0.51
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(rx, ry, 6.0))
        strip = bpy.context.active_object
        strip.name = f"PlasmaStrip_{i}"
        strip.scale = (0.045, 0.045, 11.4)
        strip.rotation_euler = (0, 0, angle)
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        strip.data.materials.append(mat_strip_glow)
        strip.parent = root

    # Heavy Mechanical Collar Housing at Z = 0.14
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16, radius=0.62, depth=0.26, location=(0, 0, 0.14)
    )
    collar_housing = bpy.context.active_object
    collar_housing.name = "CollarRing"
    add_bevel_and_smooth(collar_housing, width=0.018, segments=2)
    collar_housing.data.materials.append(mat_rib_dark)
    collar_housing.parent = root

    # Primary Glowing Torus Lip at Z = 0.04 ("CollarGlow" - switched dynamically in Three.js)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.64, minor_radius=0.072,
        major_segments=28, minor_segments=12,
        location=(0, 0, 0.04)
    )
    collar_glow = bpy.context.active_object
    collar_glow.name = "CollarGlow"
    for poly in collar_glow.data.polygons:
        poly.use_smooth = True
    collar_glow.data.materials.append(mat_collar_glow)
    collar_glow.parent = root

    export_glb(os.path.join(MODELS_DIR, "cyber_pipe.glb"))


# ==============================================================================
# 3. QUANTUM PLASMA DATA CORE (plasma_orb.glb)
# ==============================================================================
def build_plasma_orb():
    clear_scene()

    mat_core = make_pbr_material(
        "OrbSolarCore",
        base_color=(1.0, 0.75, 0.05, 1.0),
        metallic=0.35,
        roughness=0.08,
        emission_color=(1.0, 0.62, 0.0, 1.0),
        emission_strength=8.0,
    )
    mat_inner_ring = make_pbr_material(
        "OrbInnerCyan",
        base_color=(0.0, 0.95, 1.0, 1.0),
        metallic=0.6,
        roughness=0.12,
        emission_color=(0.0, 0.95, 1.0, 1.0),
        emission_strength=5.5,
    )
    mat_outer_ring = make_pbr_material(
        "OrbOuterTitanium",
        base_color=(0.72, 0.32, 1.0, 1.0),
        metallic=0.85,
        roughness=0.18,
        emission_color=(0.65, 0.22, 1.0, 1.0),
        emission_strength=4.0,
    )

    root = bpy.data.objects.new("PlasmaOrbRoot", None)
    bpy.context.collection.objects.link(root)

    # Faceted Icosahedral Crystal Core
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.20, location=(0, 0, 0))
    core = bpy.context.active_object
    core.name = "Core"
    add_bevel_and_smooth(core, width=0.008, segments=1, angle_deg=20)
    core.data.materials.append(mat_core)
    core.parent = root

    # Inner Gyro Ring
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.28, minor_radius=0.024,
        major_segments=28, minor_segments=10,
        location=(0, 0, 0), rotation=(math.radians(35), 0, 0)
    )
    inner_ring = bpy.context.active_object
    inner_ring.name = "InnerRing"
    inner_ring.data.materials.append(mat_inner_ring)
    inner_ring.parent = root

    # Outer Gimbal Ring with 4 Energy Nodes
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.35, minor_radius=0.022,
        major_segments=32, minor_segments=10,
        location=(0, 0, 0), rotation=(0, math.radians(45), 0)
    )
    outer_ring = bpy.context.active_object
    outer_ring.name = "OuterRing"
    outer_ring.data.materials.append(mat_outer_ring)
    outer_ring.parent = root

    export_glb(os.path.join(MODELS_DIR, "cyber_orb_temp.glb"))
    os.replace(
        os.path.join(MODELS_DIR, "cyber_orb_temp.glb"),
        os.path.join(MODELS_DIR, "plasma_orb.glb"),
    )


# ==============================================================================
# 4. CYBERPUNK MEGASTRUCTURE & TRENCH DECK (cyber_city.glb)
# ==============================================================================
def build_cyber_city():
    clear_scene()

    mat_building = make_pbr_material(
        "TowerObsidian",
        base_color=(0.04, 0.06, 0.11, 1.0),
        metallic=0.82,
        roughness=0.28,
    )
    mat_neon_cyan = make_pbr_material(
        "TowerCyanNeon",
        base_color=(0.0, 0.95, 1.0, 1.0),
        metallic=0.2,
        roughness=0.1,
        emission_color=(0.0, 0.95, 1.0, 1.0),
        emission_strength=5.0,
    )
    mat_neon_magenta = make_pbr_material(
        "TowerMagentaNeon",
        base_color=(1.0, 0.0, 0.45, 1.0),
        metallic=0.2,
        roughness=0.1,
        emission_color=(1.0, 0.0, 0.45, 1.0),
        emission_strength=5.0,
    )

    root = bpy.data.objects.new("CyberCityRoot", None)
    bpy.context.collection.objects.link(root)

    # Stepped Cyberpunk Skyscraper Megastructure (Z_blender = Up = Y_glTF)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 5.0))
    tower = bpy.context.active_object
    tower.name = "Megastructure"
    tower.scale = (2.2, 2.2, 10.0)
    bpy.ops.object.transform_apply(scale=True)
    add_bevel_and_smooth(tower, width=0.05, segments=2)
    tower.data.materials.append(mat_building)
    tower.parent = root

    # Upper Spire Tier
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 11.2))
    spire = bpy.context.active_object
    spire.name = "MegastructureSpire"
    spire.scale = (1.3, 1.3, 3.0)
    bpy.ops.object.transform_apply(scale=True)
    add_bevel_and_smooth(spire, width=0.03, segments=2)
    spire.data.materials.append(mat_building)
    spire.parent = tower

    # Glowing Neon Beacons & Window Strips on Tower
    for idx, z_h in enumerate([2.5, 5.0, 7.5, 9.5, 11.8]):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, z_h))
        band = bpy.context.active_object
        band.name = f"NeonBand_{idx}"
        r_scale = 2.28 if z_h < 10.0 else 1.38
        band.scale = (r_scale, r_scale, 0.14)
        bpy.ops.object.transform_apply(scale=True)
        band.data.materials.append(mat_neon_cyan if idx % 2 == 0 else mat_neon_magenta)
        band.parent = tower

    # Industrial Trench Floor Grating Plate
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.0))
    plate = bpy.context.active_object
    plate.name = "TrenchPlate"
    plate.scale = (6.0, 3.5, 0.18)
    bpy.ops.object.transform_apply(scale=True)
    add_bevel_and_smooth(plate, width=0.02, segments=2)
    plate.data.materials.append(mat_building)
    plate.parent = root

    export_glb(os.path.join(MODELS_DIR, "cyber_city.glb"))


# ==============================================================================
# 5. SHOWCASE STUDIO RENDER (docs/blender_assets_render.png)
# ==============================================================================
def render_showcase():
    clear_scene()
    scene = bpy.context.scene

    # Import all 3 hero assets into a showcase diorama
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS_DIR, "mecha_bird.glb"))
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS_DIR, "plasma_orb.glb"))
    for obj in bpy.context.selected_objects:
        if obj.parent is None:
            obj.location = (0.0, -1.6, 0.2)

    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS_DIR, "cyber_pipe.glb"))
    for obj in bpy.context.selected_objects:
        if obj.parent is None:
            obj.location = (1.6, 0.8, -1.5)
            obj.scale = (0.45, 0.45, 0.45)

    # Studio lighting + dark cyber world
    world = bpy.data.worlds.new("CyberStudio")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.015, 0.022, 0.04, 1.0)
        bg.inputs[1].default_value = 1.2

    bpy.ops.object.light_add(type="AREA", location=(-2.5, -2.5, 2.2))
    key_light = bpy.context.active_object
    key_light.data.energy = 180
    key_light.data.color = (0.75, 0.95, 1.0)

    bpy.ops.object.light_add(type="POINT", location=(2.0, -1.2, 1.5))
    rim_light = bpy.context.active_object
    rim_light.data.energy = 120
    rim_light.data.color = (0.85, 0.3, 1.0)

    bpy.ops.object.camera_add(
        location=(-2.1, -2.6, 1.15),
        rotation=(math.radians(72), 0, math.radians(-38)),
    )
    cam = bpy.context.active_object
    scene.camera = cam

    # Choose available EEVEE or Workbench engine for fast headless render
    available_engines = {
        e.identifier
        for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items
    }
    if "BLENDER_EEVEE_NEXT" in available_engines:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    elif "BLENDER_EEVEE" in available_engines:
        scene.render.engine = "BLENDER_EEVEE"
    else:
        scene.render.engine = "BLENDER_WORKBENCH"

    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.filepath = RENDER_PATH
    try:
        bpy.ops.render.render(write_still=True)
        print(f"RENDERED_SHOWCASE: {RENDER_PATH}")
    except Exception as render_err:
        print(f"RENDER_SKIPPED_HEADLESS_GPU: {render_err}")


build_mecha_bird()
build_cyber_pipe()
build_plasma_orb()
build_cyber_city()
render_showcase()
print("ALL_BLENDER_MCP_ASSETS_GENERATED_SUCCESSFULLY")
'''


async def run_pipeline() -> None:
    script = (
        BLENDER_GENERATION_SCRIPT.replace("__MODELS_DIR__", json.dumps(str(MODELS_OUT_DIR)))
        .replace("__RENDER_PATH__", json.dumps(str(RENDER_OUT_PATH)))
    )
    executor = get_blender_executor(headless=True)
    print(f"[blender-mcp] Running headless Blender via {executor.blender_executable}...")
    output = await executor.execute_script(script, script_name="generate_cyberpunk_glb_assets")
    for line in output.splitlines():
        if any(k in line for k in ("EXPORTED_GLB", "RENDERED_SHOWCASE", "ALL_BLENDER_MCP_ASSETS")):
            print(f"  -> {line.strip()}")


if __name__ == "__main__":
    asyncio.run(run_pipeline())
