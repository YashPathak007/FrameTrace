from datetime import datetime,timedelta,timezone
from fastapi import Depends,HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt,JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from .models import User
pwd=CryptContext(schemes=['bcrypt'],deprecated='auto'); oauth=OAuth2PasswordBearer(tokenUrl='/api/auth/login')
def hash_password(value): return pwd.hash(value)
def verify_password(value,hashed): return pwd.verify(value,hashed)
def token(user): return jwt.encode({'sub':str(user.id),'email':user.email,'exp':datetime.now(timezone.utc)+timedelta(hours=2)},settings.secret_key,algorithm='HS256')
def current_user(t:str=Depends(oauth),db:Session=Depends(get_db)):
    try: user_id=int(jwt.decode(t,settings.secret_key,algorithms=['HS256'])['sub'])
    except (JWTError,KeyError,ValueError): raise HTTPException(401,'Invalid or expired session')
    user=db.get(User,user_id)
    if not user: raise HTTPException(401,'User not found')
    return user
