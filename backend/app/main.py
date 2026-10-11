import shutil,time
from pathlib import Path
from fastapi import FastAPI,Depends,File,HTTPException,Request,UploadFile,BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import desc,select
from sqlalchemy.orm import Session
from .config import settings
from .db import Base,engine,get_db,SessionLocal
from .models import User,MediaFile,Analysis,FrameFinding
from .schemas import Login,Register,Rename
from .security import current_user,hash_password,verify_password,token
from .analysis import file_type,run_analysis,ALLOWED_IMAGE,ALLOWED_VIDEO
import uuid
app=FastAPI(title='FrameTrace API',version='0.1.0'); app.add_middleware(CORSMiddleware,allow_origins=[settings.cors_origin],allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
def clean(name): return Path(name).name.replace('..','_')[:180]
def out_file(f): return {'id':f.id,'original_name':f.original_name,'media_type':f.media_type,'content_type':f.content_type,'size_bytes':f.size_bytes,'width':f.width,'height':f.height,'duration_seconds':f.duration_seconds,'created_at':f.created_at}
def out_analysis(a): return {'id':a.id,'file':out_file(a.file),'status':a.status,'model_version':a.model_version,'model_score':a.model_score,'confidence':a.confidence,'category':a.category,'summary':a.summary,'result':a.result_json,'error':a.error,'processing_ms':a.processing_ms,'created_at':a.created_at,'updated_at':a.updated_at}
def process(analysis_id:int,path:str,media_type:str):
    db=SessionLocal(); a=db.get(Analysis,analysis_id); a.status='PROCESSING'; db.commit()
    try:
        result=run_analysis(Path(path),media_type); a.status='COMPLETED';a.model_score=result['model_score'];a.confidence=result['confidence'];a.category=result['category'];a.summary=result['summary'];a.processing_ms=result['processing_ms'];a.result_json=result
        for frame in result.get('frame_findings',[]): db.add(FrameFinding(analysis_id=a.id,frame_index=frame['frame_index'],timestamp_seconds=frame['timestamp_seconds'],score=frame['score'],findings=frame['findings']))
        db.commit()
    except Exception as e:
        a.status='FAILED';a.error=str(e);db.commit()
    finally: db.close()
@app.on_event('startup')
def startup():
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        if settings.database_url.startswith('postgresql'):
            connection.exec_driver_sql("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100) NOT NULL DEFAULT 'Analyst'")
    Path(settings.storage_dir).mkdir(parents=True,exist_ok=True)
@app.get('/api/health')
def health(db:Session=Depends(get_db)): db.execute(select(1)); return {'status':'ok','database':'ok','model_version':settings.model_version}
@app.post('/api/auth/register')
def register(payload:Register,db:Session=Depends(get_db)):
    if len(payload.password)<10: raise HTTPException(422,'Password must be at least 10 characters')
    if db.scalar(select(User).where(User.email==payload.email.lower())): raise HTTPException(409,'Email already registered')
    u=User(email=payload.email.lower(),display_name=payload.display_name,password_hash=hash_password(payload.password));db.add(u);db.commit();db.refresh(u);return {'token':token(u),'user':{'id':u.id,'email':u.email,'display_name':u.display_name}}
@app.post('/api/auth/login')
def login(payload:Login,db:Session=Depends(get_db)):
    u=db.scalar(select(User).where(User.email==payload.email.lower()))
    if not u or not verify_password(payload.password,u.password_hash): raise HTTPException(401,'Invalid email or password')
    return {'token':token(u),'user':{'id':u.id,'email':u.email,'display_name':u.display_name}}
@app.get('/api/files')
def files(db:Session=Depends(get_db),user:User=Depends(current_user)): return {'items':[out_file(f) for f in db.scalars(select(MediaFile).where(MediaFile.owner_id==user.id).order_by(desc(MediaFile.created_at))).all()]}
@app.post('/api/files')
async def upload(request:Request,file:UploadFile=File(...),db:Session=Depends(get_db),user:User=Depends(current_user)):
    if file.size and file.size>settings.max_upload_bytes: raise HTTPException(413,'File exceeds the size limit')
    media=file_type(Path(file.filename or '')); content=(file.content_type or '').lower()
    if not media: raise HTTPException(422,'Unsupported extension; use JPG, PNG, WEBP, MP4, MOV, AVI, or MKV')
    if media=='image' and not content.startswith('image/'): raise HTTPException(422,'Image MIME type does not match extension')
    if media=='video' and not content.startswith('video/'): raise HTTPException(422,'Video MIME type does not match extension')
    data=await file.read(settings.max_upload_bytes+1)
    if len(data)>settings.max_upload_bytes: raise HTTPException(413,'File exceeds the size limit')
    ident=uuid.uuid4().hex; stored=f'{ident}{Path(file.filename).suffix.lower()}'; path=Path(settings.storage_dir)/stored;path.write_bytes(data)
    width=height=None;duration=None
    if media=='image':
        import cv2; image=cv2.imread(str(path));
        if image is None: path.unlink();raise HTTPException(422,'File signature is not a decodable image')
        height,width=image.shape[:2]
    f=MediaFile(owner_id=user.id,original_name=clean(file.filename),stored_name=stored,media_type=media,content_type=content,size_bytes=len(data),width=width,height=height,duration_seconds=duration);db.add(f);db.commit();db.refresh(f)
    a=Analysis(file_id=f.id,owner_id=user.id,model_version=settings.model_version,status='QUEUED');db.add(a);db.commit();db.refresh(a)
    return {'file':out_file(f),'analysis_id':a.id,'status':a.status}
@app.get('/api/analyses')
def analyses(db:Session=Depends(get_db),user:User=Depends(current_user)): return {'items':[out_analysis(a) for a in db.scalars(select(Analysis).where(Analysis.owner_id==user.id).order_by(desc(Analysis.created_at))).all()]}
@app.post('/api/analyses/{analysis_id}/start')
def start(analysis_id:int,bg:BackgroundTasks,db:Session=Depends(get_db),user:User=Depends(current_user)):
    a=db.scalar(select(Analysis).where(Analysis.id==analysis_id,Analysis.owner_id==user.id));
    if not a: raise HTTPException(404,'Analysis not found')
    if a.status in ('PROCESSING','COMPLETED'): return out_analysis(a)
    a.status='QUEUED';db.commit();bg.add_task(process,a.id,str(Path(settings.storage_dir)/a.file.stored_name),a.file.media_type);return out_analysis(a)
@app.get('/api/analyses/{analysis_id}')
def analysis(analysis_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
    a=db.scalar(select(Analysis).where(Analysis.id==analysis_id,Analysis.owner_id==user.id));
    if not a: raise HTTPException(404,'Analysis not found')
    return out_analysis(a)
@app.patch('/api/files/{file_id}')
def rename(file_id:int,payload:Rename,db:Session=Depends(get_db),user:User=Depends(current_user)):
    f=db.scalar(select(MediaFile).where(MediaFile.id==file_id,MediaFile.owner_id==user.id));
    if not f: raise HTTPException(404,'File not found')
    f.original_name=clean(payload.name);db.commit();return out_file(f)
@app.delete('/api/analyses/{analysis_id}')
def delete_analysis(analysis_id:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
    a=db.scalar(select(Analysis).where(Analysis.id==analysis_id,Analysis.owner_id==user.id));
    if not a: raise HTTPException(404,'Analysis not found')
    db.delete(a);db.commit();return {'deleted':True}
