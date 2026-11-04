import bpy, math, os
from mathutils import Vector
root='/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line'
out='/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/recipe-board-v1/style-lab/banana-3d-proof/clonefield'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
bpy.ops.import_scene.gltf(filepath=root+'/work/recipe-board-v1/style-lab/engine/subjects/parts/banana.glb')
meshes=[o for o in scene.objects if o.type=='MESH']
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.join()
banana=bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# normalize size
dims=banana.dimensions; s=2.0/max(dims.x,dims.y,dims.z); banana.scale=(s,s,s)
bpy.ops.object.transform_apply(scale=True)
# decimate
m=banana.modifiers.new('dec','DECIMATE'); m.ratio=0.05
bpy.ops.object.modifier_apply(modifier=m.name)
# center at origin, then wireframe
bpy.context.view_layer.update()
mn=Vector((1e9,)*3); mx=Vector((-1e9,)*3)
for v in banana.bound_box:
    w=banana.matrix_world @ Vector(v); mn=Vector((min(mn[i],w[i]) for i in range(3))); mx=Vector((max(mx[i],w[i]) for i in range(3)))
c=(mn+mx)/2; banana.location=(-c.x,-c.y,-mn.z)
banana.rotation_euler=(math.radians(8),math.radians(-18),math.radians(24))
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# wireframe copy (linked duplicates): make wire object once
bpy.ops.object.duplicate()
wire=bpy.context.object
wf=wire.modifiers.new('wf','WIREFRAME'); wf.thickness=0.012; wf.use_even_offset=True
bpy.ops.object.modifier_apply(modifier=wf.name)
mat_w=bpy.data.materials.new('bone'); mat_w.use_nodes=True
bs=mat_w.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value=(0.86,0.82,0.72,1); bs.inputs['Roughness'].default_value=0.55; bs.inputs['Emission Color'].default_value=(0.86,0.82,0.72,1); bs.inputs['Emission Strength'].default_value=0.25
wire.data.materials.clear(); wire.data.materials.append(mat_w)
# solid orange single
bpy.context.view_layer.objects.active=banana
bpy.ops.object.duplicate()
solid=bpy.context.object
mat_o=bpy.data.materials.new('orange'); mat_o.use_nodes=True
bo=mat_o.node_tree.nodes['Principled BSDF']; bo.inputs['Base Color'].default_value=(0.92,0.27,0.08,1); bo.inputs['Roughness'].default_value=0.42
solid.data.materials.clear(); solid.data.materials.append(mat_o)
# hide originals
for o in (banana, wire, solid): o.hide_render=True; o.hide_viewport=True
# layout: wire clones grid, solid one at first
def place(obj, x, y, z, sc=1.0):
    o=obj.copy(); o.data=obj.data; scene.collection.objects.link(o); o.location=(x,y,z); o.scale=(sc,sc,sc); o.hide_render=False; o.hide_viewport=False; return o
# rows receding in +y, camera at -y
for r in range(1,9):
    for col in range(-5,6):
        x=col*2.4; y=r*3.2; z=0
        sc=0.72
        if r==1 and col==0:
            place(solid, x,y,z,sc)
        else:
            place(wire, x,y,z,sc)
# ground grid
bpy.ops.mesh.primitive_plane_add(size=80, location=(0,10,0))
g=bpy.context.object; mg=bpy.data.materials.new('ground'); mg.use_nodes=True
bg=mg.node_tree.nodes['Principled BSDF']; bg.inputs['Base Color'].default_value=(0.008,0.008,0.009,1); bg.inputs['Roughness'].default_value=0.35
g.data.materials.append(mg)
# faint grid lines using wireframe extra? skip
# camera
bpy.ops.object.camera_add(location=(0,-8.0,2.1))
cam=bpy.context.object; scene.camera=cam
cam.data.lens=40
empty=bpy.data.objects.new('focus',None); scene.collection.objects.link(empty); empty.location=(0,14,0.9)
con=cam.constraints.new(type='TRACK_TO'); con.target=empty; con.track_axis='TRACK_NEGATIVE_Z'; con.up_axis='UP_Y'
scene.frame_start=1; scene.frame_end=90
cam.location=(0,-8.0,2.1); cam.keyframe_insert(data_path='location', frame=1)
cam.location=(0,-1.2,1.7); cam.keyframe_insert(data_path='location', frame=90)
cam.data.dof.use_dof=True; cam.data.dof.aperture_fstop=2.8
cam.data.dof.focus_object=empty
# lights
def area(name,loc,en,size,col):
    bpy.ops.object.light_add(type='AREA', location=loc); L=bpy.context.object; L.name=name; L.data.energy=en; L.data.size=size; L.data.color=col; L.rotation_euler=(math.radians(50),0,0)
area('key',(-4,-4,6),900,4,(1.0,0.85,0.65))
area('rim',(3,10,3),1500,4,(1.0,0.35,0.15))
world=bpy.data.worlds.new('w'); scene.world=world; world.use_nodes=True; w=world.node_tree.nodes['Background']; w.inputs['Color'].default_value=(0.004,0.004,0.005,1); w.inputs['Strength'].default_value=1
scene.render.engine='BLENDER_EEVEE'
scene.eevee.taa_render_samples=24
scene.render.resolution_x=1920; scene.render.resolution_y=1080; scene.render.resolution_percentage=100
os.makedirs(out, exist_ok=True)
scene.render.filepath=out+'/f'
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
bpy.ops.render.render(animation=True)
print('OK')
