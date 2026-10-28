"""The session recorder writes what happened and never what is private."""

from jagora import trace


def test_log_is_readable_and_keeps_private_values_out(tmp_path, monkeypatch):
    monkeypatch.setattr(trace, "DIR", tmp_path)
    trace.write("u1", "from_app", type="secret", value="[hidden]", task="t")
    trace.write("u1", "heard", text="my account is 0123456789 please")
    trace.write("u1", "agent_act", tool="type_text", args={"password": "hunter2", "text": "hello"})
    trace.sent("u1", {"type": "pcm", "data": "AAAA"})  # audio is not written
    trace.sent("u1", {"type": "msg", "task": "t", "msg": {"kind": "agent", "text": "Found it"}})
    out = trace.download("u1")
    assert "heard" in out and "Found it" in out and "agent_act" in out
    assert "0123456789" not in out and "hunter2" not in out and "AAAA" not in out
    trace.clear("u1")
    assert "No session log yet" in trace.download("u1")
