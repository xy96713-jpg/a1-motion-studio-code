import bpy, math, os, random
from mathutils import Vector
root='/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line'
out=root+'/work/recipe-board-v1/style-lab/banana-film/plates/b20'
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
bpy.ops.import_scene.gltf(filepath=root+'/work/recipe-board-v1/style-lab/engine/subjects/parts/banana.glb')
meshes=[o for o in scene.objects if o.type=='MESH']
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.join()
banana=bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
dims=banana.dimensions; s=2.0/max(dims.x,dims.y,dims.z); banana.scale=(s,s,s)
bpy.ops.object.transform_apply(scale=True)
m=banana.modifiers.new('dec','DECIMATE'); m.ratio=0.05
bpy.ops.object.modifier_apply(modifier=m.name)
rm=banana.modifiers.new('remesh','REMESH'); rm.mode='VOXEL'; rm.voxel_size=0.035
bpy.ops.object.modifier_apply(modifier=rm.name)
m2=banana.modifiers.new('dec2','DECIMATE'); m2.ratio=0.08
bpy.ops.object.modifier_apply(modifier=m2.name)
bpy.context.view_layer.update()
mn=Vector((1e9,)*3); mx=Vector((-1e9,)*3)
for v in banana.bound_box:
    w=banana.matrix_world @ Vector(v); mn=Vector((min(mn[i],w[i]) for i in range(3))); mx=Vector((max(mx[i],w[i]) for i in range(3)))
c=(mn+mx)/2; banana.location=(-c.x,-c.y,-mn.z)
banana.rotation_euler=(math.radians(8),math.radians(-18),math.radians(24))
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.duplicate(); wire=bpy.context.object
wf=wire.modifiers.new('wf','WIREFRAME'); wf.thickness=0.009; wf.use_even_offset=True
bpy.ops.object.modifier_apply(modifier=wf.name)
mat_w=bpy.data.materials.new('bone'); mat_w.use_nodes=True
bs=mat_w.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value=(0.86,0.82,0.72,1); bs.inputs['Roughness'].default_value=0.55; bs.inputs['Emission Color'].default_value=(0.86,0.82,0.72,1); bs.inputs['Emission Strength'].default_value=0.20
wire.data.materials.clear(); wire.data.materials.append(mat_w)
bpy.context.view_layer.objects.active=banana
bpy.ops.object.duplicate(); solid=bpy.context.object
mat_o=bpy.data.materials.new('orange'); mat_o.use_nodes=True
bo=mat_o.node_tree.nodes['Principled BSDF']; bo.inputs['Base Color'].default_value=(0.95,0.25,0.06,1); bo.inputs['Roughness'].default_value=0.42; bo.inputs['Emission Color'].default_value=(0.95,0.25,0.06,1); bo.inputs['Emission Strength'].default_value=0.15
solid.data.materials.clear(); solid.data.materials.append(mat_o)
for o in (banana,wire,solid): o.hide_render=True; o.hide_viewport=True
clones=[]
# only a few clones near camera, collapsing
idx=0
for r in range(1,5):
    for col in range(-3,4):
        x=col*2.4; y=r*2.6; z=0; sc=0.72
        if r==2 and col==0:
            o=solid.copy(); o.data=solid.data; scene.collection.objects.link(o); o.location=(x,y,z); o.scale=(sc,sc,sc); o.hide_render=False; o.hide_viewport=False
            o.keyframe_insert(data_path='scale', frame=1); o.scale=(sc*1.15,sc*1.15,sc*1.15); o.keyframe_insert(data_path='scale', frame=150)
        else:
            o=wire.copy(); o.data=wire.data; scene.collection.objects.link(o); o.location=(x,y,z); o.rotation_euler=(0,0,math.radians(random.uniform(-4,4))); o.scale=(sc,sc,sc); o.hide_render=False; o.hide_viewport=False
            start=20+idx*2; o.keyframe_insert(data_path='scale', frame=start); o.scale=(0.001,0.001,0.001); o.keyframe_insert(data_path='scale', frame=start+18)
            o.keyframe_insert(data_path='hide_render', frame=1); o.hide_render=True; o.keyframe_insert(data_path='hide_render', frame=100)
        clones.append(o); idx+=1
bpy.ops.mesh.primitive_plane_add(size=80, location=(0,8,0))
g=bpy.context.object; mg=bpy.data.materials.new('ground'); mg.use_nodes=True
bg=mg.node_tree.nodes['Principled BSDF']; bg.inputs['Base Color'].default_value=(0.008,0.008,0.009,1); bg.inputs['Roughness'].default_value=0.35
g.data.materials.append(mg)
bpy.ops.object.camera_add(location=(0,-6,2.2)); cam=bpy.context.object; scene.camera=cam; cam.data.lens=40
focus=bpy.data.objects.new('focus',None); scene.collection.objects.link(focus); focus.location=(0,8,0.9)
con=cam.constraints.new(type='TRACK_TO'); con.target=focus; con.track_axis='TRACK_NEGATIVE_Z'; con.up_axis='UP_Y'
cam.data.dof.use_dof=True; cam.data.dof.focus_object=focus; cam.data.dof.aperture_fstop=2.8
for f,loc in [(1,(0,-6,2.2)),(75,(0,-4,1.9)),(150,(0,-2.2,1.55))]:
    cam.location=loc; cam.keyframe_insert(data_path='location', frame=f)
def area(name,loc,en,size,col,rot=(50,0,0)):
    bpy.ops.object.light_add(type='AREA', location=loc); L=bpy.context.object; L.name=name; L.data.energy=en; L.data.size=size; L.data.color=col; L.rotation_euler=(math.radians(rot[0]),math.radians(rot[1]),math.radians(rot[2]))
area('key',(-4,-5,5),1800,4,(1.0,0.85,0.65))
area('rim',(3,8,3),2000,4,(1.0,0.32,0.12))
area('fill',(5,-3,3),450,4,(0.55,0.65,1.0))
world=bpy.data.worlds.new('w'); scene.world=world; world.use_nodes=True
w=world.node_tree.nodes['Background']; w.inputs['Color'].default_value=(0.004,0.004,0.005,1); w.inputs['Strength'].default_value=1
scene.render.engine='BLENDER_EEVEE'; scene.eevee.taa_render_samples=20
scene.render.resolution_x=1920; scene.render.resolution_y=1080; scene.render.resolution_percentage=100
scene.frame_start=1; scene.frame_end=150
scene.render.filepath=out+'/f'; scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'
bpy.ops.render.render(animation=True)
print('B20 DONE')
