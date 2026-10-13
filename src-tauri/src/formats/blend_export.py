# Runs inside a headless Blender session that is never saved: `blender -b <file> --python-expr <this> -- <out.glb>`.
import sys

import bpy

out = sys.argv[sys.argv.index("--") + 1]
scene = bpy.context.scene

# Objects kept alive only by fake users are in no scene, so the exporter would skip them.
if not any(o.type == "MESH" for o in scene.objects):
    for o in bpy.data.objects:
        if not o.users_collection:
            scene.collection.objects.link(o)


def unlinked_input(node, names):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None and not socket.is_linked:
            return socket.default_value
    return None


# glTF cannot express custom node-group shaders; stand in a Principled BSDF built from the group's inputs.
for mat in bpy.data.materials:
    if not mat.use_nodes or mat.node_tree is None:
        continue
    nodes = mat.node_tree.nodes
    outputs = [n for n in nodes if n.type == "OUTPUT_MATERIAL"]
    output = next((n for n in outputs if n.is_active_output), outputs[0] if outputs else None)
    if output is None or not output.inputs["Surface"].links:
        continue
    source = output.inputs["Surface"].links[0].from_node
    if source.type != "GROUP":
        continue

    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    base = unlinked_input(source, ("Base Color", "Color", "Albedo"))
    if base is None:
        colors = [tuple(s.default_value) for s in source.inputs if s.type == "RGBA" and not s.is_linked]
        if colors:
            base = tuple(sum(c[i] for c in colors) / len(colors) for i in range(4))
    if base is not None:
        bsdf.inputs["Base Color"].default_value = base
    rough = unlinked_input(source, ("Roughness", "Rough"))
    if rough is not None:
        bsdf.inputs["Roughness"].default_value = rough
    metal = unlinked_input(source, ("Metallic", "Metal"))
    if metal is not None:
        bsdf.inputs["Metallic"].default_value = metal
    mat.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

try:
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True)
except TypeError:
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB")
