"""D-85 — graph 가 문서로 옮겨 온 청크가 **프롬프트에 실리는가**.

🔴 **무엇을 무는가.** O-33 이 투영한 doc-chunk 는 근거집합(`evidence_ids`)에는 들어갔지만
   `build_evidence_text` 가 훑는 세 키(`structuredEvidence`·`citations`·`graphPaths`)에는
   없었다. 그래서 모델은 그 청크를 **볼 수 없었고**(인용을 «안» 한 게 아니라 «못» 했다),
   억지로 인용했다면 게이트웨이가 `인용 id 가 준 근거 밖이다` 로 **답 전체**를 버렸다.
   실측(#778 raw): 근거집합 23건인데 인용은 `GP-…-03/04`(경로)로 나갔다.

🔴 **가장 중요한 케이스는 「vector 가 살아남는가」**(`test_vector_citations_survive_…`).
   3줄짜리 대안은 투영분을 `citations` 에 **병합**해 싣는 것이었는데, 그 키는 vector 단계의
   것이라 병합을 빠뜨리는 날 vector 5건이 **조용히** 사라진다. 그 미래를 이 케이스가 문다.

실행: `pytest tests_unit/test_graph_document_citations.py`(cwd = `services/ai-api`)
"""

from __future__ import annotations

from app.investigation.live_synthesis import _MAX_EXCERPT, build_evidence_text

SOP_ID = "DOC-SOP-0014@r2#001"
SAF_ID = "DOC-SAF-0029@r3#000"
VECTOR_IDS = [f"DOC-MAN-0021@r1#{i:03d}" for i in (1, 5, 6)] + ["DOC-MAN-0022@r1#003", "DOC-MAN-0028@r1#000"]


def _state(**over):
    base = {
        "structuredEvidence": [{"evidenceId": "EQ-CNC-204", "kind": "record", "excerpt": "설비"}],
        "citations": {i: f"매뉴얼 본문 {i}" for i in VECTOR_IDS},
        "graphPaths": [
            {
                "evidenceId": "GP-run-03",
                "targetId": "SOP-BRG-INSP-014",
                "label": "SOP",
                "hops": 3,
                "nodes": ["AL-1", "SOP-BRG-INSP-014"],
                "edges": [],
            }
        ],
    }
    base.update(over)
    return base


def test_projected_chunks_reach_the_prompt():
    """투영 키가 있으면 그 id 와 본문이 evidenceText 에 실린다."""
    text = build_evidence_text(_state(graphDocumentCitations={SOP_ID: "3.1 안전 조치…", SAF_ID: "LOTO 규정…"}))
    assert SOP_ID in text and SAF_ID in text
    assert text[SOP_ID].startswith("3.1 안전 조치")
    assert text[SAF_ID].startswith("LOTO 규정")


def test_absent_key_changes_nothing():
    """🔴 투영이 없던 run 은 **바이트로 같아야** 한다 — 새 키가 기존 발췌를 흔들지 않는다."""
    before = build_evidence_text(_state())
    after = build_evidence_text(_state(graphDocumentCitations={}))
    assert before == after
    assert set(before) == {"EQ-CNC-204", "GP-run-03", *VECTOR_IDS}


def test_vector_citations_survive_alongside_the_projection():
    """🔴 **유실 대조군.** 두 출처가 함께 있을 때 vector 5건이 그대로 남는가.

    이 케이스가 빨강이면 누군가 투영분을 `citations` 로 «병합»하다가 vector 를 덮은 것이다.
    """
    text = build_evidence_text(_state(graphDocumentCitations={SOP_ID: "s", SAF_ID: "f"}))
    for vector_id in VECTOR_IDS:
        assert vector_id in text, f"vector 발췌가 사라졌다: {vector_id}"
    assert len(VECTOR_IDS) == 5
    assert set(text) == {"EQ-CNC-204", "GP-run-03", SOP_ID, SAF_ID, *VECTOR_IDS}


def test_projected_text_obeys_the_same_excerpt_cap():
    """상한은 출처마다 다르지 않다 — `citations` 와 같은 자 수로 자른다."""
    long_text = "가" * (_MAX_EXCERPT + 500)
    text = build_evidence_text(_state(graphDocumentCitations={SOP_ID: long_text}))
    assert len(text[SOP_ID]) == _MAX_EXCERPT


def test_non_string_values_are_ignored_not_crashed():
    """형이 어긋난 값 하나가 run 을 죽이지 않는다(기존 두 키와 같은 규율)."""
    text = build_evidence_text(_state(graphDocumentCitations={SOP_ID: None, 7: "x", SAF_ID: "ok"}))
    assert SOP_ID not in text
    assert text[SAF_ID] == "ok"
