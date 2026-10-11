from pathlib import Path
from app.analysis import BaselineModel, file_type

def test_model_is_deterministic():
    model=BaselineModel(); assert model.predict([.1,.2,.3,.4,0])==model.predict([.1,.2,.3,.4,0]); assert model.version

def test_supported_media_types():
    assert file_type(Path('frame.jpg'))=='image'; assert file_type(Path('clip.mp4'))=='video'; assert file_type(Path('payload.exe')) is None
