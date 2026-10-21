"""Verification test suite for headless sandraschi/blender-mcp generated GLB 3D assets."""

import json
import struct
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_ROOT / "services" / "frontend" / "public" / "models"


def parse_glb_json(glb_path: Path) -> dict:
    """Parse the embedded glTF 2.0 JSON chunk from a binary .glb file."""
    assert glb_path.exists(), f"Missing GLB file: {glb_path}"
    data = glb_path.read_bytes()
    assert len(data) > 28, f"GLB file too small: {glb_path}"

    magic, version, total_len = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF", f"Invalid GLB magic header in {glb_path}: {magic}"
    assert version == 2, f"Expected glTF v2 in {glb_path}, got {version}"
    assert total_len == len(data), f"Length mismatch in {glb_path}"

    chunk_len, chunk_type = struct.unpack_from("<I4s", data, 12)
    assert chunk_type == b"JSON", f"First chunk must be JSON in {glb_path}"
    json_bytes = data[20 : 20 + chunk_len]
    return json.loads(json_bytes.decode("utf-8"))


def test_all_four_glb_models_exist_and_have_valid_hierarchy():
    expected_models = {
        "mecha_bird.glb": {"Chassis", "LeftWing", "RightWing", "ThrusterCore"},
        "cyber_pipe.glb": {"ConduitColumn", "CollarRing", "CollarGlow"},
        "plasma_orb.glb": {"Core", "InnerRing", "OuterRing"},
        "cyber_city.glb": {"Megastructure", "TrenchPlate"},
    }

    for filename, required_nodes in expected_models.items():
        path = MODELS_DIR / filename
        gltf = parse_glb_json(path)
        node_names = {node.get("name", "") for node in gltf.get("nodes", [])}
        for req in required_nodes:
            assert any(
                req in name for name in node_names
            ), f"Model {filename} missing required node '{req}'. Found nodes: {sorted(node_names)}"
        assert len(gltf.get("meshes", [])) >= 2, f"Model {filename} should have multiple meshes"
        assert len(gltf.get("materials", [])) >= 2, f"Model {filename} should have PBR materials"


if __name__ == "__main__":
    test_all_four_glb_models_exist_and_have_valid_hierarchy()
    print("ALL GLB ASSET TESTS PASSED!")
