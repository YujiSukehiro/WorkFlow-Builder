from engine.crud_rules import (
    validate_concise_label,
    compress_label_for_ai,
    allocate_next_step_number,
    allocate_inserted_step_numbers,
    normalize_section_by_fives,
    build_compact_graph_digest,
)


def test_word_compression_guardrail():
    cleaned, ok = validate_concise_label("The Purchase Order Was Issued")
    assert cleaned == "Purchase Order Issued"
    assert ok is True
    over_cleaned, over_ok = validate_concise_label("Regional Operations Director Reviews Monthly Budget Variance")
    assert over_ok is False
    assert len(compress_label_for_ai(over_cleaned).split()) <= 4


def test_allocate_next_step_by_fives():
    edges = []
    assert allocate_next_step_number(edges, 200) == 205
    edges.append({"sectionPrefix": 200, "stepNumber": 205})
    assert allocate_next_step_number(edges, 200) == 210
    edges.append({"sectionPrefix": 200, "stepNumber": 212})
    assert allocate_next_step_number(edges, 200) == 215


def test_insert_step_between_midpoint_and_exhausted_gap():
    assert allocate_inserted_step_numbers(210, [215, 220]) == (210, 212, False)
    assert allocate_inserted_step_numbers(210, [211]) == (210, 215, True)


def test_topological_normalize_by_fives():
    nodes = [{"id": "a"}, {"id": "b"}, {"id": "c"}, {"id": "d"}]
    edges = [
        {"id": "e1", "sourceNodeId": "a", "targetNodeId": "b", "sectionPrefix": 200, "stepNumber": 210},
        {"id": "e2", "sourceNodeId": "b", "targetNodeId": "c", "sectionPrefix": 200, "stepNumber": 212},
        {"id": "e3", "sourceNodeId": "c", "targetNodeId": "d", "sectionPrefix": 200, "stepNumber": 215},
    ]
    norm = normalize_section_by_fives(nodes, edges, 200)
    assert {e["id"]: e["stepNumber"] for e in norm} == {"e1": 205, "e2": 210, "e3": 215}


def test_compact_graph_digest_tracks_open_leaves_and_flags():
    sections = [{"prefix": 100, "name": "Intake"}]
    nodes = [
        {"id": "n1", "label": "Need Established", "sectionPrefix": 0, "kind": "trigger"},
        {"id": "n2", "label": "Quote Checked", "sectionPrefix": 100, "kind": "step", "hasProblem": True},
    ]
    edges = [{"id": "e1", "sourceNodeId": "n1", "targetNodeId": "n2", "sectionPrefix": 100, "stepNumber": 105, "crud": "C"}]
    digest = build_compact_graph_digest(sections, nodes, edges, selected_node_id="n2")
    assert "OPEN_UNFINISHED_LEAVES: [n2]" in digest
    assert "[RED_PROBLEM]" in digest
