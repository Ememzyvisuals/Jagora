"""Photoreal, brandless devices for the Jagora landing page, modelled and rendered with Blender (bpy, Cycles CPU).
   python3 render-devices.py <hero|phones> <width> <samples> <out.png>
   python3 render-devices.py export 0 0 <out_dir>     the device shells as GLB for the interactive three.js scene
   Units: 1 = 1 cm. The background is transparent with a shadow catcher, so the PNG sits on the sky page."""
import bpy, bmesh, math, sys
from mathutils import Vector

SCENE, WIDTH, SAMPLES, OUT = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
import os
SHOTS = os.environ.get("SHOTS_DIR", "./")  # PNG copies of public/shots/hd/*.webp
PI = math.pi

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.cycles.use_adaptive_sampling = True
sc.cycles.adaptive_threshold = 0.03
try:
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
except Exception:
    pass
sc.cycles.max_bounces = 6
sc.cycles.glossy_bounces = 3
sc.cycles.transmission_bounces = 2
sc.render.film_transparent = True
sc.view_settings.view_transform = "Standard"
sc.view_settings.look = "None"
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sc.render.threads_mode = "FIXED"
sc.render.threads = 2

# ---------- helpers ----------

def rrect_pts(w, h, r, seg=10):
    pts = []
    for cx, cy, a0 in [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)]:
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def slab(name, w, h, d, r, bevel=0.0, seg=12, mat=None, bevel_seg=4):
    """rounded rectangle in XY, thickness d along +Z (from 0 to d), optional chamfer on the edges"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0)) for x, y in rrect_pts(w, h, r, seg)]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z += d
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if bevel > 0:
        m = ob.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = bevel_seg
        m.limit_method = "ANGLE"
        m.angle_limit = math.radians(40)
        m.harden_normals = False
    for p in me.polygons:
        p.use_smooth = True
    if mat:
        me.materials.append(mat)
    return ob

def plane(name, w, h, r, mat, seg=10):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    pts = rrect_pts(w, h, r, seg) if r > 0 else [(w / 2, h / 2), (-w / 2, h / 2), (-w / 2, -h / 2), (w / 2, -h / 2)]
    vs = [bm.verts.new((x, y, 0)) for x, y in pts]
    bm.faces.new(vs)
    uv = bm.loops.layers.uv.new()
    for face in bm.faces:
        for loop in face.loops:
            x, y, _ = loop.vert.co
            loop[uv].uv = (x / w + 0.5, y / h + 0.5)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat)
    return ob

def disc(name, r, mat, seg=32):
    bpy.ops.mesh.primitive_circle_add(vertices=seg, radius=r, fill_type="NGON")
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    return ob

def parent(child, par):
    child.parent = par

def mat(name, color, metal=0.0, rough=0.5, coat=0.0, coat_rough=0.05, aniso=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = coat_rough
    if aniso:
        b.inputs["Anisotropic"].default_value = aniso
    b.inputs["Specular IOR Level"].default_value = spec
    return m

def screen_mat(name, img_path, strength=1.0):
    """the real screenshot as light, under a glossy glass coat that reflects the studio"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0, 0, 0, 1)
    b.inputs["Roughness"].default_value = 0.35
    b.inputs["Coat Weight"].default_value = 0.35
    b.inputs["Coat Roughness"].default_value = 0.04
    b.inputs["Coat IOR"].default_value = 1.45
    b.inputs["Specular IOR Level"].default_value = 0.0
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(img_path)
    tex.interpolation = "Cubic"
    nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = strength
    return m

def lin(h):  # sRGB hex to linear
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

ALU = mat("alu", lin("17181b"), metal=0.55, rough=0.36, coat=0.25, coat_rough=0.3)  # deep satin black body
ALU_DARK = mat("alu_dark", lin("0d0e10"), metal=0.3, rough=0.08, coat=1.0, coat_rough=0.05)  # black glass trackpad, hinge
KEY = mat("key", lin("0b0c0e"), metal=0.0, rough=0.5, spec=0.35)
WELL = mat("well", lin("08090a"), metal=0.2, rough=0.6)
BEZEL = mat("bezel", lin("050506"), metal=0.0, rough=0.08, coat=1.0, coat_rough=0.02)
LENS = mat("lens", lin("0b0d12"), metal=0.3, rough=0.05, coat=1.0)
LENS_RING = mat("lens_ring", lin("2a2d33"), metal=1.0, rough=0.25)
GRAPHITE = mat("graphite", lin("1c1d21"), metal=0.85, rough=0.22)  # black rails
GRAPHITE_BACK = mat("graphite_back", lin("2a2d33"), metal=0.0, rough=0.32, coat=0.8, coat_rough=0.2)
SILVER = mat("silver", lin("1c1d21"), metal=0.85, rough=0.22)  # black too, to match the laptop
SILVER_BACK = mat("silver_back", lin("15161a"), metal=0.0, rough=0.3, coat=0.8, coat_rough=0.2)
FLASH = mat("flash", lin("f3ead2"), rough=0.3)

# ---------- the laptop ----------

def laptop(shot, open_deg=112):
    W, D, T, R = 30.4, 21.3, 1.05, 1.1
    root = bpy.data.objects.new("laptop", None)
    bpy.context.collection.objects.link(root)
    base = slab("base", W, D, T, R, bevel=0.22, mat=ALU)
    parent(base, root)
    # keyboard well and keys
    kbW, kbD = 27.2, 11.2
    kb_y = D / 2 - 2.0 - kbD / 2
    well = plane("well", kbW + 0.5, kbD + 0.5, 0.35, WELL)
    well.location = (0, kb_y, T + 0.002)
    parent(well, root)
    rows = [
        [(1, "")] * 14,
        [(1, "")] * 13 + [(1.5, "")],
        [(1.5, "")] + [(1, "")] * 13,
        [(1.75, "")] + [(1, "")] * 11 + [(1.75, "")],
        [(2.25, "")] + [(1, "")] * 10 + [(2.25, "")],
        [(1, "")] * 4 + [(5.5, "")] + [(1, "")] * 5,
    ]
    u = kbW / 14.5
    heights = [0.62, 1, 1, 1, 1, 1]
    keymesh = None
    y = kb_y + kbD / 2
    for ri, row in enumerate(rows):
        h = heights[ri] * u * 0.92
        total = sum(k for k, _ in row)
        x = -kbW / 2 + (kbW - total * u) / 2
        for k, _ in row:
            kw = k * u - 0.18
            key = slab("key", kw, h - 0.18, 0.12, 0.16, bevel=0.04, seg=4, mat=KEY, bevel_seg=2)
            key.location = (x + k * u / 2, y - h / 2, T + 0.01)
            parent(key, root)
            x += k * u
        y -= h
    pad = plane("pad", 12.0, 7.4, 0.6, ALU_DARK)
    pad.location = (0, -D / 2 + 1.4 + 3.7, T + 0.003)
    parent(pad, root)
    # hinge barrel
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.42, depth=W * 0.8, rotation=(0, PI / 2, 0), location=(0, D / 2 - 0.35, T * 0.55))
    barrel = bpy.context.object
    barrel.data.materials.append(ALU_DARK)
    bpy.ops.object.shade_smooth()
    parent(barrel, root)
    # the lid on its hinge: built flat in XY (screen facing +Z), then stood up
    LH, LT = 20.4, 0.48
    hinge = bpy.data.objects.new("hinge", None)
    bpy.context.collection.objects.link(hinge)
    hinge.location = (0, D / 2 - 0.25, T * 0.6)
    parent(hinge, root)
    lid = bpy.data.objects.new("lid", None)
    bpy.context.collection.objects.link(lid)
    parent(lid, hinge)
    shell = slab("lid_shell", W, LH, LT, R, bevel=0.16, mat=ALU)
    shell.location = (0, LH / 2, -LT)
    parent(shell, lid)
    bez = plane("bezel", W - 0.35, LH - 0.35, R - 0.15, BEZEL)
    bez.location = (0, LH / 2, 0.004)
    parent(bez, lid)
    sw = W - 1.2
    shh = sw / 1.6
    scr = plane("screen", sw, shh, 0.15, screen_mat("lap_screen", SHOTS + shot + ".png", 1.0))
    scr.location = (0, LH - 1.05 - shh / 2, 0.009)
    parent(scr, lid)
    cam = disc("cam", 0.11, LENS)
    cam.location = (0, LH - 0.55, 0.012)
    parent(cam, lid)
    ring = disc("cam_ring", 0.18, LENS_RING)
    ring.location = (0, LH - 0.55, 0.008)
    parent(ring, lid)
    # stand it up: rotate so the screen faces -Y (towards the front), leaning back by open_deg
    lid.rotation_euler = (PI / 2, 0, 0)  # XY plane -> XZ plane, screen facing -Y
    lid.location = (0, 0, 0)
    hinge.rotation_euler = (-math.radians(open_deg - 90), 0, 0)
    return root

# ---------- a phone ----------

def phone(shot, finish="graphite"):
    W, H, T, R = 7.16, 15.5, 0.78, 1.05
    frame = GRAPHITE if finish == "graphite" else SILVER
    backm = GRAPHITE_BACK if finish == "graphite" else SILVER_BACK
    root = bpy.data.objects.new("phone_" + finish, None)
    bpy.context.collection.objects.link(root)
    body = slab("phone_body", W, H, T, R, bevel=0.2, mat=frame, bevel_seg=6)
    parent(body, root)
    front = plane("phone_front", W - 0.2, H - 0.2, R - 0.1, BEZEL)
    front.location = (0, 0, T + 0.004)
    parent(front, root)
    bz = 0.24
    sw = W - 2 * bz
    shh = sw / (1170 / 2532)
    if shh > H - 2 * bz:
        shh = H - 2 * bz
    scr = plane("phone_screen", sw, shh, R - 0.25, screen_mat("ph_screen_" + shot, SHOTS + shot + ".png", 1.0))
    scr.location = (0, 0, T + 0.008)
    parent(scr, root)
    hole = disc("punch", 0.17, BEZEL)
    hole.location = (0, shh / 2 - 0.42, T + 0.012)
    parent(hole, root)
    hl = disc("punch_lens", 0.07, LENS)
    hl.location = (0.02, shh / 2 - 0.4, T + 0.014)
    parent(hl, root)
    back = plane("phone_back", W - 0.3, H - 0.3, R - 0.15, backm)
    back.rotation_euler = (PI, 0, 0)
    back.location = (0, 0, -0.004)
    parent(back, root)
    # side buttons on the right rail
    for yy, ln in [(3.3, 2.2), (0.6, 1.1)]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(W / 2 + 0.03, yy, T / 2))
        b = bpy.context.object
        b.scale = (0.14, ln, 0.28)
        bv = b.modifiers.new("b", "BEVEL"); bv.width = 0.06; bv.segments = 3
        b.data.materials.append(frame)
        bpy.ops.object.shade_smooth()
        parent(b, root)
    return root

# ---------- studio ----------

def studio():
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "LINEAR"
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value = (0, -PI / 2, 0)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*lin("cfe4fb"), 1)
    ramp.color_ramp.elements[1].color = (*lin("ffffff"), 1)
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.3

    def area(name, loc, size, energy, color=(1, 1, 1), target=(0, 0, 0)):
        bpy.ops.object.light_add(type="AREA", location=loc)
        L = bpy.context.object
        L.name = name
        L.data.size = size
        L.data.energy = energy
        L.data.color = color
        d = Vector(target) - Vector(loc)
        L.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return L
    area("key", (-40, -45, 60), 45, 42000)
    area("fill", (55, -30, 25), 40, 12000, (0.9, 0.95, 1.0))
    area("rim", (10, 60, 35), 30, 52000, (0.92, 0.96, 1.0))
    area("top", (0, 0, 80), 60, 9000)
    # the table: catches shadows only
    bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, 0))
    floor = bpy.context.object
    floor.is_shadow_catcher = True

def camera(loc, target, lens=50):
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.object
    d = Vector(target) - Vector(loc)
    c.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    c.data.lens = lens
    sc.camera = c
    return c

if SCENE == "export":
    # one GLB per shell, centred, in Blender's own axes (Z up, export_yup off): the scene places them itself
    import os
    os.makedirs(OUT, exist_ok=True)
    parts = {
        "laptop-base": lambda: slab("laptop-base", 30.4, 21.3, 1.05, 1.1, bevel=0.22, mat=ALU),
        "laptop-lid": lambda: slab("laptop-lid", 30.4, 20.4, 0.48, 1.1, bevel=0.16, mat=ALU),
        "phone-body": lambda: slab("phone-body", 7.16, 15.5, 0.78, 1.05, bevel=0.2, mat=GRAPHITE, bevel_seg=6),
    }
    for name, make in parts.items():
        bpy.ops.object.select_all(action="DESELECT")
        ob = make()
        ob.location = (0, 0, -ob.dimensions.z / 2 if False else 0)
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.modifier_apply(modifier="bevel")
        me = ob.data
        # centre it on its own middle (the slab is built from z=0 up)
        zs = [v.co.z for v in me.vertices]
        mid = (min(zs) + max(zs)) / 2
        for v in me.vertices:
            v.co.z -= mid
        kw = dict(filepath=os.path.join(OUT, name + ".glb"), use_selection=True, export_format="GLB", export_yup=False, export_apply=True, export_materials="NONE", export_normals=True, export_texcoords=False)
        try:
            bpy.ops.export_scene.gltf(**kw, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7)
        except Exception as e:  # no Draco library: plain GLB
            print("draco off:", e)
            bpy.ops.export_scene.gltf(**kw)
        bpy.data.objects.remove(ob)
        print("exported", name)
    sys.exit(0)

studio()
if SCENE == "hero":
    L = laptop("desktop-register")
    L.rotation_euler = (0, 0, math.radians(-14))
    L.location = (-4, 0, 0)
    P = phone("phone-register", "graphite")
    # the phone stands on its bottom edge, leaning back a little, to the right and in front of the laptop
    P.rotation_euler = (math.radians(80), 0, math.radians(-12))
    P.location = (17.5, -9.5, 7.75 * math.sin(math.radians(78)) * 0 + 0.0)
    # lift so its bottom edge touches the table: the body is centred on its origin in Y, so move up by half its height
    P.location.z = 15.5 / 2 * math.sin(math.radians(80)) + 0.9
    sc.render.resolution_x = WIDTH
    sc.render.resolution_y = int(WIDTH * 0.6)
    camera((4, -84, 40), (4, 0, 9), lens=55)
elif SCENE == "phones":
    A = phone("phone-register", "graphite")
    A.rotation_euler = (math.radians(82), 0, math.radians(8))
    A.location = (-4.6, 0, 15.5 / 2 * math.sin(math.radians(82)) + 0.9)
    B = phone("phone-doc", "silver")
    B.rotation_euler = (math.radians(82), 0, math.radians(-8))
    B.location = (4.8, 4.5, 15.5 / 2 * math.sin(math.radians(82)) + 0.9)
    sc.render.resolution_x = WIDTH
    sc.render.resolution_y = WIDTH
    camera((0, -40, 13), (0, 2.5, 8.2), lens=55)
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("done", OUT)
