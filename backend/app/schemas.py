from pydantic import BaseModel,Field
class Login(BaseModel): email:str; password:str
class Register(Login): display_name:str=Field(min_length=2,max_length=100)
class Rename(BaseModel): name:str=Field(min_length=1,max_length=255)
