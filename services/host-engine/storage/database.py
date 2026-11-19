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
        cols = {
            row[1]
            for row in conn.exec_driver_sql("PRAGMA table_info(project);").fetchall()
        }
        if cols:
            if "active_phase" not in cols:
                conn.exec_driver_sql(
                    "ALTER TABLE project ADD COLUMN active_phase INTEGER NOT NULL DEFAULT 2;"
                )
            if "board_json" not in cols:
                conn.exec_driver_sql(
                    "ALTER TABLE project ADD COLUMN board_json TEXT NOT NULL DEFAULT '{}';"
                )
            conn.commit()


def get_session() -> Session:
    return Session(engine)
