import bpy
import math
from mathutils import Vector
from pathlib import Path

output = Path('/home/ubuntu/media-intelligence-platform-v2/public/assets/mip-mobius-logo.png')

# Reset scene.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    pass

# Build a one-sided Möbius surface: the seam reverses the width coordinate,
# which creates precisely one half twist when the loop closes.
segments_u = 192
segments_v = 28
radius = 1.25
half_width = 0.43
vertices = []
for i in range(segments_u + 1):
    u = (2 * math.pi * i) / segments_u
    for j in range(segments_v + 1):
        v = -half_width + (2 * half_width * j / segments_v)
        x = (radius + v * math.cos(u / 2)) * math.cos(u)
        y = (radius + v * math.cos(u / 2)) * math.sin(u)
        z = v * math.sin(u / 2)
        vertices.append((x, y, z))

faces = []
row = segments_v + 1
for i in range(segments_u):
    # The u=2π end row is geometrically coincident with the u=0 row in
    # reversed width order. Keeping the two rows explicit avoids a renderer
    # seam while retaining the visible, continuous half-twist topology.
    ni = i + 1
    for j in range(segments_v):
        faces.append((i * row + j, ni * row + j, ni * row + j + 1, i * row + j + 1))

mesh = bpy.data.meshes.new('mip_mobius_surface')
mesh.from_pydata(vertices, [], faces)
mesh.update()
strip = bpy.data.objects.new('MIP Möbius Strip', mesh)
bpy.context.collection.objects.link(strip)

# Smooth, continuous glass ribbon with a physically meaningful thickness.
for polygon in mesh.polygons:
    polygon.use_smooth = True

material = bpy.data.materials.new('Glass blue')
material.use_nodes = True
bsdf = material.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value = (0.26, 0.72, 1.0, 1.0)
bsdf.inputs['Metallic'].default_value = 0.18
bsdf.inputs['Roughness'].default_value = 0.14
if 'Transmission Weight' in bsdf.inputs:
    bsdf.inputs['Transmission Weight'].default_value = 0.52
if 'Coat Weight' in bsdf.inputs:
    bsdf.inputs['Coat Weight'].default_value = 0.28
bsdf.inputs['Alpha'].default_value = 0.92
# Blender 4.0 writes the PNG alpha directly from the transparent-film render.
strip.data.materials.append(material)

edge_material = bpy.data.materials.new('Cobalt edge')
edge_material.use_nodes = True
edge = edge_material.node_tree.nodes.get('Principled BSDF')
edge.inputs['Base Color'].default_value = (0.02, 0.22, 0.82, 1.0)
edge.inputs['Metallic'].default_value = 0.38
edge.inputs['Roughness'].default_value = 0.16
strip.data.materials.append(edge_material)

solidify = strip.modifiers.new('Glass ribbon thickness', 'SOLIDIFY')
solidify.thickness = 0.065
solidify.offset = 0
solidify.use_even_offset = True
solidify.material_offset = 1

bevel = strip.modifiers.new('Soft polished edges', 'BEVEL')
bevel.width = 0.028
bevel.segments = 3

# Camera aimed at the center with a slight elevated three-quarter view.
def track_to(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

camera_data = bpy.data.cameras.new('Camera')
camera = bpy.data.objects.new('Camera', camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (3.55, -5.75, 3.25)
track_to(camera, (0, 0, 0))
camera.data.lens = 58
bpy.context.scene.camera = camera

# Free-floating studio lights only; there is deliberately no floor or backdrop.
def area_light(name, location, energy, size, color):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = location
    track_to(light, (0, 0, 0))
    return light

area_light('Key', (2.5, -3.4, 5.5), 900, 4.0, (0.86, 0.95, 1.0))
area_light('Blue rim', (-3.7, 1.6, 2.6), 650, 3.0, (0.16, 0.52, 1.0))
area_light('Soft fill', (0.0, 4.0, 1.0), 360, 3.0, (0.48, 0.78, 1.0))

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1600
scene.render.resolution_y = 1600
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.render.image_settings.color_depth = '8'
scene.render.filepath = str(output)
scene.render.resolution_percentage = 100
scene.view_settings.look = 'AgX - Medium High Contrast'

# A transparent world leaves the full exterior and the interior opening alpha-clear.
scene.world.color = (0.0, 0.0, 0.0)
bpy.ops.wm.save_as_mainfile(filepath='/home/ubuntu/media-intelligence-platform-v2/verifier/mip-mobius-logo.blend')
bpy.ops.render.render(write_still=True)
print(f'Wrote {output}')
