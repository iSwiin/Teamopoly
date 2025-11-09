from sqlalchemy import Column, String, Integer, Float, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DB_URL = "sqlite:///./teamopoly.db"
engine = create_engine(DB_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()

class Project(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True)  # owner/repo
    name = Column(String)
    repo = Column(String)  # owner/repo

class Metric(Base):
    __tablename__ = "metrics"
    id = Column(String, primary_key=True)  # project|user
    project_id = Column(String)
    user_login = Column(String)
    prs_opened = Column(Integer, default=0)
    prs_merged = Column(Integer, default=0)
    reviews_given = Column(Integer, default=0)
    issues_closed = Column(Integer, default=0)
    small_prs = Column(Integer, default=0)
    mega_prs = Column(Integer, default=0)
    coverage_delta = Column(Float, default=0.0)
    review_response_hours = Column(Float, default=0.0)
    writing = Column(Integer, default=0)
    coding = Column(Integer, default=0)
    reviewing = Column(Integer, default=0)
    planning = Column(Integer, default=0)
    testing = Column(Integer, default=0)

Base.metadata.create_all(engine)
