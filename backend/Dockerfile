FROM python:3.12-slim
RUN apt-get update && apt-get install -y libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.5.1+cpu && pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY tests ./tests
COPY pytest.ini .
RUN mkdir -p /var/lib/frametrace/uploads
EXPOSE 4100
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","4100"]
