"""AI assistant for the dashboard: Google Gemini with tools over Vision Vault's own data.

Text only: no camera frames are sent to the model (footage stays in the home).
Read tools answer from the events/people tables and the live engine state.
Write tools never change anything: they return a PendingAction that the
frontend shows as a Confirm card and then runs through the normal REST API.

Only `make_client`, `_to_contents`, `_generate` and `provider_error` know about Gemini.
The tools, the PendingAction logic and the bounded loop in `run_chat` are
provider-neutral and testable with a fake `generate` function (no network).
"""
import json
from datetime import date, datetime, time as dtime, timedelta, timezone
from typing import Optional

from api import (STATUSES, _incident, _iso, _rows, dashboard_summary,
                 people_list)
from rules import FAMILY, GUEST, SECURITY_LEVELS, valid_person_name
from vault_utils import FACES_DIR, env

DEFAULT_MODEL = "gemini-3.5-flash-lite"   # free tier; 3.8-flash allows only 20 requests/day. Override with CHAT_MODEL in .env
MAX_OUTPUT_TOKENS = 8192
MAX_ROUNDS = 6                       # model calls per chat request (bounds the tool loop)
GEMINI_TIMEOUT_MS = 40000           # per Gemini call, no retries; then a "busy" reply
MAX_HISTORY = 20                     # messages kept from the client's history
NOT_CONFIGURED = "Chat is not configured: add GEMINI_API_KEY to .env"
BUSY_REPLY = "Viva Bot is busy right now (Gemini free tier). Try again in a minute."

try:
    from zoneinfo import ZoneInfo
    LOCAL_TZ = ZoneInfo("Asia/Kuala_Lumpur")
except Exception:                    # Windows without the tzdata package; Malaysia has no DST
    LOCAL_TZ = timezone(timedelta(hours=8), "Asia/Kuala_Lumpur")


class ChatNotConfigured(Exception):
    """No GEMINI_API_KEY (or the google-genai package is missing)."""


class ToolError(Exception):
    """Bad tool input; the message goes back to the model as an error result."""


# ---------- time helpers (Asia/Kuala_Lumpur) ----------
def fmt_local(ts) -> Optional[str]:
    """epoch -> '2026-10-20 14:32 (Tue)' in Kuala Lumpur time."""
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, LOCAL_TZ).strftime("%Y-%m-%d %H:%M (%a)")


def parse_local(value, field, end_of_day=False) -> Optional[float]:
    """'2026-10-24T14:00' / '2026-10-24 14:00' / '2026-10-24' (Kuala Lumpur time unless an
    offset is given) -> epoch. A bare date is the start of that day (or its end with
    end_of_day). ''/None -> None. Raises ToolError on anything else."""
    if value is None or not str(value).strip():
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        if len(text) == 10:
            d = date.fromisoformat(text)
            dt = datetime.combine(d, dtime.max if end_of_day else dtime.min)
        else:
            dt = datetime.fromisoformat(text)
    except ValueError:
        raise ToolError(f"{field} must look like 2026-10-24T14:00 (local time), got {value!r}")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=LOCAL_TZ)
    return dt.timestamp()


def iso_or_none(ts):
    return _iso(ts) if ts is not None else None


# ---------- PendingAction builders ----------
def request_action(summary, method, path, body):
    return {"summary": summary, "kind": "request", "method": method,
            "path": path, "body": body}


def add_person_action(summary, prefill):
    return {"summary": summary, "kind": "add_person", "prefill": prefill}


# ---------- tools ----------
class ChatTools:
    """The assistant's tools. Read tools return data; write tools return a PendingAction
    in `self.pending` (latest wins) and never change anything."""

    def __init__(self, engine, faces_dir=None):
        self.engine = engine
        self.faces_dir = faces_dir or getattr(engine, "faces_path", FACES_DIR)
        self.pending = None

    def _incident_brief(self, r):
        i = _incident(r, "")
        out = {"id": int(i["id"]), "time": fmt_local(r["ts"]), "type": i["label"],
               "identity": i["identity"], "status": i["status"],
               "guardNotified": i["guardNotified"], "hasClip": "clipUrl" in i}
        if i.get("notes"):
            out["notes"] = i["notes"]
        return out

    def _person(self, name):
        name = (name or "").strip()
        for p in people_list(self.engine, self.faces_dir):
            if p["name"].lower() == name.lower():
                return p
        return None

    # ----- read -----
    def get_summary(self):
        s = dashboard_summary(self.engine.running)
        return {"incidentsToday": s["incidentsToday"], "totalIncidents": s["totalIncidents"],
                "unresolvedAlerts": s["unresolvedAlerts"],
                "cameraOnline": bool(s["activeCameras"])}

    def list_incidents(self, **kw):
        start = parse_local(kw.get("from"), "from")
        end = parse_local(kw.get("to"), "to", end_of_day=True)
        status = kw.get("status") or None
        if status and status not in STATUSES:
            raise ToolError(f"status must be one of {', '.join(sorted(STATUSES))}")
        limit = max(1, min(int(kw.get("limit") or 20), 50))
        rows = _rows("SELECT * FROM events ORDER BY ts DESC")
        rows = [r for r in rows
                if (start is None or r["ts"] >= start) and (end is None or r["ts"] <= end)
                and (status is None or (r["status"] or "new") == status)]
        return {"matching": len(rows), "shown": min(limit, len(rows)),
                "incidents": [self._incident_brief(r) for r in rows[:limit]]}

    def get_incident(self, id):
        rows = _rows("SELECT * FROM events WHERE id=?", (int(id),))
        if not rows:
            raise ToolError(f"Incident {id} was not found.")
        return self._incident_brief(rows[0])

    def get_live_status(self):
        s = self.engine.get_status()
        sec = self.engine.get_security()
        return {"cameraRunning": s["running"], "fps": s["fps"],
                "unknownInView": s["unknown_count"], "securityLevel": s["security_level"],
                "chosenLevel": sec["level"],
                "highBecause": {"sleep": "sleep time", "away": "away from home"}.get(sec.get("high_reason")),
                "sleepTime": ({"from": sec["night_start"], "until": sec["night_end"]}
                              if sec["night_enabled"] else "off"),
                "awayFromHome": ({"leaving": fmt_local(sec["away_from"]) or "open",
                                  "back": fmt_local(sec["away_to"]) or "not set"}
                                 if sec["away_enabled"] else "off"),
                "peopleInView": s.get("in_view", [])}

    def list_people(self):
        return [{"name": p["name"],
                 "role": "resident" if p["role"] == FAMILY else "visitor",
                 "validFrom": fmt_local(_epoch(p["validFrom"])),
                 "validTo": fmt_local(_epoch(p["validTo"])),
                 "allowedNow": p["active"],
                 "lastSeen": fmt_local(_epoch(p["lastSeen"]))}
                for p in people_list(self.engine, self.faces_dir)]

    def where_is(self, name):
        p = self._person(name)
        if p is None:
            return {"answer": f"{name} is not registered as a resident or visitor."}
        in_view = {v["name"].lower() for v in self.engine.get_status().get("in_view", [])}
        if p["name"].lower() in in_view:
            return {"answer": f"{p['name']} is at the front door right now (in camera view)."}
        seen = _epoch(p["lastSeen"])
        if seen is None:
            return {"answer": f"{p['name']} has not been seen at the front door since "
                              "the system was last started."}
        return {"answer": f"{p['name']} was last seen at the front door at {fmt_local(seen)}.",
                "note": "There is only one camera, so this is the last time they passed it."}

    # ----- write: build a PendingAction only -----
    def review_incident(self, id, status, notes=None):
        if status not in STATUSES:
            raise ToolError(f"status must be one of {', '.join(sorted(STATUSES))}")
        rows = _rows("SELECT * FROM events WHERE id=?", (int(id),))
        if not rows:
            raise ToolError(f"Incident {id} was not found.")
        if notes is None:
            notes = rows[0]["notes"]    # PATCH replaces notes, so keep the existing ones
        label = status.replace("_", " ")
        self.pending = request_action(
            f"Mark incident #{int(id)} as {label}" + (f' with note "{notes}"' if notes else ""),
            "PATCH", f"/api/incidents/{int(id)}", {"status": status, "notes": notes})
        return self.pending

    def add_or_update_guest(self, name, valid_from=None, valid_to=None):
        name = (name or "").strip()
        start = parse_local(valid_from, "valid_from")
        end = parse_local(valid_to, "valid_to")
        if start is not None and end is not None and start > end:
            raise ToolError("valid_from must be before valid_to.")
        window = (f"from {fmt_local(start) or 'now'} to {fmt_local(end) or 'no end'}")
        body = {"validFrom": iso_or_none(start), "validTo": iso_or_none(end)}
        p = self._person(name)
        if p is not None:
            note = " (currently a resident: this makes them a visitor)" if p["role"] == FAMILY else ""
            self.pending = request_action(
                f"Allow visitor {p['name']} {window}{note}",
                "PATCH", f"/api/people/{p['id']}", {"role": GUEST, **body})
        else:
            if not valid_person_name(name):
                raise ToolError("Name may only contain letters, digits, spaces, '-' and '_' "
                                "(max 40 characters).")
            self.pending = add_person_action(
                f"Register new visitor {name} {window} (needs a photo)",
                {"name": name, "role": GUEST, **body})
        return self.pending

    def who_is_home(self):
        """Residents home / out from the family tracker (camera inside, facing the front door)."""
        from api import family_status
        return [{"name": p["name"], "status": p["status"],
                 "since": fmt_local(_epoch(p["since"])), "lastSeen": fmt_local(_epoch(p["lastSeen"]))}
                for p in family_status(self.engine)]

    def set_security_level(self, level):
        if level not in SECURITY_LEVELS:
            raise ToolError(f"level must be one of {', '.join(SECURITY_LEVELS)}")
        self.pending = request_action(f"Switch security level to {level.capitalize()}",
                                      "PUT", "/api/security", {"level": level})
        return self.pending

    def set_away_from_home(self, leaving=None, back=None, enabled=True):
        """Away-from-home dates (e.g. a vacation): High for the whole range."""
        if enabled is False:
            self.pending = request_action("Turn off away from home (back to the chosen level)",
                                          "PUT", "/api/security", {"away": {"enabled": False}})
            return self.pending
        start = parse_local(leaving, "leaving")
        end = parse_local(back, "back", end_of_day=True)   # "back on the 28th" = all of the 28th
        if start is not None and end is not None and start >= end:
            raise ToolError("leaving must be before back.")
        summary = (f"Away from home from {fmt_local(start) or 'now'} until "
                   f"{fmt_local(end) or 'you turn it off'}: security level High")
        self.pending = request_action(summary, "PUT", "/api/security", {"away": {
            "enabled": True, "from": iso_or_none(start), "to": iso_or_none(end)}})
        return self.pending

    # ----- dispatch -----
    def run(self, name, args):
        """Execute a tool by name -> (result_dict, is_error)."""
        fn = getattr(self, name, None) if name in TOOL_NAMES else None
        if fn is None:
            return {"error": f"Unknown tool {name!r}."}, True
        try:
            result = fn(**(args or {}))
        except ToolError as e:
            return {"error": str(e)}, True
        except (TypeError, ValueError) as e:
            return {"error": f"Bad arguments for {name}: {e}"}, True
        if name in WRITE_TOOLS:
            return {"prepared": result["summary"],
                    "note": "Not done yet: the user must press Confirm in the chat."}, False
        return result, False


def _epoch(iso):
    if not iso:
        return None
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


# ---------- tool definitions for the model ----------
_LOCAL_DT = "Local time (Asia/Kuala_Lumpur), e.g. 2026-10-24T14:00, or a date 2026-10-24."
TOOLS = [
    {"name": "get_summary",
     "description": "Counts of incidents today, in total, and still unresolved; whether the camera is online.",
     "parameters": None},
    {"name": "list_incidents",
     "description": "List recorded incidents (unknown person = 'intrusion', visitor outside allowed "
                    "time = 'guest_outside_window'), newest first. Use for questions like "
                    "'what happened at the door today?'.",
     "parameters": {"type": "object", "properties": {
         "from": {"type": "string", "description": "Start. " + _LOCAL_DT},
         "to": {"type": "string", "description": "End (a bare date includes the whole day). " + _LOCAL_DT},
         "status": {"type": "string", "enum": sorted(STATUSES)},
         "limit": {"type": "integer", "description": "Max incidents to return (default 20, max 50)."}}}},
    {"name": "get_incident",
     "description": "Details of one incident by id.",
     "parameters": {"type": "object", "properties": {"id": {"type": "integer"}},
                      "required": ["id"]}},
    {"name": "get_live_status",
     "description": "Live camera state right now: who is in view (name + kind: family, "
                    "guest_allowed, guest_outside, unknown), unknown count, security level, FPS.",
     "parameters": None},
    {"name": "list_people",
     "description": "Registered residents and visitors with visitor time windows, whether each is "
                    "allowed now, and when they were last seen at the front door.",
     "parameters": None},
    {"name": "where_is",
     "description": "Where a resident or visitor is, answered from the front-door camera: "
                    "in view now, or when they were last seen.",
     "parameters": {"type": "object", "properties": {"name": {"type": "string"}},
                      "required": ["name"]}},
    {"name": "review_incident",
     "description": "Prepare a review of an incident (status + optional notes) for the user to "
                    "confirm. Does not change anything by itself.",
     "parameters": {"type": "object", "properties": {
         "id": {"type": "integer"},
         "status": {"type": "string", "enum": sorted(STATUSES)},
         "notes": {"type": "string", "description": "Omit to keep the existing notes."}},
         "required": ["id", "status"]}},
    {"name": "add_or_update_guest",
     "description": "Prepare registering a visitor or changing a visitor's allowed time window, for "
                    "the user to confirm. Works for new and existing names; a new visitor still "
                    "needs a photo, which the user adds in the form that opens.",
     "parameters": {"type": "object", "properties": {
         "name": {"type": "string"},
         "valid_from": {"type": "string", "description": "Window start, omit for open-ended. " + _LOCAL_DT},
         "valid_to": {"type": "string", "description": "Window end, omit for open-ended. " + _LOCAL_DT}},
         "required": ["name"]}},
    {"name": "who_is_home",
     "description": "Which residents are home or out right now, and since when (family tracker: the "
                    "camera inside the front door sees people arrive and leave; 'unknown' = not seen yet).",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "set_security_level",
     "description": "Prepare switching the security level for the user to confirm. normal = default "
                    "(alert 3 s after an unknown person appears); high = alert after 1 s with a stricter "
                    "face match. The guard house is alerted at both levels.",
     "parameters": {"type": "object", "properties": {
         "level": {"type": "string", "enum": list(SECURITY_LEVELS)}},
         "required": ["level"]}},
    {"name": "set_away_from_home",
     "description": "Prepare the away-from-home dates (a trip or vacation) for the user to confirm. "
                    "Between leaving and back the camera is in High security. Use enabled=false to "
                    "turn it off early (when they are back).",
     "parameters": {"type": "object", "properties": {
         "leaving": {"type": "string", "description": "When they leave, omit for now. " + _LOCAL_DT},
         "back": {"type": "string", "description": "When they are back home, omit if unknown "
                  "(High stays on until turned off). A bare date includes the whole day. " + _LOCAL_DT},
         "enabled": {"type": "boolean", "description": "false = turn away from home off."}}}},
]
TOOL_NAMES = {t["name"] for t in TOOLS}
WRITE_TOOLS = {"review_incident", "add_or_update_guest", "set_security_level",
               "set_away_from_home"}

SYSTEM = """You are Viva Bot, the AI assistant inside Vision Vault, a smart home security dashboard for one home \
in a township. One camera watches the front door. Residents (family) pass silently; registered \
visitors are allowed inside their time window; an unknown person alerts the homeowner and the \
township guard house.

How to answer:
- Use the tools for every fact about incidents, people, and the live camera. Never invent data.
- You only get text from the tools; you cannot see the camera. If asked to look at the video, say so.
- There is only one camera, so locating someone means "last seen at the front door at 14:32".
- Say "residents" and "visitors" (never "guests"), and "guard house".
- High security is used automatically during the sleep time and while the family is away from \
home (set_away_from_home, e.g. for a vacation).
- Write tools (review_incident, add_or_update_guest, set_security_level, set_away_from_home) only \
prepare an action. \
After calling one, tell the user to press Confirm; never say it is already done.
- Pass dates to tools as local time like 2026-10-24T14:00. Resolve words like "today" or \
"Saturday 2-6pm" against the current time below; if a date is ambiguous, ask.
- Keep replies short: one to four sentences of plain text, no Markdown tables. Use 24-hour times."""


def system_prompt(now_ts) -> str:
    now = datetime.fromtimestamp(now_ts, LOCAL_TZ)
    return (SYSTEM + f"\n\nCurrent local time (Asia/Kuala_Lumpur): "
            f"{now.strftime('%A %d %B %Y, %H:%M')} ({now.strftime('%Y-%m-%dT%H:%M')}).")


# ---------- Gemini (the only provider-specific code) ----------
def make_client():
    """google-genai client, or ChatNotConfigured if there is no key / no SDK."""
    key = env("GEMINI_API_KEY")
    if not key:
        raise ChatNotConfigured(NOT_CONFIGURED)
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise ChatNotConfigured(NOT_CONFIGURED + " (and run: py -m pip install google-genai)")
    # fail fast when the free tier is overloaded: the SDK default (5 attempts, no timeout) hangs for minutes
    return genai.Client(api_key=key, http_options=types.HttpOptions(
        timeout=GEMINI_TIMEOUT_MS, retry_options=types.HttpRetryOptions(attempts=1)))


def _to_contents(history):
    """Neutral history -> Gemini Contents. Model turns that called tools are replayed exactly
    as received (`raw`), so Gemini 3 thought signatures survive."""
    from google.genai import types
    contents = []
    for h in history:
        if h["role"] == "tool":
            # Gemini takes function responses in a "user" turn ("tool" is rejected with 400)
            contents.append(types.Content(role="user", parts=[
                types.Part(function_response=types.FunctionResponse(
                    id=r["id"], name=r["name"], response=r["response"]))
                for r in h["results"]]))
        elif h.get("raw") is not None:
            contents.append(h["raw"])
        else:
            contents.append(types.Content(role="user" if h["role"] == "user" else "model",
                                          parts=[types.Part(text=h["text"])]))
    return contents


def _generate(client, model, history, system):
    """One Gemini call with automatic function calling OFF.
    Returns {text, calls: [{id, name, args}], raw, blocked, truncated}."""
    from google.genai import types
    declarations = [types.FunctionDeclaration(name=t["name"], description=t["description"],
                                              parameters_json_schema=t["parameters"])
                    for t in TOOLS]
    response = client.models.generate_content(
        model=model, contents=_to_contents(history),
        config=types.GenerateContentConfig(
            system_instruction=system,
            tools=[types.Tool(function_declarations=declarations)],
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            max_output_tokens=MAX_OUTPUT_TOKENS))
    candidate = response.candidates[0] if response.candidates else None
    truncated = candidate is not None and candidate.finish_reason == types.FinishReason.MAX_TOKENS
    if candidate is None or candidate.content is None or not candidate.content.parts:
        return {"text": "", "calls": [], "raw": None, "truncated": truncated,
                "blocked": not truncated}
    parts = candidate.content.parts
    calls = [{"id": p.function_call.id, "name": p.function_call.name,
              "args": dict(p.function_call.args or {})} for p in parts if p.function_call]
    text = "".join(p.text for p in parts if p.text and not p.thought).strip()
    return {"text": text, "calls": calls, "raw": candidate.content, "blocked": False,
            "truncated": truncated}


def provider_error(e):
    """Map a Gemini/network error to (http_status, json_body), or None if it isn't one.
    Free-tier quota (429 / RESOURCE_EXHAUSTED) becomes a normal busy reply, not an error."""
    import httpx
    from google.genai import errors
    if isinstance(e, errors.APIError):
        if e.code in (429, 503) or e.status in ("RESOURCE_EXHAUSTED", "UNAVAILABLE"):
            return 200, {"reply": BUSY_REPLY, "pendingAction": None}
        if isinstance(e, errors.ClientError):
            return 502, {"detail": f"The AI service rejected the request ({e.code} {e.status}): "
                                   f"{e.message} Check GEMINI_API_KEY and CHAT_MODEL in .env."}
        return 502, {"detail": f"The AI service is unavailable ({e.code}). Try again later."}
    if isinstance(e, httpx.TimeoutException):
        return 200, {"reply": BUSY_REPLY, "pendingAction": None}
    if isinstance(e, httpx.HTTPError):
        return 502, {"detail": "Could not reach the AI service. Check the internet connection."}
    return None


# ---------- the loop (provider-neutral) ----------
def clean_history(messages):
    """Plain-text history -> neutral history: last MAX_HISTORY, no empty text, starts with user."""
    out = [{"role": m["role"], "text": m["content"]} for m in messages
           if m.get("role") in ("user", "assistant") and str(m.get("content") or "").strip()]
    out = out[-MAX_HISTORY:]
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


def run_chat(messages, engine, generate=None, now=None):
    """One chat turn -> {reply, pendingAction}. `messages` = [{role, content}] (plain text).
    `generate(history, system)` returns {text, calls, raw, blocked, truncated}; by default it is
    a real Gemini call. Tests pass a fake."""
    history = clean_history(messages)
    if not history:
        raise ValueError("messages must contain at least one non-empty user message.")
    if generate is None:
        client, model = make_client(), env("CHAT_MODEL", DEFAULT_MODEL)
        generate = lambda h, s: _generate(client, model, h, s)
    tools = ChatTools(engine)
    system = system_prompt(now if now is not None else datetime.now().timestamp())

    reply = None
    for _ in range(MAX_ROUNDS):
        turn = generate(history, system)
        if turn["blocked"]:
            reply = "Sorry, I can't help with that request."
            break
        if not turn["calls"]:
            reply = turn["text"]
            if not reply and turn["truncated"]:
                reply = "Sorry, that answer got too long. Please ask something more specific."
            break
        # replay the model turn unchanged, then answer every call in one tool turn
        history.append({"role": "model", "raw": turn["raw"]})
        results = []
        for call in turn["calls"]:
            result, is_error = tools.run(call["name"], call["args"])
            results.append({"id": call["id"], "name": call["name"],
                            "response": result if is_error else {"result": result}})
        history.append({"role": "tool", "results": results})
    else:
        reply = ("I prepared the action below." if tools.pending else
                 "Sorry, I couldn't finish that. Please try a simpler question.")
    if not reply:
        reply = "Please confirm the action below." if tools.pending else "Done."
    return {"reply": reply, "pendingAction": tools.pending}
