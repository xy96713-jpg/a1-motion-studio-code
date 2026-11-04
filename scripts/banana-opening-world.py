import bpy, math, random, os
from mathutils import Vector
root='/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line'
out=root+'/work/recipe-board-v1/style-lab/banana-opening/world'
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
# normalize to 2.4 units long
d=banana.dimensions; s=1.9/max(d.x,d.y,d.z); banana.scale=(s,s,s); bpy.ops.object.transform_apply(scale=True)
# center bottom on table
bpy.context.view_layer.update()
mn=Vector((1e9,)*3); mx=Vector((-1e9,)*3)
for v in banana.bound_box:
    w=banana.matrix_world @ Vector(v); mn=Vector((min(mn[i],w[i]) for i in range(3))); mx=Vector((max(mx[i],w[i]) for i in range(3)))
c=(mn+mx)/2; banana.location=(-c.x,-c.y,-mn.z)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# lie along X, slight tilt
banana.rotation_euler=(0,0,math.radians(12)); bpy.ops.object.transform_apply(rotation=True)
# materials
def mat(name,col,rough=.5,metal=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    b=m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value=(*col,1); b.inputs['Roughness'].default_value=rough; b.inputs['Metallic'].default_value=metal
    return m
mat_real=mat('banana_yellow',(0.95,0.72,0.12),0.44)
mat_bone=mat('plaster_bone',(0.86,0.82,0.74),0.62)
mat_orange=mat('resin_orange',(0.92,0.26,0.06),0.38)
def add_bump(m,scale,strength,distance):
    nt=m.node_tree; bs=nt.nodes['Principled BSDF']; tex=nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=scale; tex.inputs['Detail'].default_value=8; tex.inputs['Roughness'].default_value=.6; bump=nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=strength; bump.inputs['Distance'].default_value=distance; nt.links.new(tex.outputs['Fac'],bump.inputs['Height']); nt.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
add_bump(mat_real,5.0,.22,.02)
add_bump(mat_bone,14.0,.10,.008)
add_bump(mat_orange,7.0,.14,.012)
add_bump(mat('table',(0.012,0.012,0.014),0.22),2.2,.06,.005)
banana.data.materials.clear(); banana.data.materials.append(mat_real)
# clones along +X
clones=[]
for i in range(1,13):
    o=banana.copy(); o.data=banana.data.copy(); scene.collection.objects.link(o)
    o.location=(i*1.95,0.05*math.sin(i*1.7),0)
    o.rotation_euler=(math.radians(random.uniform(-2,2)),math.radians(random.uniform(-2,2)),math.radians(12+random.uniform(-8,8)))
    o.data.materials.clear(); o.data.materials.append(mat_orange if i==6 else mat_bone)
    start=1+i*40
    o.scale=(0.001,0.001,0.001); o.keyframe_insert(data_path='scale', frame=start)
    o.scale=(1,1,1); o.keyframe_insert(data_path='scale', frame=start+14)
    clones.append(o)
# table
bpy.ops.mesh.primitive_plane_add(size=90, location=(10,0,0))
table=bpy.context.object; table.data.materials.append(mat('table',(0.012,0.012,0.014),0.22))
# backdrop black world
world=bpy.data.worlds.new('w'); scene.world=world; world.use_nodes=True
w=world.node_tree.nodes['Background']; w.inputs['Color'].default_value=(0.002,0.002,0.003,1); w.inputs['Strength'].default_value=1
# key + rim
def area(name,loc,en,size,col,rot):
    bpy.ops.object.light_add(type='AREA', location=loc); L=bpy.context.object; L.data.energy=en; L.data.size=size; L.data.color=col; L.rotation_euler=rot
area('key',(5,-4,7),2200,6,(1.0,0.82,0.6),(math.radians(35),0,math.radians(20)))
area('rim',(12,7,4),1800,4,(1.0,0.3,0.1),(math.radians(70),0,math.radians(-30)))
area('fill',(-3,-6,3),300,5,(0.5,0.6,1.0),(math.radians(60),0,0))
# spot lights per clone, animate on
for i in range(13):
    bpy.ops.object.light_add(type='SPOT', location=(i*1.95,0,3.6))
    L=bpy.context.object; L.data.energy=0; L.data.color=(1.0,0.86,0.68); L.data.spot_size=math.radians(34); L.data.spot_blend=.45; L.data.shadow_soft_size=.25
    L.rotation_euler=(0,0,0)
    start=1+i*40
    L.data.energy=0; L.data.keyframe_insert(data_path='energy', frame=start)
    L.data.energy=2600; L.data.keyframe_insert(data_path='energy', frame=start+10)
# camera
bpy.ops.object.camera_add(location=(0.8,-5.5,2.0)); cam=bpy.context.object; scene.camera=cam; cam.data.lens=35
focus=bpy.data.objects.new('focus',None); scene.collection.objects.link(focus)
con=cam.constraints.new(type='TRACK_TO'); con.target=focus; con.track_axis='TRACK_NEGATIVE_Z'; con.up_axis='UP_Y'
cam.data.dof.use_dof=True; cam.data.dof.focus_object=focus; cam.data.dof.aperture_fstop=2.4
for f,loc,tgt in [(1,(0.4,-5.5,2.0),(0.9,0,0.95)),(90,(1.4,-5.0,2.2),(2.0,0,0.95)),(240,(3.2,-5.2,2.3),(4.2,0,0.95)),(600,(9.6,-5.2,2.5),(9.6,0,0.95))]:
    cam.location=loc; cam.keyframe_insert(data_path='location', frame=f)
    focus.location=tgt; focus.keyframe_insert(data_path='location', frame=f)
scene.frame_start=1; scene.frame_end=600
scene.render.engine='BLENDER_EEVEE'; scene.eevee.taa_render_samples=16
scene.render.resolution_x=1920; scene.render.resolution_y=1080; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'
scene.render.image_settings.file_format='PNG'
if os.environ.get('TEST'):
    for f in (1,90,240,600):
        scene.frame_set(f); scene.render.filepath=root+'/tmp/op-'+str(f)+'.png'; bpy.ops.render.render(write_still=True)
else:
    scene.render.filepath=out+'/f'; bpy.ops.render.render(animation=True)
print('TEST DONE')
