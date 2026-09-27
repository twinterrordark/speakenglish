"""Stilize İngilizce öğretmeni karakterini (Ms. Emma) üretir ve GLB olarak dışa aktarır.

Kullanım:
  blender -b --factory-startup -P blender/build_teacher.py -- <cikti.glb> [onizleme_klasoru]
"""
import bpy
import bmesh
import json
import math
import os
import struct
import sys
from mathutils import Euler, Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_PATH = os.path.abspath(argv[0] if argv else "teacher.glb")
PREVIEW_DIR = os.path.abspath(argv[1]) if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
collection = scene.collection


# ---------------------------------------------------------------- materials
def srgb(hex_color):
    h = hex_color.lstrip("#")
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return (*lin, 1.0)


def material(name, hex_color, roughness=0.6, metallic=0.0):
    m = bpy.data.materials.new(name)
    if m.node_tree is None:
        m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = srgb(hex_color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    m.diffuse_color = srgb(hex_color)
    return m


MAT = {
    "skin": material("Skin", "#F2C3A0", 0.55),
    "blush": material("Blush", "#F09A93", 0.6),
    "hair": material("Hair", "#4A2C1F", 0.45),
    "blouse": material("Blouse", "#3FA7A0", 0.7),
    "collar": material("Collar", "#F5F1E8", 0.7),
    "skirt": material("Skirt", "#2E3A59", 0.75),
    "tights": material("Tights", "#3B3B4F", 0.6),
    "shoes": material("Shoes", "#6B3E26", 0.35),
    "eyeWhite": material("EyeWhite", "#FFFFFF", 0.3),
    "iris": material("Iris", "#3A2718", 0.2),
    "glasses": material("Glasses", "#1E1E24", 0.3, 0.6),
    "mouth": material("Mouth", "#A8413F", 0.5),
    "brows": material("Brows", "#3A2418", 0.6),
}


# ---------------------------------------------------------------- geometry
def m_place(center, scale=(1, 1, 1), rot_deg=(0, 0, 0)):
    return (Matrix.Translation(Vector(center))
            @ Euler([math.radians(a) for a in rot_deg]).to_matrix().to_4x4()
            @ Matrix.Diagonal((*scale, 1)))


def m_between(p1, p2, radius):
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    return Matrix.Translation((p1 + p2) / 2) @ rot @ Matrix.Diagonal((radius, radius, d.length, 1))


class Part:
    """Birden fazla primitiften oluşan, tek kemiğe bağlı mesh nesnesi."""

    def __init__(self, name, bone):
        self.name, self.bone = name, bone
        self.bm = bmesh.new()
        self.mats = []

    def _finish_prim(self, verts, matrix, mat):
        bmesh.ops.transform(self.bm, matrix=matrix, verts=verts)
        if mat not in self.mats:
            self.mats.append(mat)
        idx = self.mats.index(mat)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = idx
        return verts

    def sphere(self, matrix, mat, seg=32, rings=16):
        r = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=1.0)
        return self._finish_prim(r["verts"], matrix, mat)

    def cone(self, matrix, mat, r1=1.0, r2=1.0, seg=28, caps=True):
        r = bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg,
                                  radius1=r1, radius2=r2, depth=1.0)
        return self._finish_prim(r["verts"], matrix, mat)

    def torus(self, matrix, mat, major=1.0, minor=0.15, seg=32, ring_seg=12):
        """Z eksenli torus (XY düzleminde)."""
        grid = []
        for i in range(seg):
            u = 2 * math.pi * i / seg
            row = []
            for j in range(ring_seg):
                v = 2 * math.pi * j / ring_seg
                rr = major + minor * math.cos(v)
                row.append(self.bm.verts.new((rr * math.cos(u), rr * math.sin(u), minor * math.sin(v))))
            grid.append(row)
        for i in range(seg):
            for j in range(ring_seg):
                a, b = grid[i][j], grid[(i + 1) % seg][j]
                c, d = grid[(i + 1) % seg][(j + 1) % ring_seg], grid[i][(j + 1) % ring_seg]
                self.bm.faces.new((a, b, c, d))
        return self._finish_prim([v for row in grid for v in row], matrix, mat)

    def build(self, armature):
        mesh = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        for p in mesh.polygons:
            p.use_smooth = True
        for m in self.mats:
            mesh.materials.append(m)
        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        obj.parent = armature
        vg = obj.vertex_groups.new(name=self.bone)
        vg.add(list(range(len(mesh.vertices))), 1.0, "REPLACE")
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = armature
        return obj


def add_shape_key(obj, name, fn):
    if obj.data.shape_keys is None:
        obj.shape_key_add(name="Basis", from_mix=False)
    key = obj.shape_key_add(name=name, from_mix=False)
    key.value = 0.0  # Blender 5.x yeni anahtarları 1.0 ile başlatıyor
    for i, v in enumerate(obj.data.vertices):
        key.data[i].co = fn(v.co.copy())


# ---------------------------------------------------------------- armature
BONES = {
    # isim: (baş, kuyruk, ebeveyn)
    "root": ((0, 0, 0), (0, 0, 0.25), None),
    "hips": ((0, 0, 0.95), (0, 0, 1.10), "root"),
    "spine": ((0, 0, 1.10), (0, 0, 1.30), "hips"),
    "chest": ((0, 0, 1.30), (0, 0, 1.48), "spine"),
    "neck": ((0, 0, 1.48), (0, 0, 1.58), "chest"),
    "head": ((0, 0, 1.58), (0, 0, 1.98), "neck"),
}
for side, sx in (("L", 1), ("R", -1)):
    BONES.update({
        f"upper_arm_{side}": ((0.20 * sx, 0, 1.46), (0.235 * sx, 0, 1.17), "chest"),
        f"forearm_{side}": ((0.235 * sx, 0, 1.17), (0.255 * sx, 0, 0.94), f"upper_arm_{side}"),
        f"hand_{side}": ((0.255 * sx, 0, 0.94), (0.262 * sx, 0, 0.84), f"forearm_{side}"),
        f"thigh_{side}": ((0.085 * sx, 0, 0.95), (0.085 * sx, 0, 0.55), "hips"),
        f"shin_{side}": ((0.085 * sx, 0, 0.55), (0.085 * sx, 0, 0.10), f"thigh_{side}"),
        f"foot_{side}": ((0.085 * sx, 0, 0.10), (0.085 * sx, -0.12, 0.04), f"shin_{side}"),
    })

arm_data = bpy.data.armatures.new("TeacherRig")
arm = bpy.data.objects.new("Teacher", arm_data)
collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
for name, (h, t, parent) in BONES.items():
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = h, t
    if parent:
        eb.parent = arm_data.edit_bones[parent]
        eb.use_connect = False
bpy.ops.object.mode_set(mode="OBJECT")


# ---------------------------------------------------------------- body parts
HEAD_C = Vector((0, 0, 1.76))
HEAD_R = 0.20

head = Part("Head", "head")
head.sphere(m_place(HEAD_C, (HEAD_R,) * 3), MAT["skin"], 48, 24)
head.sphere(m_place((0, -0.197, 1.745), (0.021, 0.02, 0.023)), MAT["skin"])  # burun
for sx in (1, -1):
    head.sphere(m_place((0.11 * sx, -0.158, 1.715), (0.03, 0.01, 0.019)), MAT["blush"])
    head.sphere(m_place((0.07 * sx, -0.165, 1.862), (0.032, 0.008, 0.0075), (0, -8 * sx, 0)), MAT["brows"])
head.build(arm)

hair = Part("Hair", "head")
cap = hair.sphere(m_place((0, 0.012, 1.775), (0.217, 0.217, 0.222)), MAT["hair"], 48, 24)
face_hole = [v for v in cap if (v.co.y < -0.06 and v.co.z < 1.87) or v.co.z < 1.60]
bmesh.ops.delete(hair.bm, geom=face_hole, context="VERTS")
hair.sphere(m_place((0, 0.11, 1.975), (0.085, 0.08, 0.08)), MAT["hair"])  # topuz
hair.sphere(m_place((0.05, -0.17, 1.9), (0.13, 0.055, 0.045), (0, 18, -10)), MAT["hair"])  # perçem
hair.build(arm)

eyes = Part("Eyes", "head")
glasses = Part("Glasses", "head")
EYE_Z = 1.79
for sx in (1, -1):
    ex = 0.07 * sx
    eyes.sphere(m_place((ex, -0.168, EYE_Z), (0.036, 0.029, 0.041)), MAT["eyeWhite"])
    eyes.sphere(m_place((ex, -0.193, EYE_Z - 0.003), (0.021, 0.01, 0.024)), MAT["iris"])
    eyes.sphere(m_place((ex - 0.007 * sx, -0.2035, EYE_Z + 0.008), (0.0065,) * 3), MAT["eyeWhite"], 12, 6)
    glasses.torus(m_place((ex, -0.207, EYE_Z), rot_deg=(90, 0, 0)), MAT["glasses"], 0.05, 0.0065)
    glasses.cone(m_between((0.119 * sx, -0.203, 1.80), (0.2 * sx, -0.02, 1.80), 0.005), MAT["glasses"], seg=10)
glasses.cone(m_between((-0.021, -0.21, 1.797), (0.021, -0.21, 1.797), 0.0055), MAT["glasses"], seg=10)
eyes_obj = eyes.build(arm)
glasses.build(arm)
add_shape_key(eyes_obj, "blink", lambda co: Vector((co.x, co.y, EYE_Z + (co.z - EYE_Z) * 0.08)))

MOUTH_C = Vector((0, -0.183, 1.685))
mouth = Part("Mouth", "head")
mouth.sphere(m_place(MOUTH_C, (0.042, 0.012, 0.009)), MAT["mouth"])
mouth_obj = mouth.build(arm)
# Hafif gülümseyen varsayılan şekil: köşeleri yukarı kaldır.
for v in mouth_obj.data.vertices:
    v.co.z += 4.0 * v.co.x ** 2


def mouth_open(co):
    return Vector((co.x * 0.88, co.y, MOUTH_C.z - 0.004 + (co.z - MOUTH_C.z) * 3.2))


def mouth_round(co):
    return Vector((co.x * 0.5, co.y, MOUTH_C.z - 0.002 + (co.z - MOUTH_C.z) * 2.4))


def mouth_smile(co):
    return Vector((co.x * 1.12, co.y, co.z + 7.0 * co.x ** 2 - 0.002))


add_shape_key(mouth_obj, "mouthOpen", mouth_open)
add_shape_key(mouth_obj, "mouthRound", mouth_round)
add_shape_key(mouth_obj, "smile", mouth_smile)

neck = Part("Neck", "neck")
neck.cone(m_between((0, 0, 1.46), (0, 0, 1.63), 0.05), MAT["skin"], caps=False)
neck.build(arm)

TORSO_C, TORSO_S = Vector((0, 0, 1.26)), (0.2, 0.13, 0.27)
torso = Part("Torso", "chest")
torso.sphere(m_place(TORSO_C, TORSO_S), MAT["blouse"], 40, 20)
torso.torus(m_place((0, 0, 1.495)), MAT["collar"], 0.062, 0.016)
for bz in (1.39, 1.29, 1.19):
    ratio = (bz - TORSO_C.z) / TORSO_S[2]
    by = -TORSO_S[1] * math.sqrt(1 - ratio ** 2) - 0.002
    torso.sphere(m_place((0, by, bz), (0.011, 0.006, 0.011)), MAT["collar"], 12, 6)
torso.build(arm)

skirt = Part("Skirt", "hips")
skirt.cone(m_between((0, 0, 0.62), (0, 0, 1.08), 1.0), MAT["skirt"], r1=0.27, r2=0.165, seg=40, caps=False)
skirt.build(arm)

for side, sx in (("L", 1), ("R", -1)):
    ua = Part(f"UpperArm_{side}", f"upper_arm_{side}")
    ua.sphere(m_place((0.195 * sx, 0, 1.445), (0.058,) * 3), MAT["blouse"])
    ua.cone(m_between((0.2 * sx, 0, 1.46), (0.235 * sx, 0, 1.17), 0.043), MAT["blouse"], caps=False)
    ua.sphere(m_place((0.235 * sx, 0, 1.17), (0.043,) * 3), MAT["blouse"])
    ua.build(arm)

    fa = Part(f"Forearm_{side}", f"forearm_{side}")
    fa.cone(m_between((0.235 * sx, 0, 1.17), (0.255 * sx, 0, 0.945), 1.0), MAT["blouse"], r1=0.04, r2=0.036, caps=False)
    fa.torus(m_place((0.255 * sx, 0, 0.95), rot_deg=(0, -5 * sx, 0)), MAT["collar"], 0.037, 0.008)
    fa.build(arm)

    hand = Part(f"Hand_{side}", f"hand_{side}")
    hand.sphere(m_place((0.26 * sx, -0.004, 0.895), (0.037, 0.027, 0.05)), MAT["skin"])
    hand.sphere(m_place((0.25 * sx, -0.03, 0.91), (0.014, 0.014, 0.022), (20, 0, 0)), MAT["skin"])
    hand.build(arm)

    leg = Part(f"Thigh_{side}", f"thigh_{side}")
    leg.cone(m_between((0.085 * sx, 0, 0.97), (0.085 * sx, 0, 0.55), 0.052), MAT["tights"], caps=False)
    leg.build(arm)

    shin = Part(f"Shin_{side}", f"shin_{side}")
    shin.sphere(m_place((0.085 * sx, 0, 0.55), (0.048,) * 3), MAT["tights"])
    shin.cone(m_between((0.085 * sx, 0, 0.55), (0.085 * sx, 0, 0.07), 1.0), MAT["tights"], r1=0.048, r2=0.038, caps=False)
    shin.build(arm)

    foot = Part(f"Shoe_{side}", f"foot_{side}")
    foot.sphere(m_place((0.085 * sx, -0.035, 0.045), (0.052, 0.095, 0.042)), MAT["shoes"])
    foot.build(arm)


# ---------------------------------------------------------------- animation
REST_Q = {b.name: b.matrix_local.to_quaternion() for b in arm_data.bones}


def local_quat(bone, deg):
    """Armatür eksenlerinde (X sağ/sol, Y arka, Z yukarı) verilen dönüşü kemik uzayına çevirir."""
    r = REST_Q[bone]
    q = Euler([math.radians(a) for a in deg], "XYZ").to_quaternion()
    return r.inverted() @ q @ r


BASE = {  # Hafif açık kollar, dirsekler bükük
    "upper_arm_L": (0, -7, 0), "upper_arm_R": (0, 7, 0),
    "forearm_L": (-10, 0, 0), "forearm_R": (-10, 0, 0),
}


def key_pose(frame, rots):
    pose = {**BASE, **rots}
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = local_quat(pb.name, pose[pb.name]) if pb.name in pose else Quaternion()
        pb.keyframe_insert("rotation_quaternion", frame=frame)


def make_action(name, keys):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    for frame, rots in keys:
        key_pose(frame, rots)
    return act


arm.animation_data_create()

make_action("Idle", [
    (1, {}),
    (30, {"head": (1, 0, 4), "chest": (-1.2, 0, 0)}),
    (60, {"head": (2, 3, 0), "spine": (0, 1.5, 0), "upper_arm_L": (0, -9, 0), "upper_arm_R": (0, 9, 0)}),
    (90, {"head": (1, 0, -4), "chest": (-1.2, 0, 0)}),
    (120, {}),
])

TALK_A = {"upper_arm_L": (-15, -12, 0), "upper_arm_R": (-15, 12, 0),
          "forearm_L": (-55, 0, -15), "forearm_R": (-55, 0, 15)}
make_action("Talk", [
    (1, TALK_A),
    (22, {**TALK_A, "forearm_L": (-72, 0, -20), "forearm_R": (-45, 0, 10),
          "head": (4, 0, -4), "chest": (0, 0, 3)}),
    (45, {**TALK_A, "upper_arm_L": (-20, -16, 0), "upper_arm_R": (-10, 10, 0),
          "forearm_L": (-50, 0, -10), "forearm_R": (-74, 0, 22), "head": (-2, 2, 4), "chest": (0, 0, -3)}),
    (68, {**TALK_A, "forearm_L": (-66, 0, -18), "forearm_R": (-56, 0, 14), "head": (3, 0, 0)}),
    (90, TALK_A),
])

WAVE_UP = {"upper_arm_R": (-10, 125, 0), "head": (0, 6, 0)}
make_action("Wave", [
    (1, {}),
    (10, {**WAVE_UP, "forearm_R": (0, 45, 0)}),
    (17, {**WAVE_UP, "forearm_R": (0, 18, 0)}),
    (24, {**WAVE_UP, "forearm_R": (0, 62, 0)}),
    (31, {**WAVE_UP, "forearm_R": (0, 18, 0)}),
    (38, {**WAVE_UP, "forearm_R": (0, 62, 0)}),
    (45, {**WAVE_UP, "forearm_R": (0, 40, 0)}),
    (60, {}),
])

make_action("Nod", [
    (1, {}),
    (8, {"head": (14, 0, 0), "neck": (4, 0, 0)}),
    (15, {"head": (-2, 0, 0)}),
    (22, {"head": (10, 0, 0), "neck": (3, 0, 0)}),
    (30, {}),
])

arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.rotation_quaternion = Quaternion()


# ---------------------------------------------------------------- export
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT_PATH,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_morph=True,
    export_skins=True,
    export_yup=True,
)


def summarize_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + length])
    targets = {m["name"]: m.get("extras", {}).get("targetNames", []) for m in gltf["meshes"]}
    return {
        "bytes": len(data),
        "nodes": len(gltf["nodes"]),
        "joints": len(gltf["skins"][0]["joints"]) if gltf.get("skins") else 0,
        "meshes": len(gltf["meshes"]),
        "morphs": {k: v for k, v in targets.items() if v},
        "animations": {a["name"]: len(a["channels"]) for a in gltf.get("animations", [])},
    }


print("GLB_SUMMARY " + json.dumps(summarize_glb(OUT_PATH)))


# ---------------------------------------------------------------- previews
if PREVIEW_DIR:
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    collection.objects.link(cam)
    cam.location = (0.9, -3.4, 1.35)
    cam.rotation_euler = (Vector((0, 0, 1.05)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50
    scene.camera = cam
    for name, loc, energy in (("Key", (1.5, -2.5, 3.0), 600), ("Fill", (-2.5, -2.0, 2.0), 250)):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, "POINT"))
        light.data.energy = energy
        light.location = loc
        collection.objects.link(light)
    world = bpy.data.worlds.new("World")
    scene.world = world
    if world.node_tree is None:
        world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = srgb("#E8E2D6")
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 640, 800
    for action_name, frame in (("Idle", 1), ("Wave", 24), ("Talk", 22)):
        arm.animation_data.action = bpy.data.actions[action_name]
        scene.frame_set(frame)
        scene.render.filepath = os.path.join(PREVIEW_DIR, f"preview_{action_name.lower()}.png")
        bpy.ops.render.render(write_still=True)
