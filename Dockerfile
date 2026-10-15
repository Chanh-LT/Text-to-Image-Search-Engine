FROM python:3.11-slim

WORKDIR /app

# Cai dat dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy ma nguon
COPY . .

# Port mac dinh
EXPOSE 8000
ENV PORT=8000

# Khoi chay FastAPI server
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
