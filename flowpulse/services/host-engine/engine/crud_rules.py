from collections import deque
from typing import Any

FILLER_WORDS = {"the", "a", "an", "is", "was", "are", "were", "be", "been", "being"}


def validate_concise_label(label: str, max_words: int = 4) -> tuple[str, bool]:
    tokens = [t for t in label.strip().split() if t]
    if not tokens:
        return ("Untitled Step", True)
    filtered = [
        w for idx, w in enumerate(tokens)
        if w.lower().strip(".,:;!?()[]") not in FILLER_WORDS or len(tokens) <= 2 or idx == len(tokens) - 1
    ]
    cleaned_tokens = filtered if filtered else tokens
    return " ".join(cleaned_tokens), len(cleaned_tokens) <= max_words


def compress_label_for_ai(label: str) -> str:
    cleaned, ok = validate_concise_label(label, max_words=4)
    return cleaned if ok else " ".join(cleaned.split()[:4])


def allocate_next_step_number(edges: list[dict[str, Any]], section_prefix: int) -> int:
    sec_steps = [int(e["stepNumber"]) for e in edges if int(e.get("sectionPrefix", 0)) == section_prefix]
    if not sec_steps:
        return section_prefix + 5
    max_step = max(sec_steps)
    rem = max_step % 5
    return max_step + 5 if rem == 0 else max_step + (5 - rem)


def allocate_inserted_step_numbers(prev_step: int, next_downstream_steps: list[int]) -> tuple[int, int, bool]:
    valid_downstream = [s for s in next_downstream_steps if s > prev_step]
    next_num = min(valid_downstream) if valid_downstream else (prev_step + 10)
    gap = next_num - prev_step
    if gap >= 2:
        return prev_step, prev_step + (gap // 2), False
    return prev_step, prev_step + 5, True


def normalize_section_by_fives(
    nodes: list[dict[str, Any]], edges: list[dict[str, Any]], section_prefix: int | None = None
) -> list[dict[str, Any]]:
    in_deg = {n["id"]: 0 for n in nodes}
    adj: dict[str, list[str]] = {n["id"]: [] for n in nodes}
    for e in edges:
        src, dst = e["sourceNodeId"], e["targetNodeId"]
        if src in adj and dst in in_deg:
            adj[src].append(dst)
            in_deg[dst] += 1

    q = deque([nid for nid, deg in in_deg.items() if deg == 0])
    topo_rank: dict[str, int] = {}
    rank = 0
    while q:
        curr = q.popleft()
        topo_rank[curr] = rank
        rank += 1
        for nxt in adj.get(curr, []):
            in_deg[nxt] -= 1
            if in_deg[nxt] == 0:
                q.append(nxt)

    prefixes = [section_prefix] if section_prefix is not None else sorted({int(e["sectionPrefix"]) for e in edges})
    updated = {e["id"]: dict(e) for e in edges}
    for pfx in prefixes:
        sec_edges = sorted(
            [e for e in edges if int(e["sectionPrefix"]) == pfx],
            key=lambda e: (topo_rank.get(e["sourceNodeId"], 9999), int(e["stepNumber"])),
        )
        for idx, edge in enumerate(sec_edges):
            updated[edge["id"]]["stepNumber"] = pfx + (idx + 1) * 5
    return list(updated.values())


def build_compact_graph_digest(
    sections: list[dict[str, Any]],
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    selected_node_id: str | None = None,
    active_phase: int = 2,
) -> str:
    node_map = {n["id"]: n for n in nodes}
    sources = {e["sourceNodeId"] for e in edges}
    open_leaves = [n["id"] for n in nodes if n.get("kind") != "terminal" and n["id"] not in sources]
    selected_str = "None"
    if selected_node_id and selected_node_id in node_map:
        sn = node_map[selected_node_id]
        selected_str = f'{sn["id"]} ("{sn["label"]}" in {sn["sectionPrefix"]}s)'

    sec_str = ", ".join(f'{s["prefix"]}:{s["name"]}' for s in sorted(sections, key=lambda x: int(x["prefix"])))
    edge_lines = []
    for e in sorted(edges, key=lambda x: int(x["stepNumber"])):
        target = node_map.get(e["targetNodeId"], {})
        cond = f' ({e["condition"]})' if e.get("condition") else ""
        flags = []
        if target.get("isSlow"):
            flags.append("BLUE_SLOW")
        if target.get("hasProblem"):
            flags.append("RED_PROBLEM")
        flag_suffix = f" [{','.join(flags)}]" if flags else ""
        edge_lines.append(
            f'- {e["sourceNodeId"]} --[{e["stepNumber"]} {e["crud"]}{cond}]--> {e["targetNodeId"]} ("{target.get("label", "?")}"){flag_suffix}'
        )

    return "\n".join([
        f"ACTIVE_PHASE: {active_phase} (100s +5 & CRUD)",
        f"USER_SELECTED_NODE: {selected_str}",
        f"OPEN_UNFINISHED_LEAVES: [{', '.join(open_leaves)}]",
        f"SECTIONS: {sec_str or '0:Trigger'}",
        "EDGES:",
        "\n".join(edge_lines) if edge_lines else "(none yet)",
    ])
