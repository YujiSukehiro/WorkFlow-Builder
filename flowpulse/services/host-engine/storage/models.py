from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class Project(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str = Field(default="Untitled Process")
    visual_mode: str = Field(default="sticky-workshop")
    yjs_state_blob: Optional[bytes] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ConversationTurn(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: str = Field(index=True)
    speaker: str
    transcript: str
    mutated_ids_json: str = Field(default="[]")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
