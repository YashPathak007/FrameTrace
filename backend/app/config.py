from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    database_url: str = 'sqlite:///./frametrace.db'
    secret_key: str = 'development-only-change-me'
    storage_dir: str = '/var/lib/frametrace/uploads'
    max_upload_bytes: int = 104857600
    model_version: str = 'frametrace-baseline-0.1'
    cors_origin: str = 'http://localhost:5175'
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
settings = Settings()
