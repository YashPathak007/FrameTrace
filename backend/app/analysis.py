import json, time
from pathlib import Path
import cv2, numpy as np, torch
from PIL import Image, ExifTags
from .config import settings

ALLOWED_IMAGE={'.jpg','.jpeg','.png','.webp'}; ALLOWED_VIDEO={'.mp4','.mov','.avi','.mkv'}
class BaselineModel:
    """Deterministic PyTorch baseline over measurable forensic features.

    This is a research baseline, not a trained manipulation classifier. Its output is
    a model prediction used alongside signals and is intentionally presented as probabilistic.
    """
    def __init__(self):
        self.version=settings.model_version
        self.model=torch.nn.Sequential(torch.nn.Linear(5,1),torch.nn.Sigmoid())
        with torch.no_grad():
            self.model[0].weight.copy_(torch.tensor([[0.65,0.45,0.35,0.55,0.25]])); self.model[0].bias.fill_(-1.15)
        self.model.eval()
    def predict(self, features: list[float])->float:
        with torch.no_grad(): return float(self.model(torch.tensor([features],dtype=torch.float32))[0,0])
model=BaselineModel()
def file_type(path:Path):
    ext=path.suffix.lower(); return 'image' if ext in ALLOWED_IMAGE else 'video' if ext in ALLOWED_VIDEO else None
def image_signals(path:Path):
    image=cv2.imread(str(path),cv2.IMREAD_COLOR)
    if image is None: raise ValueError('The file is not a decodable image')
    height,width=image.shape[:2]
    if width<32 or height<32 or width>12000 or height>12000: raise ValueError('Image dimensions are outside supported limits')
    gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY); lap=float(cv2.Laplacian(gray,cv2.CV_64F).var()); noise=float(np.std(gray.astype(np.float32)-cv2.GaussianBlur(gray,(0,0),1.2)))
    jpeg=cv2.imencode('.jpg',image,[cv2.IMWRITE_JPEG_QUALITY,90])[1]; recompressed=cv2.imdecode(jpeg,cv2.IMREAD_COLOR); compression=float(np.mean(np.abs(image.astype(np.float32)-recompressed.astype(np.float32))))
    hsv=cv2.cvtColor(image,cv2.COLOR_BGR2HSV); saturation=float(np.std(hsv[:,:,1]))
    features=[min(compression/30,1),min(noise/30,1),min(lap/1500,1),min(saturation/100,1),1.0 if image.shape[1]%16 or image.shape[0]%16 else 0.0]
    score=model.predict(features)
    findings=[{'name':'JPEG recompression residual','value':round(compression,3),'severity':'medium' if compression>8 else 'low','interpretation':'Difference after quality-90 recompression; elevated values can indicate editing or repeated encoding, but are not specific.'},{'name':'Noise residual','value':round(noise,3),'severity':'medium' if noise>12 else 'low','interpretation':'High-frequency residual variation across the image.'},{'name':'Laplacian texture variance','value':round(lap,3),'severity':'low','interpretation':'A sharpness/texture measurement used as context, not an authenticity proof.'}]
    metadata=[]
    try:
        pil=Image.open(path); exif=pil.getexif(); metadata=[{'name':'EXIF metadata','value':len(exif),'severity':'low' if exif else 'medium','interpretation':'Metadata presence or absence is contextual; it cannot establish authenticity.'}]
    except Exception: metadata=[{'name':'EXIF metadata','value':0,'severity':'medium','interpretation':'Metadata could not be read.'}]
    return {'width':width,'height':height,'features':features,'model_score':score,'confidence':abs(score-.5)*2,'findings':findings,'metadata_findings':metadata}
def frame_image(frame):
    temp=np.zeros((frame.shape[0],frame.shape[1],3),dtype=np.uint8); cv2.imwrite('/tmp/frametrace-frame.jpg',frame); return image_signals(Path('/tmp/frametrace-frame.jpg'))
def video_analysis(path:Path, sample_count=12):
    capture=cv2.VideoCapture(str(path));
    if not capture.isOpened(): raise ValueError('The file is not a decodable video')
    fps=float(capture.get(cv2.CAP_PROP_FPS) or 0); count=int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0); duration=count/fps if fps else 0
    if duration<=0 or duration>900 or count<=0: capture.release(); raise ValueError('Video duration or frame count is outside supported limits')
    indices=np.linspace(0,count-1,min(sample_count,count),dtype=int); frames=[]; previous=None; duplicates=0
    for index in indices:
        capture.set(cv2.CAP_PROP_POS_FRAMES,int(index)); ok,frame=capture.read()
        if not ok: continue
        result=frame_image(frame); score=result['model_score']; timestamp=index/fps if fps else 0
        if previous is not None and float(np.mean(cv2.absdiff(previous,frame)))<1.0: duplicates+=1
        previous=frame; frames.append({'frame_index':int(index),'timestamp_seconds':round(timestamp,3),'score':score,'findings':result['findings']})
    capture.release(); aggregate=float(np.mean([f['score'] for f in frames])) if frames else .5; transitions=duplicates/max(len(frames)-1,1)
    return {'fps':fps,'frame_count':count,'duration_seconds':duration,'sampled_frames':len(frames),'model_score':aggregate,'confidence':abs(aggregate-.5)*2,'frame_findings':frames,'findings':[{'name':'Repeated sampled frames','value':round(transitions,3),'severity':'medium' if transitions>.3 else 'low','interpretation':'Repeated frames can be normal in edited or static footage; inspect timestamps in context.'}], 'metadata_findings':[{'name':'Video metadata','value':{'fps':round(fps,3),'frame_count':count},'severity':'low','interpretation':'Container metadata is descriptive and can be rewritten.'}]}
def run_analysis(path:Path,media_type:str):
    started=time.perf_counter(); result=image_signals(path) if media_type=='image' else video_analysis(path); score=float(result['model_score']); category='manipulation-likelihood' if score>=.65 else 'authentic-likelihood' if score<=.35 else 'inconclusive'; result.update({'category':category,'model_version':model.version,'processing_ms':int((time.perf_counter()-started)*1000),'summary':'Potential manipulation indicators were measured. Automated analysis is probabilistic and should not be treated as definitive proof.'})
    return result
