from pathlib import Path
from sqlmodel import SQLModel, Session, create_engine

DATA_DIR = Path.home() / ".flowpulse"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "flowpulse.db"

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA journal_mode=WAL;")


def get_session() -> Session:
    return Session(engine)
