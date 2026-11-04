import bpy, math, sys, os
from mathutils import Vector
argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
out=argv[0] if argv else '/tmp/bscene'
res=(int(argv[1]) if len(argv)>1 else 1920, int(argv[2]) if len(argv)>2 else 1080)
samples=int(argv[3]) if len(argv)>3 else 48
variant=int(argv[4]) if len(argv)>4 else 1
root='/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
# banana
bpy.ops.import_scene.gltf(filepath=root+'/work/recipe-board-v1/style-lab/engine/subjects/parts/banana.glb')
meshes=[o for o in scene.objects if o.type=='MESH']
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.join()
banana=bpy.context.view_layer.objects.active
# normalize: max dimension 3.2, sit on ground at origin, rotate to a nice diagonal
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
dims=banana.dimensions
s=3.2/max(dims.x,dims.y,dims.z)
banana.scale=(s,s,s)
bpy.ops.object.transform_apply(scale=True)
bpy.context.view_layer.update()
mn=Vector((1e9,1e9,1e9)); mx=Vector((-1e9,-1e9,-1e9))
for v in banana.bound_box:
    w=banana.matrix_world @ Vector(v)
    mn=Vector((min(mn[i],w[i]) for i in range(3))); mx=Vector((max(mx[i],w[i]) for i in range(3)))
c=(mn+mx)/2
banana.location=( -c.x, -c.y, -mn.z)
banana.rotation_euler=(math.radians(6), math.radians(-12), math.radians(18))
banana.location.x += 0.95
banana.location.z += 0.06
# warm banana material
mb=bpy.data.materials.new('banana'); mb.use_nodes=True
bb=mb.node_tree.nodes['Principled BSDF']; bb.inputs['Base Color'].default_value=(0.82,0.62,0.12,1); bb.inputs['Roughness'].default_value=0.48; bb.inputs['Subsurface Weight'].default_value=0.05
banana.data.materials.clear(); banana.data.materials.append(mb)
# ground
bpy.ops.mesh.primitive_plane_add(size=40, location=(0,0,0))
ground=bpy.context.object; ground.name='ground'
mat=bpy.data.materials.new('ground'); mat.use_nodes=True
bsdf=mat.node_tree.nodes['Principled BSDF']; bsdf.inputs['Base Color'].default_value=(0.045,0.04,0.035,1); bsdf.inputs['Roughness'].default_value=0.62
ground.data.materials.append(mat)
bpy.ops.mesh.primitive_plane_add(size=40, location=(0,4.0,10), rotation=(math.radians(90),0,0))
back=bpy.context.object; back.name='backdrop'
matb=bpy.data.materials.new('backdrop'); matb.use_nodes=True
bs=matb.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value=(0.035,0.031,0.028,1); bs.inputs['Roughness'].default_value=0.8
back.data.materials.append(matb)
# type behind banana (3D)
bpy.ops.object.text_add(location=(-3.4,1.9,0.03))
txt=bpy.context.object
txt.data.body='同一棵香蕉'
fnt=bpy.data.fonts.load(root+'/work/recipe-board-v1/fonts/house/derived/kokka-mincho-tall-72.ttf')
txt.data.font=fnt
txt.data.size=3.6
txt.data.extrude=0.07
txt.data.bevel_depth=0.02
txt.rotation_euler=(math.radians(90),0,math.radians(-10))
mat2=bpy.data.materials.new('type'); mat2.use_nodes=True
b2=mat2.node_tree.nodes['Principled BSDF']; b2.inputs['Base Color'].default_value=(0.88,0.82,0.72,1); b2.inputs['Roughness'].default_value=0.52
b2.inputs['Emission Color'].default_value=(0.88,0.82,0.72,1); b2.inputs['Emission Strength'].default_value=0.06
txt.data.materials.append(mat2)
# lights
def area(name, loc, energy, size, color):
    bpy.ops.object.light_add(type='AREA', location=loc)
    L=bpy.context.object; L.name=name; L.data.energy=energy; L.data.size=size; L.data.color=color
    return L
key=area('key',(-4,-3.5,4.5),1400,4.0,(1.0,0.78,0.55)); key.rotation_euler=(math.radians(52),0,math.radians(-38))
fill=area('fill',(4.5,-2.5,2.6),380,3.5,(0.68,0.8,1.0)); fill.rotation_euler=(math.radians(68),0,math.radians(48))
rim=area('rim',(0.5,4.0,3.4),900,2.5,(1.0,0.62,0.38)); rim.rotation_euler=(math.radians(110),0,0)
# world
world=bpy.data.worlds.new('w'); scene.world=world; world.use_nodes=True
bg=world.node_tree.nodes['Background']; bg.inputs['Color'].default_value=(0.012,0.012,0.014,1); bg.inputs['Strength'].default_value=1.0
# camera
bpy.ops.object.camera_add(location=((2.8,-6.6,2.1) if variant==1 else (4.4,-5.2,1.5)))
cam=bpy.context.object; scene.camera=cam
target=Vector(((-0.3,0,0.95) if variant==1 else (0.1,0,0.85)))
d=target-cam.location
cam.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
cam.data.lens=(55 if variant==1 else 70)
cam.data.dof.use_dof=True; cam.data.dof.aperture_fstop=3.2
empty=bpy.data.objects.new('focus',None); scene.collection.objects.link(empty); empty.location=(0,0,1.3)
cam.data.dof.focus_object=empty
# render
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=samples
scene.cycles.use_denoising=True
scene.render.resolution_x=res[0]; scene.render.resolution_y=res[1]; scene.render.resolution_percentage=100
scene.render.film_transparent=False
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.render.filepath=out
bpy.ops.render.render(write_still=True)
print('RENDERED', out)
