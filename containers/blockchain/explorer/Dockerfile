FROM python:3.11-alpine

WORKDIR /app

COPY index.html ./
COPY server.py ./

EXPOSE 5100

CMD ["python3", "server.py"]
